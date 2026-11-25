export interface RoofFace {
  azimuthDeg: number;
  tiltDeg: number;
  areaM2: number;
  /** Obstruction elevation per 10° of azimuth as measured at the site visit; empty if not measured. */
  horizonDeg: number[];
}

export interface Lead {
  id: string;
  latDeg: number;
  lonDeg: number;
  faces: RoofFace[];
  /** Annual consumption from the customer's last electricity bill. */
  statedConsumptionKwh: number;
  heatPump?: { livingAreaM2: number; buildingYear: number };
  ev?: { kmPerYear: number };
  budgetEur?: number;
}

export type SizingMode = "rules" | "optimiser" | "fill-roof";
export type EnergyMode = "rules" | "model-guess" | "hourly" | "monthly";
export type LoadMode = "bill" | "planned";
export type PromiseMode = "p50" | "haircut";
export type OfferMode = "template" | "agent-checked" | "agent-unchecked";
export type AftercareMode = "threshold" | "normalized";

export interface PlanOptions {
  sizing: SizingMode;
  energy: EnergyMode;
  shading: boolean;
  load: LoadMode;
  promise: PromiseMode;
}

export interface EnergyEstimate {
  yieldKwh: number;
  loadKwh: number;
  selfConsumedKwh: number;
  exportedKwh: number;
  savingsEur: number;
  monthlyPvKwh: number[];
}

export interface Plan {
  faceKwp: number[];
  kwp: number;
  batteryKwh: number;
  batteryKw: number;
  inverterKw: number;
  priceEur: number;
  feedInEurPerKwh: number;
  expected: EnergyEstimate;
  promise: { yieldKwh: number; savingsEur: number; monthlyPvKwh: number[] };
  paybackYears: number;
  npvEur: number;
  candidatesEvaluated: number;
}

/** What the product runs in production: the platform design of the study. */
export const PLATFORM_OPTIONS: PlanOptions = { sizing: "optimiser", energy: "hourly", shading: true, load: "planned", promise: "haircut" };
