import type { Lead } from "@ipe/core";

export interface ProjectWithFaces {
  id: string; latDeg: number; lonDeg: number; statedConsumptionKwh: number; heatPumpAreaM2: number | null; heatPumpBuildingYear: number | null;
  evKmPerYear: number | null; budgetEur: number | null; faces: { position: number; azimuthDeg: number; tiltDeg: number; areaM2: number; horizonDeg: number[] }[];
}

export function leadOf(p: ProjectWithFaces): Lead {
  return {
    id: p.id,
    latDeg: p.latDeg,
    lonDeg: p.lonDeg,
    statedConsumptionKwh: p.statedConsumptionKwh,
    heatPump: p.heatPumpAreaM2 && p.heatPumpBuildingYear ? { livingAreaM2: p.heatPumpAreaM2, buildingYear: p.heatPumpBuildingYear } : undefined,
    ev: p.evKmPerYear ? { kmPerYear: p.evKmPerYear } : undefined,
    budgetEur: p.budgetEur ?? undefined,
    faces: [...p.faces].sort((a, b) => a.position - b.position).map((f) => ({ azimuthDeg: f.azimuthDeg, tiltDeg: f.tiltDeg, areaM2: f.areaM2, horizonDeg: f.horizonDeg })),
  };
}
