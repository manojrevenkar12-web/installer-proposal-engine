// Drives the real API with simulated customers: creates leads, asks for proposals, lets the
// simulated customers decide, and uploads monitoring with real-world faults. Used for the
// console's demo data and screenshots.  node lab/src/seed-api.ts http://localhost:8080 <admin token>
import { defaultEngine } from "@ipe/sim";
import type { Plan } from "@ipe/core";
import { stream } from "./rng.ts";
import { loadWorldConfig } from "./world/config.ts";
import { makeHouseholds } from "./world/households.ts";
import { measuredYear } from "./world/aftercare.ts";
import { drawFaults, householdTruth, signs } from "./world/truth.ts";
import { regionYear } from "./world/weather.ts";

const [base = "http://localhost:8080", admin = process.env.ADMIN_TOKEN ?? "", countArg = "36"] = process.argv.slice(2);
const SEED = 4242;
const NAMES = ["Weber", "Schneider", "Fischer", "Wagner", "Becker", "Hoffmann", "Schäfer", "Koch", "Bauer", "Richter", "Klein", "Wolf", "Neumann", "Schwarz", "Zimmermann", "Braun", "Krüger", "Hofmann", "Hartmann", "Lange", "Schmitt", "Werner", "Krause", "Meier", "Lehmann", "Schmid", "Schulze", "Maier", "Köhler", "Herrmann", "König", "Walter", "Mayer", "Huber", "Kaiser", "Fuchs"];

// biome-ignore lint: the API's JSON is checked by its own tests
type Json = any;
async function call(path: string, init: RequestInit & { key?: string } = {}): Promise<Json> {
  const res = await fetch(base + path, { ...init, headers: { ...(init.body ? { "content-type": "application/json" } : {}), ...(init.key ? { "x-api-key": init.key } : {}), ...(init.headers ?? {}) } });
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

const world = loadWorldConfig();
const engine = defaultEngine();
const households = makeHouseholds(SEED, { ...world, households: Number(countArg) });
const years = new Map(world.regions.map((r) => [r.name, regionYear(SEED, r, world.weather)]));
const { apiKey } = await call("/v1/companies", { method: "POST", headers: { "x-admin-token": admin }, body: JSON.stringify({ name: "Sonnenwerk Berlin GmbH" }) });
console.log(`company key: ${apiKey}`);
const UPLOAD_DAYS = 200;

for (let i = 0; i < households.length; i++) {
  const h = households[i];
  const l = h.lead;
  const project = await call("/v1/projects", { method: "POST", key: apiKey, body: JSON.stringify({
    customerName: `Familie ${NAMES[i % NAMES.length]}`, latDeg: l.latDeg, lonDeg: l.lonDeg, statedConsumptionKwh: l.statedConsumptionKwh,
    heatPump: l.heatPump, ev: l.ev, budgetEur: l.budgetEur,
    faces: i % 9 === 8 ? [] : l.faces.map((f) => ({ azimuthDeg: f.azimuthDeg, tiltDeg: f.tiltDeg, areaM2: f.areaM2, horizonDeg: f.horizonDeg.map((x) => Math.min(90, x)) })),
  }) });
  if (i % 9 === 8) continue; // a few leads still wait for their site visit
  const proposal = await call(`/v1/projects/${project.id}/proposals`, { method: "POST", key: apiKey, headers: { "idempotency-key": `seed-${SEED}-${i}` } });
  const plan = proposal.plan as Plan;
  if (!signs(h, plan, world.customer) && stream(SEED, "demo", i)() > 0.3) continue;
  await call(`/v1/proposals/${proposal.id}/accept`, { method: "POST", key: apiKey });
  if (i % 3 === 0) continue; // signed, not yet installed
  const truth = householdTruth(SEED, h, years.get(h.region)!, world, engine);
  const faults = drawFaults(SEED, i, world.faults);
  // The demo shows each kind of fault at least once.
  const demoKinds = ["string", "shading", "outage", "string", "soiling"] as const;
  if (!faults.fault && i % 2 === 1) faults.fault = { kind: demoKinds[(i >> 1) % demoKinds.length], startDay: 60 + ((i * 17) % 110), lossShare: 0.4, lossPerDay: 0.006, obstacle: { centre: 170, width: 70, height: 38 } };
  const measured = measuredYear(h, truth, plan, faults, engine);
  const days = Array.from({ length: UPLOAD_DAYS }, (_, day) => ({
    day,
    hourlyKwh: Array.from({ length: 24 }, (_, hr) => { const v = measured[day * 24 + hr]; return Number.isNaN(v) ? null : Math.round(v * 1000) / 1000; }),
    ghiWm2: Array.from({ length: 24 }, (_, hr) => Math.round(truth.satellite.ghi[day * 24 + hr] * 10) / 10),
  }));
  const r = await call(`/v1/projects/${project.id}/monitoring`, { method: "POST", key: apiKey, body: JSON.stringify({ days }) });
  console.log(`${project.customerName}: ${r.alarms.length} alarm(s)${faults.fault ? ` (fault: ${faults.fault.kind} from day ${faults.fault.startDay})` : ""}`);
}
console.log(`\nOpen the console with this key: ${apiKey}`);
