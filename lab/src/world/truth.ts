// What really happens once a household has an offer: whether it signs, what the installed
// system really delivers in the real year, and how it fails. Only the lab sees this.
import { HOURS } from "@ipe/sim";
import type { Engine } from "@ipe/sim";
import type { Plan } from "@ipe/core";
import { normal, stream, uniform } from "../rng.ts";
import type { WorldConfig } from "./config.ts";
import type { Household } from "./households.ts";
import { trueLoad } from "./households.ts";
import { satelliteEstimate, siteWeather } from "./weather.ts";
import type { RealizedWeather } from "./weather.ts";

export interface HouseholdTruth {
  weather: RealizedWeather;
  /** DC energy per kWp per hour for each roof face, with the real horizon and module performance. */
  faceDc: Float64Array[];
  load: Float64Array;
  satellite: ReturnType<typeof satelliteEstimate>;
}

export function householdTruth(seed: number, h: Household, regionYear: { dayIndex: number[]; dayTemp: number[] }, cfg: WorldConfig, engine: Engine): HouseholdTruth {
  const weather = siteWeather(seed, h.id, h.lead.latDeg, h.lead.lonDeg, regionYear, cfg.weather);
  const module = { albedo: 0.2, noct: 46, gamma: -0.0037 };
  const faceDc = h.truth.faces.map((f) => engine.faceProfile(weather, { azimuthDeg: f.azimuthDeg, tiltDeg: f.tiltDeg, horizonDeg: f.horizonDeg }, module).shaded.map((x) => x * h.truth.performance));
  return { weather, faceDc, load: trueLoad(h, weather.tempC, cfg.consumption), satellite: satelliteEstimate(seed, h.id, weather, cfg.faults.satelliteErrorSd) };
}

export function signs(h: Household, plan: Plan, cfg: WorldConfig["customer"]): boolean {
  if (plan.priceEur > h.truth.budgetEur) return false;
  const p = 1 / (1 + Math.exp((plan.paybackYears - h.truth.paybackToleranceYears) / cfg.decisionSoftnessYears));
  return h.truth.decision < p;
}

export function feedInRateTruth(kwp: number, t: WorldConfig["tariff"]): number {
  return kwp <= 10 ? t.feedInEurPerKwh : (10 * t.feedInEurPerKwh + (kwp - 10) * t.feedInAbove10KwpEurPerKwh) / kwp;
}

export interface Realized { yieldKwh: number; savingsEur: number; npvEur: number; selfConsumedKwh: number }

export function realize(h: Household, truth: HouseholdTruth, plan: Plan, cfg: WorldConfig, engine: Engine): Realized {
  const pv = new Float64Array(HOURS);
  plan.faceKwp.forEach((k, i) => { if (k > 0) for (let x = 0; x < HOURS; x++) pv[x] += k * truth.faceDc[i][x]; });
  const price = new Float64Array(HOURS).fill(h.truth.gridEurPerKwh);
  const b = engine.balance(pv, truth.load, price, feedInRateTruth(plan.kwp, cfg.tariff),
    { losses: h.truth.losses, inverterKw: plan.inverterKw, batteryKwh: plan.batteryKwh, batteryKw: plan.batteryKw, batteryEfficiency: 0.9, batteryReserve: 0.05 }, false);
  const savings = b.billBeforeEur - b.billAfterEur + b.feedInEur;
  const e = cfg.economics;
  let npv = -plan.priceEur;
  for (let y = 1; y <= e.years; y++) npv += (savings * (1 + e.priceEscalation) ** (y - 1) * (1 - e.degradationPerYear) ** (y - 1)) / (1 + e.discountRate) ** y;
  return { yieldKwh: b.pvKwh, savingsEur: savings, npvEur: npv, selfConsumedKwh: b.selfConsumedKwh };
}

export type FaultKind = "outage" | "string" | "shading" | "soiling";
export interface FaultPlan {
  fault: { kind: FaultKind; startDay: number; lossShare: number; lossPerDay: number; obstacle: { centre: number; width: number; height: number } } | null;
  dropout: { startDay: number; days: number } | null;
}

/** Faults are drawn per household, before any design is run: every design meets the same ones. */
export function drawFaults(seed: number, index: number, cfg: WorldConfig["faults"]): FaultPlan {
  const r = stream(seed, "faults", index);
  const u = r();
  const p = [cfg.inverterOutage.probability, cfg.stringFault.probability, cfg.newShading.probability, cfg.soiling.probability];
  const kinds: FaultKind[] = ["outage", "string", "shading", "soiling"];
  let acc = 0;
  let kind: FaultKind | null = null;
  for (let i = 0; i < 4; i++) { acc += p[i]; if (u < acc) { kind = kinds[i]; break; } }
  const startDay = Math.floor(uniform(r, [cfg.earliestDay, 330]));
  const fault = kind ? {
    kind, startDay,
    lossShare: uniform(r, cfg.stringFault.lossShare),
    lossPerDay: uniform(r, cfg.soiling.lossPerDay),
    obstacle: { centre: uniform(r, [130, 230]), width: uniform(r, cfg.newShading.widthDeg), height: uniform(r, cfg.newShading.heightDeg) },
  } : null;
  const dropout = r() < cfg.monitoringDropout.probability
    ? { startDay: Math.floor(uniform(r, [cfg.earliestDay, 350])), days: Math.round(uniform(r, cfg.monitoringDropout.days)) }
    : null;
  void normal;
  return { fault, dropout };
}
