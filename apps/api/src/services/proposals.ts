// A proposal is a new version of the offer for a project. The simulation and optimiser decide
// the system and the numbers; the writer only words them, and the checker decides what is sent.
import { PLATFORM_OPTIONS, compose, estimateLoad, expectedHourly, offerFacts, plan, typicalYear } from "@ipe/core";
import type { Plan, ProductConfig, Writer } from "@ipe/core";
import type { Engine } from "@ipe/sim";
import type { Db } from "../db.ts";
import { leadOf } from "./leads.ts";

/** The expected hourly yield and use of the latest proposal in a typical year, for the console's year view. */
export async function proposalYear(deps: ProposalDeps, companyId: string, projectId: string) {
  const project = await deps.db.project.findFirst({ where: { id: projectId, companyId }, include: { faces: true, proposals: { orderBy: { version: "desc" }, take: 1 } } });
  if (!project) throw new HttpError(404, "project not found");
  const latest = project.proposals[0];
  if (!latest) return { version: null, pvKwh: [], loadKwh: [] };
  const lead = leadOf(project);
  const weather = typicalYear(lead.latDeg, lead.lonDeg);
  const plan = latest.plan as unknown as Plan;
  const pv = expectedHourly(lead, plan, weather, deps.engine, deps.config, true);
  const load = estimateLoad(lead, PLATFORM_OPTIONS.load, weather, deps.config.load);
  const r3 = (x: number) => Math.round(x * 1000) / 1000;
  return { version: latest.version, pvKwh: Array.from(pv, r3), loadKwh: Array.from(load, r3) };
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

export interface ProposalDeps { db: Db; engine: Engine; config: ProductConfig; writer: Writer | null }

export async function createProposal(deps: ProposalDeps, companyId: string, projectId: string, idempotencyKey: string) {
  const { db } = deps;
  const project = await db.project.findFirst({ where: { id: projectId, companyId }, include: { faces: true, proposals: { where: { idempotencyKey } } } });
  if (!project) throw new HttpError(404, "project not found");
  if (project.proposals.length) return { proposal: project.proposals[0], replayed: true };
  if (!project.faces.length) throw new HttpError(422, "add at least one roof face first");

  const lead = leadOf(project);
  const p = plan(lead, PLATFORM_OPTIONS, { engine: deps.engine, config: deps.config, weather: typicalYear });
  const facts = offerFacts(p);
  const mode = deps.writer ? "agent-checked" : "template";
  const offer = await compose({ kind: "offer", facts, language: deps.config.offer.language, customerName: project.customerName }, mode, deps.writer, deps.config.offer.maxDrafts);

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await db.$transaction(async (tx) => {
        // One writer per project at a time: versions are allocated in order, never twice.
        await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${projectId} FOR UPDATE`;
        const replay = await tx.proposal.findFirst({ where: { projectId, idempotencyKey } });
        if (replay) return { proposal: replay, replayed: true };
        const last = await tx.proposal.findFirst({ where: { projectId }, orderBy: { version: "desc" }, select: { version: true } });
        await tx.proposal.updateMany({ where: { projectId, status: { in: ["DRAFT", "SENT"] } }, data: { status: "SUPERSEDED" } });
        const proposal = await tx.proposal.create({
          data: {
            projectId, version: (last?.version ?? 0) + 1, idempotencyKey,
            kwp: p.kwp, batteryKwh: p.batteryKwh, priceEur: p.priceEur,
            promisedYieldKwh: p.promise.yieldKwh, promisedSavingsEur: p.promise.savingsEur, paybackYears: p.paybackYears,
            plan: JSON.parse(JSON.stringify({ ...p, facts })),
            offerText: offer.text, offerSource: offer.source, draftsRejected: offer.rejectedNumbers.length,
          },
        });
        await tx.project.update({ where: { id: projectId }, data: { status: "OFFERED" } });
        return { proposal, replayed: false };
      });
    } catch (e) {
      if ((e as { code?: string }).code !== "P2002") throw e;
      const existing = await db.proposal.findFirst({ where: { projectId, idempotencyKey } });
      if (existing) return { proposal: existing, replayed: true };
    }
  }
  throw new HttpError(409, "could not allocate a proposal version, try again");
}
