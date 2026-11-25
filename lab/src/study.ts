// Runs every design over the same simulated households and measures what each one promised,
// what really happened, and what its aftercare caught.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { HOURS, defaultEngine, referenceEngine } from "@ipe/sim";
import type { Engine, Weather } from "@ipe/sim";
import {
  AftercareMonitor, CAUSE_TEXT, SimulatedWriter, aftercareFacts, compose, expectedHourly, loadProductConfig, offerFacts, plan, typicalYear,
} from "@ipe/core";
import type { AftercareMode, OfferMode, PlanOptions, ProductConfig } from "@ipe/core";
import { stream } from "./rng.ts";
import { loadWorldConfig } from "./world/config.ts";
import type { WorldConfig } from "./world/config.ts";
import { makeHouseholds } from "./world/households.ts";
import { runAftercare } from "./world/aftercare.ts";
import { drawFaults, householdTruth, realize, signs } from "./world/truth.ts";
import { regionYear } from "./world/weather.ts";

export interface Design extends PlanOptions {
  id: string;
  label: string;
  kind: "status-quo" | "model-alone" | "platform" | "ablation";
  offer: OfferMode;
  aftercare: AftercareMode;
}

/** A fault is material when, left alone, it would take at least this share of the yield. */
export const MATERIAL_LOSS_SHARE = 0.05;

const root = join(import.meta.dirname, "..", "..");

export function loadDesigns(path = join(root, "config", "designs.json")): Design[] {
  const raw = JSON.parse(readFileSync(path, "utf8")).designs as (Partial<Design> & { id: string; base?: string })[];
  const byId = new Map<string, Design>();
  for (const d of raw) {
    const base = d.base ? byId.get(d.base) : undefined;
    if (d.base && !base) throw new Error(`design ${d.id}: unknown base ${d.base}`);
    const { base: _ignored, ...rest } = d;
    byId.set(d.id, { ...(base ?? {}), ...rest } as Design);
  }
  return [...byId.values()];
}

export interface Metrics {
  leads: number;
  signed: number;
  winRate: number;
  revenuePer100LeadsEur: number;
  yieldErrorPct: number;
  savingsBiasPct: number;
  brokenPromiseRate: number;
  customerNpvEur: number;
  customerValuePer100LeadsEur: number;
  meanKwp: number;
  batteryShare: number;
  inventedNumbersSent: number;
  draftsRejected: number;
  offersFromFallback: number;
  faults: number;
  faultDetectionRate: number;
  materialFaults: number;
  materialDetectionRate: number;
  medianDaysToDetect: number;
  causeAccuracy: number;
  falseAlarmsPer100: number;
  offlineFlaggedRate: number;
  lostKwhPerFault: number;
  engineParityMaxRelError: number;
  faultsByKind: Record<string, { faults: number; detected: number; causeCorrect: number; medianDays: number }>;
}

/** Caches face profiles per weather object and face, so designs that share a view share the work. */
function cachingEngine(inner: Engine): Engine {
  const cache = new WeakMap<Weather, Map<string, { shaded: Float64Array; unshaded: Float64Array }>>();
  return {
    name: inner.name,
    balance: inner.balance,
    faceProfile(weather, face, module) {
      let byFace = cache.get(weather);
      if (!byFace) cache.set(weather, (byFace = new Map()));
      const key = `${face.azimuthDeg}|${face.tiltDeg}|${face.horizonDeg.join(",")}|${module.noct}|${module.gamma}`;
      let hit = byFace.get(key);
      if (!hit) byFace.set(key, (hit = inner.faceProfile(weather, face, module)));
      return hit;
    },
  };
}

const median = (xs: number[]) => {
  if (!xs.length) return Number.NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : Number.NaN);

export function parityCheck(engine: Engine): number {
  if (engine.name !== "rust") return Number.NaN;
  let worst = 0;
  const w = typicalYear(51.3, 9.5);
  for (const [az, tilt] of [[180, 35], [95, 20], [260, 45]]) {
    const horizon = Array.from({ length: 36 }, (_, b) => (b > 12 && b < 20 ? 18 : 2));
    const module = { albedo: 0.2, noct: 45, gamma: -0.0035 };
    const a = engine.faceProfile(w, { azimuthDeg: az, tiltDeg: tilt, horizonDeg: horizon }, module).shaded;
    const b = referenceEngine.faceProfile(w, { azimuthDeg: az, tiltDeg: tilt, horizonDeg: horizon }, module).shaded;
    for (let h = 0; h < HOURS; h++) worst = Math.max(worst, Math.abs(a[h] - b[h]) / Math.max(1, Math.abs(b[h])));
    const pv = a.map((x) => x * 8);
    const load = new Float64Array(HOURS).fill(0.5);
    const price = new Float64Array(HOURS).fill(0.36);
    const sys = { losses: 0.14, inverterKw: 7, batteryKwh: 8, batteryKw: 4, batteryEfficiency: 0.9, batteryReserve: 0.05 };
    const x = engine.balance(pv, load, price, 0.08, sys, false);
    const y = referenceEngine.balance(pv, load, price, 0.08, sys, false);
    for (const k of ["pvKwh", "importedKwh", "exportedKwh", "billAfterEur"] as const) worst = Math.max(worst, Math.abs(x[k] - y[k]) / Math.max(1, Math.abs(y[k])));
  }
  return worst;
}

export interface SeedResult { seed: number; byDesign: Record<string, Metrics>; seconds: number }

export async function runSeed(seed: number, designs: Design[], opts: { world?: WorldConfig; product?: ProductConfig; engine?: Engine; households?: number } = {}): Promise<SeedResult> {
  const started = performance.now();
  const world = opts.world ?? loadWorldConfig();
  const product = opts.product ?? loadProductConfig();
  const base = opts.engine ?? defaultEngine();
  const engine = cachingEngine(base);
  const households = makeHouseholds(seed, { ...world, households: opts.households ?? world.households });
  const years = new Map(world.regions.map((r) => [r.name, regionYear(seed, r, world.weather)]));
  const typical = new Map<string, Weather>();
  const weather = (lat: number, lon: number) => {
    const key = `${lat},${lon}`;
    let w = typical.get(key);
    if (!w) typical.set(key, (w = typicalYear(lat, lon)));
    return w;
  };

  type Acc = {
    signed: number; revenue: number; yieldErr: number[]; bias: number[]; broken: number; npv: number[]; kwp: number[]; battery: number;
    invented: number; rejected: number; fallback: number; faults: number; detected: number; days: number[]; causeOk: number; causeN: number;
    falseAlarms: number; material: number; materialDetected: number; installed: number; dropouts: number; offlineOk: number; lost: number[];
    kinds: Record<string, { faults: number; detected: number; causeCorrect: number; days: number[] }>;
  };
  const acc: Record<string, Acc> = {};
  for (const d of designs) acc[d.id] = { signed: 0, revenue: 0, yieldErr: [], bias: [], broken: 0, npv: [], kwp: [], battery: 0, invented: 0, rejected: 0, fallback: 0, faults: 0, detected: 0, days: [], causeOk: 0, causeN: 0, falseAlarms: 0, material: 0, materialDetected: 0, installed: 0, dropouts: 0, offlineOk: 0, lost: [], kinds: {} };

  for (let i = 0; i < households.length; i++) {
    const h = households[i];
    const truth = householdTruth(seed, h, years.get(h.region)!, world, engine);
    const faults = drawFaults(seed, i, world.faults);
    for (const d of designs) {
      const a = acc[d.id];
      const p = plan(h.lead, d, { engine, config: product, weather, random: stream(seed, "model-guess", i) });
      const writer = new SimulatedWriter(stream(seed, "writer", i));
      const offer = await compose({ kind: "offer", facts: offerFacts(p), language: "de", customerName: "Familie Muster" }, d.offer, writer, product.offer.maxDrafts);
      a.invented += offer.inventedSent.length;
      a.rejected += offer.rejectedNumbers.length;
      if (offer.source === "fallback") a.fallback++;
      if (!signs(h, p, world.customer)) continue;
      const real = realize(h, truth, p, world, engine);
      a.signed++;
      a.installed++;
      a.revenue += p.priceEur;
      a.kwp.push(p.kwp);
      if (p.batteryKwh > 0) a.battery++;
      a.yieldErr.push((Math.abs(p.expected.yieldKwh - real.yieldKwh) / real.yieldKwh) * 100);
      a.bias.push(((p.promise.savingsEur - real.savingsEur) / real.savingsEur) * 100);
      if (real.savingsEur < world.customer.complaintBelowShare * p.promise.savingsEur) a.broken++;
      a.npv.push(real.npvEur);

      const expected = d.aftercare === "normalized" ? expectedHourly(h.lead, p, truth.satellite, engine, product, d.shading) : new Float64Array(HOURS);
      const monitor = new AftercareMonitor(d.aftercare, product.aftercare, expected, p.promise.monthlyPvKwh, h.lead.latDeg, h.lead.lonDeg);
      const out = runAftercare(h, truth, p, faults, monitor, world, engine);
      a.falseAlarms += out.falseAlarms;
      if (out.offlineFlagged !== null) { a.dropouts++; if (out.offlineFlagged) a.offlineOk++; }
      if (out.hadFault) {
        a.faults++;
        if (out.lossShareIfIgnored >= MATERIAL_LOSS_SHARE) { a.material++; if (out.detectedDay !== null) a.materialDetected++; }
        a.lost.push(out.lostKwh);
        const k = (a.kinds[out.faultKind!] ??= { faults: 0, detected: 0, causeCorrect: 0, days: [] });
        k.faults++;
        if (out.detectedDay !== null) {
          a.detected++; a.days.push(out.daysToDetect!); a.causeN++; if (out.causeCorrect) a.causeOk++;
          k.detected++; k.days.push(out.daysToDetect!); if (out.causeCorrect) k.causeCorrect++;
        }
      }
      for (const alarm of out.alarms.slice(0, 1)) {
        const msg = await compose({ kind: "aftercare", facts: aftercareFacts(alarm), language: "de", customerName: "Familie Muster", context: { cause: CAUSE_TEXT[alarm.cause] } },
          d.offer, new SimulatedWriter(stream(seed, "aftercare-writer", i)), product.offer.maxDrafts);
        a.invented += msg.inventedSent.length;
      }
    }
  }

  const parity = parityCheck(base);
  const byDesign: Record<string, Metrics> = {};
  const n = households.length;
  for (const d of designs) {
    const a = acc[d.id];
    byDesign[d.id] = {
      leads: n,
      signed: a.signed,
      winRate: a.signed / n,
      revenuePer100LeadsEur: (a.revenue / n) * 100,
      yieldErrorPct: mean(a.yieldErr),
      savingsBiasPct: mean(a.bias),
      brokenPromiseRate: a.signed ? a.broken / a.signed : 0,
      customerNpvEur: mean(a.npv),
      customerValuePer100LeadsEur: (a.npv.reduce((s, x) => s + x, 0) / n) * 100,
      meanKwp: mean(a.kwp),
      batteryShare: a.signed ? a.battery / a.signed : 0,
      inventedNumbersSent: a.invented,
      draftsRejected: a.rejected,
      offersFromFallback: a.fallback,
      faults: a.faults,
      faultDetectionRate: a.faults ? a.detected / a.faults : Number.NaN,
      materialFaults: a.material,
      materialDetectionRate: a.material ? a.materialDetected / a.material : Number.NaN,
      medianDaysToDetect: median(a.days),
      causeAccuracy: a.causeN ? a.causeOk / a.causeN : Number.NaN,
      falseAlarmsPer100: a.installed ? (a.falseAlarms / a.installed) * 100 : 0,
      offlineFlaggedRate: a.dropouts ? a.offlineOk / a.dropouts : Number.NaN,
      lostKwhPerFault: mean(a.lost),
      engineParityMaxRelError: parity,
      faultsByKind: Object.fromEntries(Object.entries(a.kinds).map(([k, v]) => [k, { faults: v.faults, detected: v.detected, causeCorrect: v.causeCorrect, medianDays: median(v.days) }])),
    };
  }
  return { seed, byDesign, seconds: (performance.now() - started) / 1000 };
}
