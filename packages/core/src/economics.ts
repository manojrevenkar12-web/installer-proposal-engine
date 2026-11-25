import type { ProductConfig } from "./config.ts";

export function priceEur(kwp: number, batteryKwh: number, p: ProductConfig["prices"]): number {
  if (kwp <= 0) return 0;
  const pv = p.pvFixedEur + kwp * p.pvPerKwpEur;
  const battery = batteryKwh > 0 ? p.batteryFixedEur + batteryKwh * p.batteryPerKwhEur : 0;
  return Math.round(pv + battery);
}

/** EEG-style tiers: the first 10 kWp earn the full rate, the rest the lower one. */
export function feedInRate(kwp: number, t: { feedInEurPerKwh: number; feedInAbove10KwpEurPerKwh: number }): number {
  if (kwp <= 10) return t.feedInEurPerKwh;
  return (10 * t.feedInEurPerKwh + (kwp - 10) * t.feedInAbove10KwpEurPerKwh) / kwp;
}

/** Net present value of a system that saves `firstYearEur` in year one. */
export function npvEur(price: number, firstYearEur: number, e: ProductConfig["economics"]): number {
  let value = -price;
  for (let year = 1; year <= e.years; year++) {
    const nominal = firstYearEur * (1 + e.priceEscalation) ** (year - 1) * (1 - e.degradationPerYear) ** (year - 1);
    value += nominal / (1 + e.discountRate) ** year;
  }
  return value;
}

export function paybackYears(price: number, firstYearEur: number): number {
  return firstYearEur > 0 ? price / firstYearEur : Number.POSITIVE_INFINITY;
}
