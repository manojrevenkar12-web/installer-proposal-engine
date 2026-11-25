// The product's typical-year weather for a location: a stand-in for a PVGIS typical
// meteorological year. Clear-sky irradiance (Haurwitz) times a clear-sky index that varies
// day by day around a monthly climatology; deterministic for a given location.

import { HOURS, sunAt } from "@ipe/sim";
import type { Weather } from "@ipe/sim";

const MONTHLY_CLEAR_SKY_INDEX = [0.46, 0.52, 0.56, 0.61, 0.63, 0.64, 0.65, 0.64, 0.6, 0.53, 0.46, 0.43];
const MONTH_STARTS = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 365];

function hash(a: number, b: number, c: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35) ^ Math.imul(c + 0x27d4eb2f, 0x165667b1);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
  return (h >>> 0) / 2 ** 32;
}

export function clearSkyGhi(cosZenith: number): number {
  return cosZenith > 0 ? 1098 * cosZenith * Math.exp(-0.057 / cosZenith) : 0;
}

function monthOfDay(day: number): number {
  for (let m = 0; m < 12; m++) if (day < MONTH_STARTS[m + 1]) return m;
  return 11;
}

export function typicalYear(latDeg: number, lonDeg: number): Weather {
  const ghi = new Float64Array(HOURS);
  const tempC = new Float64Array(HOURS);
  const latKey = Math.round(latDeg * 10);
  const lonKey = Math.round(lonDeg * 10);
  const sunnier = 1 + (52 - latDeg) * 0.012;
  const tempMean = 9.8 + (52 - latDeg) * 0.15;
  for (let day = 0; day < 365; day++) {
    const month = monthOfDay(day);
    const u = hash(latKey, lonKey, day);
    // A day is clearer or cloudier than its month; the spread keeps the monthly mean.
    const index = Math.min(0.95, MONTHLY_CLEAR_SKY_INDEX[month] * sunnier * (0.45 + 1.1 * u));
    const dailyMean = tempMean - 9 * Math.cos((2 * Math.PI * (day - 15)) / 365) + (hash(lonKey, latKey, day) - 0.5) * 6;
    for (let hour = 0; hour < 24; hour++) {
      const h = day * 24 + hour;
      ghi[h] = clearSkyGhi(sunAt(h, latDeg, lonDeg).cosZenith) * index;
      tempC[h] = dailyMean + 4 * Math.sin((2 * Math.PI * (hour - 9)) / 24) + index * 3;
    }
  }
  return { latDeg, lonDeg, ghi, tempC };
}
