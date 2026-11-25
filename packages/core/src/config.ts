import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface ProductConfig {
  module: { albedo: number; noct: number; gamma: number; kwpPerM2: number };
  system: { losses: number; inverterRatio: number; batteryEfficiency: number; batteryReserve: number; batteryCRate: number; batteryMaxKw: number };
  options: { faceFill: number[]; batteryKwh: number[]; minKwp: number };
  prices: { pvPerKwpEur: number; pvFixedEur: number; batteryPerKwhEur: number; batteryFixedEur: number };
  tariff: { gridEurPerKwh: number; feedInEurPerKwh: number; feedInAbove10KwpEurPerKwh: number };
  economics: { years: number; discountRate: number; priceEscalation: number; degradationPerYear: number };
  promise: { haircut: number };
  load: {
    heatDemandKwhPerM2ByAge: [number, number][];
    hotWaterKwhPerYear: number;
    heatingLimitC: number;
    copAt7C: number;
    copSlopePerK: number;
    evKwhPerKm: number;
    evHomeShare: number;
  };
  rules: {
    yieldKwhPerKwp: number;
    orientationFactor: [number, number][];
    selfConsumptionNoBattery: number;
    selfConsumptionWithBattery: number;
    batteryKwhPerKwp: number;
  };
  offer: { maxDrafts: number; model: string; language: "de" | "en" };
  aftercare: {
    baselineDays: number;
    minExpectedKwh: number;
    cusumSlack: number;
    cusumLimit: number;
    offlineAfterDays: number;
    shadingBinSpread: number;
    soilingSlopePerDay: number;
    thresholdShare: number;
  };
}

export const repoRoot = join(import.meta.dirname, "..", "..", "..");

export function loadProductConfig(path = join(repoRoot, "config", "product.json")): ProductConfig {
  return JSON.parse(readFileSync(path, "utf8")) as ProductConfig;
}
