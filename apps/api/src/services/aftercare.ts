// Replays the monitor over every stored day, so sending the same days twice gives the same
// alarms (idempotent) and late data is handled like data that arrived on time.
import { AftercareMonitor, CAUSE_TEXT, aftercareFacts, compose, expectedHourly, typicalYear } from "@ipe/core";
import type { Plan, ProductConfig, Writer } from "@ipe/core";
import { HOURS } from "@ipe/sim";
import type { Engine, Weather } from "@ipe/sim";
import type { Db } from "../db.ts";
import { leadOf } from "./leads.ts";
import { HttpError } from "./proposals.ts";

export async function monitoringSeries(deps: { db: Db; engine: Engine; config: ProductConfig }, companyId: string, projectId: string) {
  const project = await deps.db.project.findFirst({
    where: { id: projectId, companyId },
    include: { faces: true, days: { orderBy: { day: "asc" } }, proposals: { where: { status: "ACCEPTED" }, orderBy: { version: "desc" }, take: 1 } },
  });
  if (!project) throw new HttpError(404, "project not found");
  const accepted = project.proposals[0];
  if (!accepted) return { days: [] };
  const lead = leadOf(project);
  const typical = typicalYear(lead.latDeg, lead.lonDeg);
  const ghi = Float64Array.from(typical.ghi);
  for (const d of project.days) if (d.ghiWm2.length === 24) for (let h = 0; h < 24; h++) ghi[d.day * 24 + h] = d.ghiWm2[h];
  const expected = expectedHourly(lead, accepted.plan as unknown as Plan, { ...typical, ghi }, deps.engine, deps.config, true);
  return {
    days: project.days.map((d) => {
      let exp = 0;
      for (let h = 0; h < 24; h++) exp += expected[d.day * 24 + h];
      return { day: d.day, measuredKwh: d.missing ? null : d.hourlyKwh.reduce((a, b) => a + b, 0), expectedKwh: exp };
    }),
  };
}

export interface DayInput { day: number; hourlyKwh: (number | null)[]; ghiWm2?: number[] }

export async function ingestMonitoring(deps: { db: Db; engine: Engine; config: ProductConfig; writer: Writer | null }, companyId: string, projectId: string, days: DayInput[]) {
  const { db } = deps;
  const project = await db.project.findFirst({
    where: { id: projectId, companyId },
    include: { faces: true, proposals: { where: { status: "ACCEPTED" }, orderBy: { version: "desc" }, take: 1 } },
  });
  if (!project) throw new HttpError(404, "project not found");
  const accepted = project.proposals[0];
  if (!accepted) throw new HttpError(409, "no accepted proposal: monitoring starts after the customer signs");
  for (const d of days) {
    if (d.day < 0 || d.day > 364 || d.hourlyKwh.length !== 24) throw new HttpError(400, `day ${d.day}: need day 0..364 and 24 hourly values`);
  }
  await db.$transaction(days.map((d) => {
    const missing = d.hourlyKwh.every((v) => v === null);
    const data = { missing, hourlyKwh: d.hourlyKwh.map((v) => v ?? 0), ghiWm2: d.ghiWm2 ?? [] };
    return db.monitoringDay.upsert({ where: { projectId_day: { projectId, day: d.day } }, create: { projectId, day: d.day, ...data }, update: data });
  }));
  if (project.status !== "INSTALLED") await db.project.update({ where: { id: projectId }, data: { status: "INSTALLED" } });

  const stored = await db.monitoringDay.findMany({ where: { projectId }, orderBy: { day: "asc" } });
  const lead = leadOf(project);
  const plan = accepted.plan as unknown as Plan;
  const typical = typicalYear(lead.latDeg, lead.lonDeg);
  // Observed irradiance where the caller sent it (satellite or on-site sensor), the typical year elsewhere.
  const ghi = Float64Array.from(typical.ghi);
  for (const d of stored) if (d.ghiWm2.length === 24) for (let h = 0; h < 24; h++) ghi[d.day * 24 + h] = d.ghiWm2[h];
  const observed: Weather = { ...typical, ghi };
  const expected = deps.config ? expectedHourly(lead, plan, observed, deps.engine, deps.config, true) : new Float64Array(HOURS);
  const monitor = new AftercareMonitor("normalized", deps.config.aftercare, expected, plan.promise.monthlyPvKwh, lead.latDeg, lead.lonDeg);
  const existing = await db.alarm.findMany({ where: { projectId }, orderBy: { day: "asc" } });
  const resolvedOn = new Map(existing.filter((x) => x.resolvedDay !== null).map((x) => [x.resolvedDay!, x]));
  const measured = new Float64Array(24);
  // One open fault at a time: while the installer has not reported a fix, further fault alarms
  // belong to the same incident. A reported fix tells the monitor, as a repair does in the lab.
  let openUntil = -1;
  let openFault: { day: number; resolvedDay: number | null } | null = null;
  const raised = [];
  for (const d of stored) {
    if (resolvedOn.has(d.day)) monitor.resolved(d.day);
    for (let h = 0; h < 24; h++) measured[h] = d.missing ? Number.NaN : d.hourlyKwh[h];
    const a = monitor.observeDay(d.day, measured);
    if (!a) continue;
    if (a.kind === "fault") {
      if (openFault && (openFault.resolvedDay === null || d.day < openUntil)) continue;
      const known = existing.find((x) => x.day === a.day && x.cause === a.cause);
      openFault = { day: a.day, resolvedDay: known?.resolvedDay ?? null };
      openUntil = known?.resolvedDay ?? Number.POSITIVE_INFINITY;
    }
    raised.push(a);
  }
  const saved = [];
  for (const a of raised) {
    const known = existing.find((x) => x.day === a.day && x.cause === a.cause);
    if (known) { saved.push(known); continue; }
    const msg = await compose({ kind: "aftercare", facts: aftercareFacts(a), language: deps.config.offer.language, customerName: project.customerName, context: { cause: CAUSE_TEXT[a.cause] } },
      deps.writer ? "agent-checked" : "template", deps.writer, deps.config.offer.maxDrafts);
    saved.push(await db.alarm.create({ data: { projectId, day: a.day, kind: a.kind, cause: a.cause, performance: Number.isFinite(a.performance) ? a.performance : null, lossKwhPerDay: a.lossKwhPerDay, message: msg.text } }));
  }
  return { days: stored.length, alarms: saved };
}
