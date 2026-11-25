import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface Region { name: string; lat: number; lon: number; clearness: number; tempMean: number; tempAmplitude: number; weight: number }
type Range = [number, number];

export interface WorldConfig {
  households: number;
  regions: Region[];
  weather: { dailyCloudPersistence: number; clearDayIndex: number; cloudyDayIndex: number; regionYearSd: number; siteJitterDeg: number; rainyDayIndex: number };
  roof: { faces: [number, number][]; areaM2: Range; tiltDeg: Range; mainAzimuthSd: number; obstacleProbability: number; obstacleHeightDeg: Range; obstacleWidthDeg: Range; backgroundHorizonDeg: Range; siteVisitErrorDeg: number };
  consumption: {
    baseKwh: Range; billErrorSd: number; homeOfficeProbability: number; heatPumpProbability: number; livingAreaM2: Range; buildingYear: Range;
    heatDemandKwhPerM2ByAge: [number, number][]; heatDemandSpread: number; hotWaterKwhPerYear: Range; heatingLimitC: number; copAt7C: number; copSlopePerK: number;
    evProbability: number; evKmPerYear: Range; evKwhPerKm: number; evHomeShare: Range;
  };
  tariff: { gridEurPerKwh: Range; feedInEurPerKwh: number; feedInAbove10KwpEurPerKwh: number };
  customer: { paybackToleranceYears: Range; decisionSoftnessYears: number; budgetEur: Range; complaintBelowShare: number };
  faults: {
    inverterOutage: { probability: number };
    stringFault: { probability: number; lossShare: Range };
    newShading: { probability: number; heightDeg: Range; widthDeg: Range };
    soiling: { probability: number; lossPerDay: Range; rainCleans: number };
    monitoringDropout: { probability: number; days: Range };
    repairDays: { outage: number; string: number; shading: number; soiling: number };
    satelliteErrorSd: number;
    earliestDay: number;
    diagnosisDaysWithoutCause: number;
  };
  system: { losses: Range };
  economics: { years: number; discountRate: number; priceEscalation: number; degradationPerYear: number };
}

const root = join(import.meta.dirname, "..", "..", "..");
export function loadWorldConfig(path = join(root, "config", "world.json")): WorldConfig {
  return JSON.parse(readFileSync(path, "utf8")) as WorldConfig;
}
