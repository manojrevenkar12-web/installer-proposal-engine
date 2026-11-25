// Households that ask an installer for an offer. Each carries a hidden truth (their real roof
// horizon, consumption, heat pump and car, tariff, patience and budget) and the lead the
// installer actually receives (what the customer says and what the site visit measures).
import { HORIZON_BINS, HOURS } from "@ipe/sim";
import type { Lead } from "@ipe/core";
import { normal, pick, stream, uniform } from "../rng.ts";
import type { Random } from "../rng.ts";
import type { WorldConfig } from "./config.ts";

export interface TrueFace { azimuthDeg: number; tiltDeg: number; areaM2: number; horizonDeg: number[] }

export interface Household {
  id: string;
  region: string;
  lead: Lead;
  truth: {
    faces: TrueFace[];
    baseKwh: number;
    homeOffice: boolean;
    heatPump: { livingAreaM2: number; buildingYear: number; heatKwh: number; hotWaterKwh: number } | null;
    ev: { kmPerYear: number; homeShare: number } | null;
    gridEurPerKwh: number;
    losses: number;
    performance: number;
    paybackToleranceYears: number;
    budgetEur: number;
    decision: number;
  };
}

function wrap(a: number): number { return ((a % 360) + 360) % 360; }

function horizon(r: Random, cfg: WorldConfig["roof"]): number[] {
  const out = Array.from({ length: HORIZON_BINS }, () => uniform(r, cfg.backgroundHorizonDeg));
  if (r() < cfg.obstacleProbability) {
    const centre = uniform(r, [90, 270]);
    const width = uniform(r, cfg.obstacleWidthDeg);
    const height = uniform(r, cfg.obstacleHeightDeg);
    for (let b = 0; b < HORIZON_BINS; b++) {
      const az = b * 10 + 5;
      const d = Math.abs(((az - centre + 540) % 360) - 180);
      if (d < width / 2) out[b] = Math.max(out[b], height * (1 - d / (width / 2)) ** 0.5);
    }
  }
  return out;
}

export function heatDemandPerM2(year: number, table: [number, number][]): number {
  for (const [until, v] of table) if (year <= until) return v;
  return table[table.length - 1][1];
}

export function makeHouseholds(seed: number, cfg: WorldConfig): Household[] {
  const out: Household[] = [];
  for (let i = 0; i < cfg.households; i++) {
    const id = `h${seed}-${i}`;
    const r = stream(seed, "household", i);
    const region = pick(r, cfg.regions.map((g) => [g, g.weight]));
    const latDeg = region.lat + (r() - 0.5) * 2 * cfg.weather.siteJitterDeg;
    const lonDeg = region.lon + (r() - 0.5) * 2 * cfg.weather.siteJitterDeg;
    const nFaces = pick(r, cfg.roof.faces);
    const main = wrap(180 + cfg.roof.mainAzimuthSd * normal(r));
    const tilt = uniform(r, cfg.roof.tiltDeg);
    const faces: TrueFace[] = [];
    for (let f = 0; f < nFaces; f++) {
      const az = f === 0 ? main : f === 1 ? wrap(main + (r() < 0.6 ? 180 : 90)) : wrap(main + (r() < 0.5 ? 90 : -90));
      faces.push({ azimuthDeg: Math.round(az), tiltDeg: Math.round(f === 2 ? uniform(r, cfg.roof.tiltDeg) : tilt), areaM2: Math.round(uniform(r, cfg.roof.areaM2)), horizonDeg: horizon(r, cfg.roof) });
    }
    const c = cfg.consumption;
    const baseKwh = uniform(r, c.baseKwh);
    const homeOffice = r() < c.homeOfficeProbability;
    let heatPump: Household["truth"]["heatPump"] = null;
    if (r() < c.heatPumpProbability) {
      const livingAreaM2 = Math.round(uniform(r, c.livingAreaM2));
      const buildingYear = Math.round(uniform(r, c.buildingYear));
      const heatKwh = livingAreaM2 * heatDemandPerM2(buildingYear, c.heatDemandKwhPerM2ByAge) * (1 + c.heatDemandSpread * normal(r) * 0.5);
      heatPump = { livingAreaM2, buildingYear, heatKwh: Math.max(2000, heatKwh), hotWaterKwh: uniform(r, c.hotWaterKwhPerYear) };
    }
    let ev: Household["truth"]["ev"] = null;
    let statedKm = 0;
    if (r() < c.evProbability) {
      statedKm = Math.round(uniform(r, c.evKmPerYear) / 500) * 500;
      ev = { kmPerYear: statedKm * (1 + 0.15 * normal(r)), homeShare: uniform(r, c.evHomeShare) };
    }
    const measured = faces.map((f) => ({
      azimuthDeg: f.azimuthDeg,
      tiltDeg: f.tiltDeg,
      areaM2: f.areaM2,
      horizonDeg: f.horizonDeg.map((h) => Math.max(0, Math.round((h + cfg.roof.siteVisitErrorDeg * normal(r)) * 10) / 10)),
    }));
    const budgetEur = Math.round(uniform(r, cfg.customer.budgetEur) / 500) * 500;
    out.push({
      id,
      region: region.name,
      lead: {
        id,
        latDeg: Math.round(latDeg * 100) / 100,
        lonDeg: Math.round(lonDeg * 100) / 100,
        faces: measured,
        statedConsumptionKwh: Math.round((baseKwh * (1 + c.billErrorSd * normal(r))) / 10) * 10,
        heatPump: heatPump ? { livingAreaM2: heatPump.livingAreaM2, buildingYear: heatPump.buildingYear } : undefined,
        ev: ev ? { kmPerYear: statedKm } : undefined,
        budgetEur,
      },
      truth: {
        faces,
        baseKwh,
        homeOffice,
        heatPump,
        ev,
        gridEurPerKwh: uniform(r, cfg.tariff.gridEurPerKwh),
        losses: uniform(r, cfg.system.losses),
        performance: 1 + 0.025 * normal(r),
        paybackToleranceYears: uniform(r, cfg.customer.paybackToleranceYears),
        budgetEur,
        decision: r(),
      },
    });
  }
  return out;
}

// The household's real hourly use: its own daily rhythm (home office shifts use into the day).
const WEEKDAY = [0.55, 0.45, 0.4, 0.38, 0.38, 0.45, 0.75, 1.05, 1.0, 0.85, 0.8, 0.88, 1.05, 0.95, 0.85, 0.85, 0.95, 1.25, 1.6, 1.75, 1.6, 1.35, 1.05, 0.75];
const HOME_OFFICE = [0.55, 0.45, 0.4, 0.38, 0.38, 0.45, 0.7, 0.95, 1.15, 1.2, 1.2, 1.25, 1.35, 1.25, 1.2, 1.15, 1.1, 1.25, 1.45, 1.55, 1.45, 1.25, 1.0, 0.72];

export function trueLoad(h: Household, tempC: Float64Array, cfg: WorldConfig["consumption"]): Float64Array {
  const t = h.truth;
  const shape = t.homeOffice ? HOME_OFFICE : WEEKDAY;
  const load = new Float64Array(HOURS);
  let total = 0;
  for (let i = 0; i < HOURS; i++) {
    const day = Math.floor(i / 24);
    const weekend = day % 7 >= 5;
    const s = weekend ? HOME_OFFICE[i % 24] * 1.08 : shape[i % 24];
    load[i] = s * (1 + 0.22 * Math.cos((2 * Math.PI * (day - 10)) / 365));
    total += load[i];
  }
  for (let i = 0; i < HOURS; i++) load[i] *= t.baseKwh / total;
  if (t.heatPump) {
    let degreeHours = 0;
    for (let i = 0; i < HOURS; i++) degreeHours += Math.max(0, cfg.heatingLimitC - tempC[i]);
    for (let i = 0; i < HOURS; i++) {
      const heat = (t.heatPump.heatKwh * Math.max(0, cfg.heatingLimitC - tempC[i])) / degreeHours + t.heatPump.hotWaterKwh / HOURS;
      const cop = Math.min(5, Math.max(1.7, cfg.copAt7C + cfg.copSlopePerK * (tempC[i] - 7)));
      load[i] += heat / cop;
    }
  }
  if (t.ev) {
    const perDay = (t.ev.kmPerYear * cfg.evKwhPerKm * t.ev.homeShare) / 365;
    for (let i = 0; i < HOURS; i++) {
      const hour = i % 24;
      const day = Math.floor(i / 24);
      // Some days the car charges at home in the afternoon, most in the evening.
      const afternoon = (day * 7919) % 10 < 3;
      if (afternoon ? hour >= 13 && hour < 17 : hour >= 18 && hour < 23) load[i] += perDay / (afternoon ? 4 : 5);
    }
  }
  return load;
}
