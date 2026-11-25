// The product's estimate of a household's hourly electricity use.
// Base use follows a standard household profile scaled to the stated consumption; a planned
// heat pump and electric car are added when the planner is asked to include them.

import { HOURS } from "@ipe/sim";
import type { Weather } from "@ipe/sim";
import type { ProductConfig } from "./config.ts";
import type { Lead, LoadMode } from "./types.ts";

// Hourly weights of a working-day household (BDEW H0-like), morning and evening peaks.
export const STANDARD_DAY = [0.5, 0.42, 0.38, 0.36, 0.36, 0.42, 0.7, 1.0, 1.05, 0.95, 0.9, 0.95, 1.1, 1.0, 0.9, 0.88, 0.95, 1.2, 1.55, 1.7, 1.6, 1.35, 1.05, 0.72];

export function baseProfile(annualKwh: number, shape: readonly number[] = STANDARD_DAY, seasonal = 0.18): Float64Array {
  const out = new Float64Array(HOURS);
  let total = 0;
  for (let h = 0; h < HOURS; h++) {
    const day = Math.floor(h / 24);
    const season = 1 + seasonal * Math.cos((2 * Math.PI * (day - 15)) / 365);
    out[h] = shape[h % 24] * season;
    total += out[h];
  }
  for (let h = 0; h < HOURS; h++) out[h] *= annualKwh / total;
  return out;
}

export function specificHeatDemand(buildingYear: number, table: [number, number][]): number {
  for (const [until, kwhPerM2] of table) if (buildingYear <= until) return kwhPerM2;
  return table[table.length - 1][1];
}

/** Electricity a heat pump draws, hour by hour, for a heat demand spread over heating degree hours. */
export function heatPumpProfile(
  heatKwh: number,
  hotWaterKwh: number,
  weather: Weather,
  limitC: number,
  copAt7C: number,
  copSlope: number,
): Float64Array {
  const out = new Float64Array(HOURS);
  let degreeHours = 0;
  for (let h = 0; h < HOURS; h++) degreeHours += Math.max(0, limitC - weather.tempC[h]);
  const hotWaterPerHour = hotWaterKwh / HOURS;
  for (let h = 0; h < HOURS; h++) {
    const t = weather.tempC[h];
    const heat = degreeHours > 0 ? (heatKwh * Math.max(0, limitC - t)) / degreeHours : 0;
    const cop = Math.min(5, Math.max(1.8, copAt7C + copSlope * (t - 7)));
    out[h] = (heat + hotWaterPerHour) / cop;
  }
  return out;
}

/** Evening charging, 18:00 to 23:00, every day. */
export function evProfile(annualKwh: number, startHour = 18, hours = 5): Float64Array {
  const out = new Float64Array(HOURS);
  const perHour = annualKwh / 365 / hours;
  for (let h = 0; h < HOURS; h++) {
    const hour = h % 24;
    if (hour >= startHour && hour < startHour + hours) out[h] = perHour;
  }
  return out;
}

export function estimateLoad(lead: Lead, mode: LoadMode, weather: Weather, cfg: ProductConfig["load"]): Float64Array {
  const load = baseProfile(lead.statedConsumptionKwh);
  if (mode === "bill") return load;
  if (lead.heatPump) {
    const heat = lead.heatPump.livingAreaM2 * specificHeatDemand(lead.heatPump.buildingYear, cfg.heatDemandKwhPerM2ByAge);
    const hp = heatPumpProfile(heat, cfg.hotWaterKwhPerYear, weather, cfg.heatingLimitC, cfg.copAt7C, cfg.copSlopePerK);
    for (let h = 0; h < HOURS; h++) load[h] += hp[h];
  }
  if (lead.ev) {
    const ev = evProfile(lead.ev.kmPerYear * cfg.evKwhPerKm * cfg.evHomeShare);
    for (let h = 0; h < HOURS; h++) load[h] += ev[h];
  }
  return load;
}
