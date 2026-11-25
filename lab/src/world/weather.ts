// The weather that actually happens at a site in the simulated year. The product never sees
// it directly: it plans with its own typical year and, after installation, receives a noisy
// satellite estimate of it.
import { HOURS, sunAt } from "@ipe/sim";
import type { Weather } from "@ipe/sim";
import { normal, stream } from "../rng.ts";
import type { Region, WorldConfig } from "./config.ts";

const SEASON = [0.76, 0.86, 0.94, 1.02, 1.06, 1.08, 1.09, 1.06, 1.0, 0.89, 0.78, 0.73];
const MONTH_STARTS = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 365];

export interface RealizedWeather extends Weather {
  /** Days with heavy cloud, on which rain may wash soiled modules. */
  rainy: boolean[];
}

function monthOf(day: number): number {
  for (let m = 0; m < 12; m++) if (day < MONTH_STARTS[m + 1]) return m;
  return 11;
}

/** The region's year: one cloud pattern per region and seed, shared by its households. */
export function regionYear(seed: number, region: Region, cfg: WorldConfig["weather"]): { dayIndex: number[]; dayTemp: number[] } {
  const r = stream(seed, "weather", region.name);
  const yearFactor = 1 + cfg.regionYearSd * normal(r);
  const dayIndex: number[] = [];
  const dayTemp: number[] = [];
  let z = normal(r);
  let tz = normal(r);
  for (let day = 0; day < 365; day++) {
    z = cfg.dailyCloudPersistence * z + Math.sqrt(1 - cfg.dailyCloudPersistence ** 2) * normal(r);
    tz = 0.7 * tz + Math.sqrt(1 - 0.49) * normal(r);
    const mean = (region.clearness / 0.47) * 0.6 * SEASON[monthOf(day)] * yearFactor;
    dayIndex.push(Math.min(cfg.clearDayIndex + 0.24, Math.max(cfg.cloudyDayIndex * 0.4, mean * (1 + 0.5 * z))));
    dayTemp.push(region.tempMean - region.tempAmplitude * Math.cos((2 * Math.PI * (day - 18)) / 365) + 3.2 * tz);
  }
  return { dayIndex, dayTemp };
}

export function siteWeather(seed: number, householdId: string, latDeg: number, lonDeg: number, year: { dayIndex: number[]; dayTemp: number[] }, cfg: WorldConfig["weather"]): RealizedWeather {
  const r = stream(seed, "site-weather", householdId);
  const ghi = new Float64Array(HOURS);
  const tempC = new Float64Array(HOURS);
  const rainy: boolean[] = [];
  for (let day = 0; day < 365; day++) {
    const local = Math.min(0.98, Math.max(0.05, year.dayIndex[day] * (1 + 0.06 * normal(r))));
    rainy.push(local < cfg.rainyDayIndex);
    for (let hour = 0; hour < 24; hour++) {
      const h = day * 24 + hour;
      const cz = sunAt(h, latDeg, lonDeg).cosZenith;
      const clear = cz > 0 ? 1098 * cz * Math.exp(-0.057 / cz) : 0;
      ghi[h] = clear * Math.min(1, Math.max(0.03, local * (1 + 0.18 * normal(r))));
      tempC[h] = year.dayTemp[day] + 4.5 * Math.sin((2 * Math.PI * (hour - 9)) / 24) + local * 4;
    }
  }
  return { latDeg, lonDeg, ghi, tempC, rainy };
}

/** What a satellite irradiance service reports: the real weather with a daily error. */
export function satelliteEstimate(seed: number, householdId: string, real: Weather, errorSd: number): Weather {
  const r = stream(seed, "satellite", householdId);
  const ghi = new Float64Array(HOURS);
  for (let day = 0; day < 365; day++) {
    const e = 1 + errorSd * normal(r);
    for (let hour = 0; hour < 24; hour++) ghi[day * 24 + hour] = Math.max(0, real.ghi[day * 24 + hour] * e);
  }
  return { latDeg: real.latDeg, lonDeg: real.lonDeg, ghi, tempC: real.tempC };
}
