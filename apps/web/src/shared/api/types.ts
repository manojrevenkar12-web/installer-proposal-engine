import type { Fact } from "@ipe/core/offer";

export type ProjectStatus = "LEAD" | "PLANNED" | "OFFERED" | "SIGNED" | "INSTALLED";
export type ProposalStatus = "DRAFT" | "SENT" | "ACCEPTED" | "SUPERSEDED";

export interface ProposalSummary { id: string; version: number; kwp: number; batteryKwh: number; priceEur: number; promisedSavingsEur: number; paybackYears: number; status: ProposalStatus }
export interface ProjectListItem {
  id: string; customerName: string; status: ProjectStatus; statedConsumptionKwh: number; latDeg: number; lonDeg: number; createdAt: string;
  proposals: ProposalSummary[]; _count: { alarms: number };
}
export interface RoofFace { id: string; position: number; azimuthDeg: number; tiltDeg: number; areaM2: number; horizonDeg: number[] }
export interface PlanJson {
  faceKwp: number[]; kwp: number; batteryKwh: number; inverterKw: number; priceEur: number; paybackYears: number; npvEur: number; candidatesEvaluated: number;
  expected: { yieldKwh: number; loadKwh: number; selfConsumedKwh: number; exportedKwh: number; savingsEur: number; monthlyPvKwh: number[] };
  promise: { yieldKwh: number; savingsEur: number; monthlyPvKwh: number[] };
  facts: Fact[];
}
export interface Proposal extends ProposalSummary { offerText: string; offerSource: string; draftsRejected: number; createdAt: string; plan: PlanJson; promisedYieldKwh: number }
export interface Alarm { id: string; projectId: string; day: number; kind: string; cause: string; performance: number | null; lossKwhPerDay: number; message: string; resolvedDay: number | null; project?: { id: string; customerName: string } }
export interface ProjectDetail extends Omit<ProjectListItem, "proposals" | "_count"> {
  heatPumpAreaM2: number | null; heatPumpBuildingYear: number | null; evKmPerYear: number | null; budgetEur: number | null;
  faces: RoofFace[]; proposals: Proposal[]; alarms: Alarm[];
}
export interface YearSeries { version: number | null; pvKwh: number[]; loadKwh: number[] }
export interface MonitoringSeries { days: { day: number; measuredKwh: number | null; expectedKwh: number }[] }
