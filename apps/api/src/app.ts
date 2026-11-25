import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { AnthropicWriter, loadProductConfig } from "@ipe/core";
import type { ProductConfig, Writer } from "@ipe/core";
import { defaultEngine } from "@ipe/sim";
import type { Engine } from "@ipe/sim";
import { adminTokenMatches, hashKey, newApiKey, requireCompany } from "./auth.ts";
import type { Db } from "./db.ts";
import { ingestMonitoring, monitoringSeries } from "./services/aftercare.ts";
import type { DayInput } from "./services/aftercare.ts";
import { HttpError, createProposal, proposalYear } from "./services/proposals.ts";

export interface AppOptions {
  db: Db;
  engine?: Engine;
  config?: ProductConfig;
  writer?: Writer | null;
  adminToken?: string;
  logger?: boolean;
}

const face = {
  type: "object",
  required: ["azimuthDeg", "tiltDeg", "areaM2"],
  additionalProperties: false,
  properties: {
    azimuthDeg: { type: "number", minimum: 0, maximum: 360 },
    tiltDeg: { type: "number", minimum: 0, maximum: 70 },
    areaM2: { type: "number", exclusiveMinimum: 0, maximum: 400 },
    horizonDeg: { type: "array", items: { type: "number", minimum: 0, maximum: 90 }, anyOf: [{ minItems: 0, maxItems: 0 }, { minItems: 36, maxItems: 36 }] },
  },
} as const;

const projectBody = {
  type: "object",
  required: ["customerName", "latDeg", "lonDeg", "statedConsumptionKwh"],
  additionalProperties: false,
  properties: {
    customerName: { type: "string", minLength: 1, maxLength: 200 },
    latDeg: { type: "number", minimum: 35, maximum: 60 },
    lonDeg: { type: "number", minimum: -10, maximum: 30 },
    statedConsumptionKwh: { type: "integer", minimum: 500, maximum: 50000 },
    heatPump: { type: "object", required: ["livingAreaM2", "buildingYear"], additionalProperties: false, properties: { livingAreaM2: { type: "integer", minimum: 30, maximum: 1000 }, buildingYear: { type: "integer", minimum: 1800, maximum: 2100 } } },
    ev: { type: "object", required: ["kmPerYear"], additionalProperties: false, properties: { kmPerYear: { type: "integer", minimum: 0, maximum: 100000 } } },
    budgetEur: { type: "integer", minimum: 1000, maximum: 500000 },
    faces: { type: "array", maxItems: 6, items: face },
  },
} as const;

interface ProjectInput {
  customerName: string; latDeg: number; lonDeg: number; statedConsumptionKwh: number;
  heatPump?: { livingAreaM2: number; buildingYear: number }; ev?: { kmPerYear: number }; budgetEur?: number;
  faces?: { azimuthDeg: number; tiltDeg: number; areaM2: number; horizonDeg?: number[] }[];
}

export function writerFromEnv(config: ProductConfig): Writer | null {
  const key = process.env.ANTHROPIC_API_KEY;
  return key ? new AnthropicWriter(key, config.offer.model) : null;
}

export function buildApp(opts: AppOptions): FastifyInstance {
  const db = opts.db;
  const config = opts.config ?? loadProductConfig();
  const engine = opts.engine ?? defaultEngine();
  const writer = opts.writer === undefined ? writerFromEnv(config) : opts.writer;
  const deps = { db, engine, config, writer };
  const app = Fastify({ logger: opts.logger ?? false, bodyLimit: 5 * 1024 * 1024 });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof HttpError) return reply.code(err.status).send({ error: err.message });
    const e = err as { validation?: unknown; statusCode?: number; message: string };
    if (e.validation) return reply.code(400).send({ error: e.message });
    app.log.error(err);
    return reply.code(e.statusCode && e.statusCode < 500 ? e.statusCode : 500).send({ error: e.statusCode && e.statusCode < 500 ? e.message : "internal error" });
  });

  app.get("/healthz", async () => ({ ok: true, engine: engine.name }));
  app.get("/readyz", async (_req, reply) => {
    try { await db.$queryRaw`SELECT 1`; return { ok: true }; } catch { return reply.code(503).send({ ok: false }); }
  });

  app.post<{ Body: { name: string } }>("/v1/companies", {
    schema: { body: { type: "object", required: ["name"], properties: { name: { type: "string", minLength: 1, maxLength: 200 } } } },
  }, async (req, reply) => {
    if (!adminTokenMatches(req.headers["x-admin-token"], opts.adminToken ?? process.env.ADMIN_TOKEN)) return reply.code(403).send({ error: "admin token required" });
    const apiKey = newApiKey();
    const company = await db.company.create({ data: { name: req.body.name, apiKeyHash: hashKey(apiKey) } });
    return reply.code(201).send({ id: company.id, name: company.name, apiKey });
  });

  app.register(async (scoped) => {
    scoped.addHook("preHandler", requireCompany(db));

    scoped.post<{ Body: ProjectInput }>("/v1/projects", { schema: { body: projectBody } }, async (req, reply) => {
      const b = req.body;
      const project = await db.project.create({
        data: {
          companyId: req.companyId, customerName: b.customerName, latDeg: b.latDeg, lonDeg: b.lonDeg, statedConsumptionKwh: b.statedConsumptionKwh,
          heatPumpAreaM2: b.heatPump?.livingAreaM2, heatPumpBuildingYear: b.heatPump?.buildingYear, evKmPerYear: b.ev?.kmPerYear, budgetEur: b.budgetEur,
          status: b.faces?.length ? "PLANNED" : "LEAD",
          faces: { create: (b.faces ?? []).map((f, position) => ({ position, azimuthDeg: f.azimuthDeg, tiltDeg: f.tiltDeg, areaM2: f.areaM2, horizonDeg: f.horizonDeg ?? [] })) },
        },
        include: { faces: true },
      });
      return reply.code(201).send(project);
    });

    scoped.get<{ Querystring: { status?: string; limit?: number } }>("/v1/projects", {
      schema: { querystring: { type: "object", properties: { status: { type: "string", enum: ["LEAD", "PLANNED", "OFFERED", "SIGNED", "INSTALLED"] }, limit: { type: "integer", minimum: 1, maximum: 200, default: 100 } } } },
    }, async (req) => {
      const projects = await db.project.findMany({
        where: { companyId: req.companyId, ...(req.query.status ? { status: req.query.status as "LEAD" } : {}) },
        orderBy: { createdAt: "desc" },
        take: req.query.limit ?? 100,
        include: {
          proposals: { orderBy: { version: "desc" }, take: 1, select: { id: true, version: true, kwp: true, batteryKwh: true, priceEur: true, promisedSavingsEur: true, paybackYears: true, status: true } },
          _count: { select: { alarms: true } },
        },
      });
      return { projects };
    });

    scoped.get<{ Params: { id: string } }>("/v1/projects/:id", async (req, reply) => {
      const project = await db.project.findFirst({
        where: { id: req.params.id, companyId: req.companyId },
        include: { faces: { orderBy: { position: "asc" } }, proposals: { orderBy: { version: "desc" } }, alarms: { orderBy: { day: "asc" } } },
      });
      if (!project) return reply.code(404).send({ error: "project not found" });
      return project;
    });

    scoped.get<{ Params: { id: string } }>("/v1/projects/:id/year", async (req) => proposalYear(deps, req.companyId, req.params.id));
    scoped.get<{ Params: { id: string } }>("/v1/projects/:id/monitoring", async (req) => monitoringSeries(deps, req.companyId, req.params.id));

    scoped.put<{ Params: { id: string }; Body: { faces: NonNullable<ProjectInput["faces"]> } }>("/v1/projects/:id/faces", {
      schema: { body: { type: "object", required: ["faces"], properties: { faces: { type: "array", minItems: 1, maxItems: 6, items: face } } } },
    }, async (req, reply) => {
      const project = await db.project.findFirst({ where: { id: req.params.id, companyId: req.companyId }, select: { id: true, status: true } });
      if (!project) return reply.code(404).send({ error: "project not found" });
      const faces = await db.$transaction(async (tx) => {
        await tx.roofFace.deleteMany({ where: { projectId: project.id } });
        await tx.roofFace.createMany({ data: req.body.faces.map((f, position) => ({ projectId: project.id, position, azimuthDeg: f.azimuthDeg, tiltDeg: f.tiltDeg, areaM2: f.areaM2, horizonDeg: f.horizonDeg ?? [] })) });
        if (project.status === "LEAD") await tx.project.update({ where: { id: project.id }, data: { status: "PLANNED" } });
        return tx.roofFace.findMany({ where: { projectId: project.id }, orderBy: { position: "asc" } });
      });
      return { faces };
    });

    scoped.post<{ Params: { id: string } }>("/v1/projects/:id/proposals", async (req, reply) => {
      const key = req.headers["idempotency-key"];
      if (typeof key !== "string" || key.length < 8 || key.length > 128) return reply.code(400).send({ error: "Idempotency-Key header (8-128 characters) is required" });
      const { proposal, replayed } = await createProposal(deps, req.companyId, req.params.id, key);
      return reply.code(replayed ? 200 : 201).header("idempotent-replayed", String(replayed)).send(proposal);
    });

    scoped.post<{ Params: { id: string } }>("/v1/proposals/:id/accept", async (req, reply) => {
      const proposal = await db.proposal.findFirst({ where: { id: req.params.id, project: { companyId: req.companyId } } });
      if (!proposal) return reply.code(404).send({ error: "proposal not found" });
      if (proposal.status === "ACCEPTED") return proposal;
      if (proposal.status === "SUPERSEDED") return reply.code(409).send({ error: "a newer version of this offer exists" });
      const [accepted] = await db.$transaction([
        db.proposal.update({ where: { id: proposal.id }, data: { status: "ACCEPTED" } }),
        db.project.update({ where: { id: proposal.projectId }, data: { status: "SIGNED" } }),
      ]);
      return accepted;
    });

    scoped.post<{ Params: { id: string }; Body: { days: DayInput[] } }>("/v1/projects/:id/monitoring", {
      schema: {
        body: {
          type: "object", required: ["days"],
          properties: { days: { type: "array", minItems: 1, maxItems: 366, items: {
            type: "object", required: ["day", "hourlyKwh"],
            properties: { day: { type: "integer", minimum: 0, maximum: 364 }, hourlyKwh: { type: "array", minItems: 24, maxItems: 24, items: { type: ["number", "null"], minimum: 0 } }, ghiWm2: { type: "array", minItems: 24, maxItems: 24, items: { type: "number", minimum: 0, maximum: 1400 } } },
          } } },
        },
      },
    }, async (req) => ingestMonitoring(deps, req.companyId, req.params.id, req.body.days));

    scoped.post<{ Params: { id: string }; Body: { day: number } }>("/v1/alarms/:id/resolve", {
      schema: { body: { type: "object", required: ["day"], properties: { day: { type: "integer", minimum: 0, maximum: 364 } } } },
    }, async (req, reply) => {
      const alarm = await db.alarm.findFirst({ where: { id: req.params.id, project: { companyId: req.companyId } } });
      if (!alarm) return reply.code(404).send({ error: "alarm not found" });
      if (req.body.day < alarm.day) return reply.code(400).send({ error: "a fault cannot be fixed before it was found" });
      return db.alarm.update({ where: { id: alarm.id }, data: { resolvedDay: req.body.day } });
    });

    scoped.get("/v1/alarms", async (req) => {
      const alarms = await db.alarm.findMany({ where: { project: { companyId: req.companyId } }, orderBy: [{ day: "desc" }], take: 200, include: { project: { select: { id: true, customerName: true } } } });
      return { alarms };
    });
  });

  return app;
}
