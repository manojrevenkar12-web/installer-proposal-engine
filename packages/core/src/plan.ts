// Sizes a system for a lead and estimates what it will deliver.
// The platform evaluates every combination of roof-face fill and battery size with the
// hourly simulation and picks the best 20-year value for the customer within their budget.

import { HOURS } from "@ipe/sim";
import type { Engine, Weather } from "@ipe/sim";
import type { ProductConfig } from "./config.ts";
import { feedInRate, npvEur, paybackYears, priceEur } from "./economics.ts";
import { estimateLoad } from "./load.ts";
import type { EnergyEstimate, Lead, Plan, PlanOptions } from "./types.ts";

export interface PlanContext {
  engine: Engine;
  config: ProductConfig;
  weather: (latDeg: number, lonDeg: number) => Weather;
  /** Only the "model-guess" energy mode uses randomness: a model estimating without a simulation. */
  random?: () => number;
}

/** Share of annual yield per month for a south-facing roof in Germany, for estimates without a simulation. */
export const STANDARD_MONTH_SHARE = [0.028, 0.045, 0.08, 0.11, 0.13, 0.133, 0.135, 0.12, 0.09, 0.063, 0.036, 0.03];

const round1 = (x: number) => Math.round(x * 10) / 10;

export function orientationFactor(azimuthDeg: number, table: [number, number][]): number {
  const a = ((azimuthDeg % 360) + 360) % 360;
  for (let i = 1; i < table.length; i++) {
    const [a1, f1] = table[i];
    const [a0, f0] = table[i - 1];
    if (a <= a1) return f0 + ((f1 - f0) * (a - a0)) / (a1 - a0);
  }
  return table[table.length - 1][1];
}

function batteryOption(kwh: number, options: number[]): number {
  return options.reduce((best, o) => (Math.abs(o - kwh) < Math.abs(best - kwh) ? o : best), options[0]);
}

function gaussian(random: () => number): number {
  const u = Math.max(1e-12, random());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
}

interface Candidate { faceKwp: number[]; batteryKwh: number }

function candidates(lead: Lead, opts: PlanOptions, cfg: ProductConfig): Candidate[] {
  const full = lead.faces.map((f) => round1(f.areaM2 * cfg.module.kwpPerM2));
  if (opts.sizing !== "optimiser") {
    const kwp = full.reduce((a, b) => a + b, 0);
    return [{ faceKwp: full, batteryKwh: batteryOption(kwp * cfg.rules.batteryKwhPerKwp, cfg.options.batteryKwh) }];
  }
  const out: Candidate[] = [];
  const fills = cfg.options.faceFill;
  const combos = fills.length ** lead.faces.length;
  for (let c = 0; c < combos; c++) {
    let rest = c;
    const faceKwp = full.map((k) => {
      const fill = fills[rest % fills.length];
      rest = Math.floor(rest / fills.length);
      return round1(k * fill);
    });
    if (faceKwp.reduce((a, b) => a + b, 0) < cfg.options.minKwp) continue;
    for (const batteryKwh of cfg.options.batteryKwh) out.push({ faceKwp, batteryKwh });
  }
  return out;
}

function systemFor(kwp: number, batteryKwh: number, cfg: ProductConfig) {
  return {
    losses: cfg.system.losses,
    inverterKw: round1(kwp * cfg.system.inverterRatio),
    batteryKwh,
    batteryKw: Math.min(cfg.system.batteryMaxKw, batteryKwh * cfg.system.batteryCRate),
    batteryEfficiency: cfg.system.batteryEfficiency,
    batteryReserve: cfg.system.batteryReserve,
  };
}

export function plan(lead: Lead, opts: PlanOptions, ctx: PlanContext): Plan {
  const cfg = ctx.config;
  const grid = cfg.tariff.gridEurPerKwh;
  const list = candidates(lead, opts, cfg);
  const needsWeather = opts.energy === "hourly" || opts.energy === "monthly";
  const weather = needsWeather ? ctx.weather(lead.latDeg, lead.lonDeg) : null;
  const load = weather ? estimateLoad(lead, opts.load, weather, cfg.load) : null;
  const price = new Float64Array(HOURS).fill(grid);
  const profiles = weather
    ? lead.faces.map((f) => ctx.engine.faceProfile(weather, { azimuthDeg: f.azimuthDeg, tiltDeg: f.tiltDeg, horizonDeg: opts.shading ? f.horizonDeg : [] }, cfg.module).shaded)
    : [];
  const statedLoad = opts.load === "planned" ? plannedAnnualLoad(lead, cfg) : lead.statedConsumptionKwh;

  type Entry = { cand: Candidate; est: EnergyEstimate; npv: number; price: number };
  let best: Entry | null = null;
  let cheapest: Entry | null = null;
  for (const cand of list) {
    const kwp = cand.faceKwp.reduce((a, b) => a + b, 0);
    const feed = feedInRate(kwp, cfg.tariff);
    const system = systemFor(kwp, cand.batteryKwh, cfg);
    let est: EnergyEstimate;
    if (weather && load) {
      const pv = new Float64Array(HOURS);
      cand.faceKwp.forEach((k, i) => { if (k > 0) for (let h = 0; h < HOURS; h++) pv[h] += k * profiles[i][h]; });
      if (opts.energy === "hourly") {
        const b = ctx.engine.balance(pv, load, price, feed, system, false);
        est = { yieldKwh: b.pvKwh, loadKwh: b.loadKwh, selfConsumedKwh: b.selfConsumedKwh, exportedKwh: b.exportedKwh,
          savingsEur: b.billBeforeEur - b.billAfterEur + b.feedInEur, monthlyPvKwh: b.monthlyPvKwh };
      } else {
        est = monthlyBalance(pv, load, system.losses, system.inverterKw, grid, feed, ctx.engine);
      }
    } else {
      est = ruleEstimate(lead, cand, statedLoad, feed, cfg);
      if (opts.energy === "model-guess") {
        const r = ctx.random ?? Math.random;
        const yieldFactor = Math.exp(0.16 * gaussian(r) + 0.04);
        const selfFactor = Math.exp(0.2 * gaussian(r) + 0.05);
        const self = Math.min(est.loadKwh, est.selfConsumedKwh * selfFactor, est.yieldKwh * yieldFactor);
        const y = est.yieldKwh * yieldFactor;
        est = { ...est, yieldKwh: y, selfConsumedKwh: self, exportedKwh: y - self, savingsEur: self * grid + (y - self) * feed,
          monthlyPvKwh: est.monthlyPvKwh.map((m) => m * yieldFactor) };
      }
    }
    const p = priceEur(kwp, cand.batteryKwh, cfg.prices);
    const value = npvEur(p, est.savingsEur, cfg.economics);
    const entry: Entry = { cand, est, npv: value, price: p };
    if (!cheapest || p < cheapest.price) cheapest = entry;
    if (lead.budgetEur !== undefined && p > lead.budgetEur && opts.sizing === "optimiser") continue;
    if (!best || value > best.npv + 1e-6 || (Math.abs(value - best.npv) <= 1e-6 && p < best.price)) best = entry;
  }
  const chosen = best ?? cheapest;
  if (!chosen) throw new Error(`no system fits lead ${lead.id}`);
  const kwp = round1(chosen.cand.faceKwp.reduce((a, b) => a + b, 0));
  const system = systemFor(kwp, chosen.cand.batteryKwh, cfg);
  const keep = opts.promise === "haircut" ? 1 - cfg.promise.haircut : 1;
  return {
    faceKwp: chosen.cand.faceKwp,
    kwp,
    batteryKwh: chosen.cand.batteryKwh,
    batteryKw: system.batteryKw,
    inverterKw: system.inverterKw,
    priceEur: chosen.price,
    feedInEurPerKwh: feedInRate(kwp, cfg.tariff),
    expected: chosen.est,
    promise: { yieldKwh: chosen.est.yieldKwh * keep, savingsEur: chosen.est.savingsEur * keep, monthlyPvKwh: chosen.est.monthlyPvKwh.map((m) => m * keep) },
    paybackYears: paybackYears(chosen.price, chosen.est.savingsEur * keep),
    npvEur: npvEur(chosen.price, chosen.est.savingsEur * keep, cfg.economics),
    candidatesEvaluated: list.length,
  };
}

export function plannedAnnualLoad(lead: Lead, cfg: ProductConfig): number {
  let total = lead.statedConsumptionKwh;
  if (lead.ev) total += lead.ev.kmPerYear * cfg.load.evKwhPerKm * cfg.load.evHomeShare;
  return total;
}

/** The spreadsheet: yield per kWp times an orientation factor, a fixed self-consumption share. */
function ruleEstimate(lead: Lead, cand: Candidate, annualLoad: number, feed: number, cfg: ProductConfig): EnergyEstimate {
  const yieldKwh = cand.faceKwp.reduce((sum, k, i) => sum + k * cfg.rules.yieldKwhPerKwp * orientationFactor(lead.faces[i].azimuthDeg, cfg.rules.orientationFactor), 0);
  const share = cand.batteryKwh > 0 ? cfg.rules.selfConsumptionWithBattery : cfg.rules.selfConsumptionNoBattery;
  const self = Math.min(annualLoad, yieldKwh * share);
  return {
    yieldKwh, loadKwh: annualLoad, selfConsumedKwh: self, exportedKwh: yieldKwh - self,
    savingsEur: self * cfg.tariff.gridEurPerKwh + (yieldKwh - self) * feed,
    monthlyPvKwh: STANDARD_MONTH_SHARE.map((s) => s * yieldKwh),
  };
}

/** Monthly netting: assumes any PV in a month can serve any load in that month. */
function monthlyBalance(pv: Float64Array, load: Float64Array, losses: number, inverterKw: number, grid: number, feed: number, engine: Engine): EnergyEstimate {
  const zero = new Float64Array(HOURS);
  const ac = engine.balance(pv, zero, new Float64Array(HOURS).fill(grid), feed,
    { losses, inverterKw, batteryKwh: 0, batteryKw: 0, batteryEfficiency: 1, batteryReserve: 0 }, false);
  const monthlyLoad = new Array(12).fill(0);
  const starts = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 365];
  for (let m = 0; m < 12; m++) for (let h = starts[m] * 24; h < starts[m + 1] * 24; h++) monthlyLoad[m] += load[h];
  let self = 0;
  for (let m = 0; m < 12; m++) self += Math.min(ac.monthlyPvKwh[m], monthlyLoad[m]);
  const loadKwh = monthlyLoad.reduce((a, b) => a + b, 0);
  return { yieldKwh: ac.pvKwh, loadKwh, selfConsumedKwh: self, exportedKwh: ac.pvKwh - self, savingsEur: self * grid + (ac.pvKwh - self) * feed, monthlyPvKwh: ac.monthlyPvKwh };
}
