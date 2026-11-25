// Runs against a real PostgreSQL (DATABASE_URL) with the migrations applied. Skipped without one.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { checkDraft, expectedHourly, loadProductConfig, typicalYear } from "@ipe/core";
import type { Fact, Plan } from "@ipe/core";
import { defaultEngine } from "@ipe/sim";
import { buildApp } from "../src/app.ts";
import { createDb } from "../src/db.ts";
import type { Db } from "../src/db.ts";
import { leadOf } from "../src/services/leads.ts";

const url = process.env.DATABASE_URL;
const skip = !url;
let db: Db;
let app: ReturnType<typeof buildApp>;
const ADMIN = "test-admin-token-123";

before(async () => {
  if (skip) return;
  db = createDb(url);
  await db.$executeRawUnsafe('TRUNCATE "Company" CASCADE');
  app = buildApp({ db, adminToken: ADMIN, writer: null });
  await app.ready();
});
after(async () => { if (!skip) { await app.close(); await db.$disconnect(); } });

async function company(name: string): Promise<string> {
  const res = await app.inject({ method: "POST", url: "/v1/companies", headers: { "x-admin-token": ADMIN }, payload: { name } });
  assert.equal(res.statusCode, 201);
  return res.json().apiKey;
}

const faces = [
  { azimuthDeg: 185, tiltDeg: 38, areaM2: 36, horizonDeg: Array.from({ length: 36 }, (_, b) => (b >= 13 && b <= 16 ? 14 : 2)) },
  { azimuthDeg: 5, tiltDeg: 38, areaM2: 36 },
];
const projectBody = { customerName: "Familie Weber", latDeg: 52.45, lonDeg: 13.3, statedConsumptionKwh: 4100, budgetEur: 26000, ev: { kmPerYear: 12000 }, faces };

test("companies need the admin token; every other call needs an API key", { skip }, async () => {
  assert.equal((await app.inject({ method: "POST", url: "/v1/companies", payload: { name: "x" } })).statusCode, 403);
  assert.equal((await app.inject({ method: "GET", url: "/v1/projects" })).statusCode, 401);
  assert.equal((await app.inject({ method: "GET", url: "/v1/projects", headers: { "x-api-key": "ipe_not-a-real-key" } })).statusCode, 401);
});

test("invalid input is refused with a reason", { skip }, async () => {
  const key = await company("Validation GmbH");
  const res = await app.inject({ method: "POST", url: "/v1/projects", headers: { "x-api-key": key }, payload: { ...projectBody, faces: [{ ...faces[0], horizonDeg: [1, 2, 3] }] } });
  assert.equal(res.statusCode, 400);
  const noFaces = await app.inject({ method: "POST", url: "/v1/projects", headers: { "x-api-key": key }, payload: { ...projectBody, faces: [] } });
  const p = await app.inject({ method: "POST", url: `/v1/projects/${noFaces.json().id}/proposals`, headers: { "x-api-key": key, "idempotency-key": "k-000000001" } });
  assert.equal(p.statusCode, 422);
});

test("a proposal is created once per idempotency key and versions supersede each other", { skip }, async () => {
  const key = await company("Sonnenstrom Berlin");
  const h = { "x-api-key": key };
  const project = (await app.inject({ method: "POST", url: "/v1/projects", headers: h, payload: projectBody })).json();
  const first = await app.inject({ method: "POST", url: `/v1/projects/${project.id}/proposals`, headers: { ...h, "idempotency-key": "offer-0001" } });
  assert.equal(first.statusCode, 201);
  const again = await app.inject({ method: "POST", url: `/v1/projects/${project.id}/proposals`, headers: { ...h, "idempotency-key": "offer-0001" } });
  assert.equal(again.statusCode, 200);
  assert.equal(again.headers["idempotent-replayed"], "true");
  assert.equal(again.json().id, first.json().id);
  const second = await app.inject({ method: "POST", url: `/v1/projects/${project.id}/proposals`, headers: { ...h, "idempotency-key": "offer-0002" } });
  assert.equal(second.json().version, 2);
  const detail = (await app.inject({ method: "GET", url: `/v1/projects/${project.id}`, headers: h })).json();
  assert.deepEqual(detail.proposals.map((p: { version: number; status: string }) => [p.version, p.status]), [[2, "DRAFT"], [1, "SUPERSEDED"]]);
  const offer = first.json();
  assert.ok(offer.priceEur <= 26000);
  const facts = (offer.plan as { facts: Fact[] }).facts;
  assert.ok(checkDraft(offer.offerText, facts, "de").ok, "every number in the offer is a fact");
  const year = (await app.inject({ method: "GET", url: `/v1/projects/${project.id}/year`, headers: h })).json();
  assert.equal(year.version, 2);
  assert.equal(year.pvKwh.length, 8760);
  assert.ok(Math.abs(year.pvKwh.reduce((a: number, b: number) => a + b, 0) - second.json().plan.expected.yieldKwh) / second.json().plan.expected.yieldKwh < 0.002);
  const stale = await app.inject({ method: "POST", url: `/v1/proposals/${offer.id}/accept`, headers: h });
  assert.equal(stale.statusCode, 409);
});

test("parallel requests with different keys get distinct versions", { skip }, async () => {
  const key = await company("Parallel Solar");
  const h = { "x-api-key": key };
  const project = (await app.inject({ method: "POST", url: "/v1/projects", headers: h, payload: projectBody })).json();
  const res = await Promise.all([1, 2, 3, 4].map((i) => app.inject({ method: "POST", url: `/v1/projects/${project.id}/proposals`, headers: { ...h, "idempotency-key": `parallel-${i}-key` } })));
  assert.deepEqual(res.map((r) => r.statusCode).sort(), [201, 201, 201, 201]);
  assert.deepEqual(res.map((r) => r.json().version).sort(), [1, 2, 3, 4]);
});

test("one company never sees another company's projects", { skip }, async () => {
  const a = await company("A Solar");
  const b = await company("B Solar");
  const project = (await app.inject({ method: "POST", url: "/v1/projects", headers: { "x-api-key": a }, payload: projectBody })).json();
  const proposal = (await app.inject({ method: "POST", url: `/v1/projects/${project.id}/proposals`, headers: { "x-api-key": a, "idempotency-key": "tenant-key-1" } })).json();
  assert.equal((await app.inject({ method: "GET", url: `/v1/projects/${project.id}`, headers: { "x-api-key": b } })).statusCode, 404);
  assert.equal((await app.inject({ method: "POST", url: `/v1/proposals/${proposal.id}/accept`, headers: { "x-api-key": b } })).statusCode, 404);
  assert.equal((await app.inject({ method: "POST", url: `/v1/projects/${project.id}/proposals`, headers: { "x-api-key": b, "idempotency-key": "tenant-key-2" } })).statusCode, 404);
  const list = (await app.inject({ method: "GET", url: "/v1/projects", headers: { "x-api-key": b } })).json();
  assert.equal(list.projects.length, 0);
});

test("monitoring starts after signing, finds an outage, and is idempotent", { skip }, async () => {
  const key = await company("Aftercare Solar");
  const h = { "x-api-key": key };
  const project = (await app.inject({ method: "POST", url: "/v1/projects", headers: h, payload: projectBody })).json();
  const proposal = (await app.inject({ method: "POST", url: `/v1/projects/${project.id}/proposals`, headers: { ...h, "idempotency-key": "after-0001" } })).json();
  const early = await app.inject({ method: "POST", url: `/v1/projects/${project.id}/monitoring`, headers: h, payload: { days: [{ day: 0, hourlyKwh: new Array(24).fill(0) }] } });
  assert.equal(early.statusCode, 409);
  assert.equal((await app.inject({ method: "POST", url: `/v1/proposals/${proposal.id}/accept`, headers: h })).json().status, "ACCEPTED");

  const config = loadProductConfig();
  const full = (await app.inject({ method: "GET", url: `/v1/projects/${project.id}`, headers: h })).json();
  const lead = leadOf(full);
  const expected = expectedHourly(lead, proposal.plan as Plan, typicalYear(lead.latDeg, lead.lonDeg), defaultEngine(), config, true);
  const days = Array.from({ length: 70 }, (_, i) => {
    const day = 100 + i;
    return { day, hourlyKwh: Array.from({ length: 24 }, (_, hr) => (day >= 150 ? 0 : expected[day * 24 + hr] * 0.95)) };
  });
  const r1 = await app.inject({ method: "POST", url: `/v1/projects/${project.id}/monitoring`, headers: h, payload: { days } });
  assert.equal(r1.statusCode, 200, r1.body);
  const alarms = r1.json().alarms as { day: number; cause: string; message: string }[];
  assert.equal(alarms[0].day, 150);
  assert.equal(alarms[0].cause, "inverter-outage");
  assert.match(alarms[0].message, /Wechselrichter/);
  const r2 = await app.inject({ method: "POST", url: `/v1/projects/${project.id}/monitoring`, headers: h, payload: { days } });
  assert.deepEqual(r2.json().alarms.map((a: { id: string }) => a.id), alarms.map((a) => (a as unknown as { id: string }).id));
  const series = (await app.inject({ method: "GET", url: `/v1/projects/${project.id}/monitoring`, headers: h })).json().days;
  assert.equal(series.length, 70);
  assert.ok(Math.abs(series[0].measuredKwh / series[0].expectedKwh - 0.95) < 1e-6);
  const listed = (await app.inject({ method: "GET", url: "/v1/alarms", headers: h })).json().alarms;
  assert.equal(listed.length, 1, "an unrepaired outage is one alarm, not one every few days");
  const fixed = await app.inject({ method: "POST", url: `/v1/alarms/${listed[0].id}/resolve`, headers: h, payload: { day: 160 } });
  assert.equal(fixed.json().resolvedDay, 160);
  // After the fix the inverter runs again; a second outage later is a new alarm.
  const later = Array.from({ length: 40 }, (_, i) => {
    const day = 160 + i;
    return { day, hourlyKwh: Array.from({ length: 24 }, (_, hr) => (day >= 190 ? 0 : expected[day * 24 + hr] * 0.95)) };
  });
  const r3 = (await app.inject({ method: "POST", url: `/v1/projects/${project.id}/monitoring`, headers: h, payload: { days: later } })).json();
  assert.deepEqual(r3.alarms.map((a: { day: number; cause: string }) => [a.day, a.cause]), [[150, "inverter-outage"], [190, "inverter-outage"]]);
});
