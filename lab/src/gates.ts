import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Metrics } from "./study.ts";

export interface Gate {
  id: string; metric: keyof Metrics; label: string;
  max?: number; min?: number; maxShareOfStatusQuo?: number; minDeltaVsStatusQuo?: number;
}
export interface GateResult { id: string; label: string; value: number; limit: string; pass: boolean }

export function loadGates(path = join(import.meta.dirname, "..", "..", "config", "gates.json")): Gate[] {
  return JSON.parse(readFileSync(path, "utf8")).gates as Gate[];
}

export function checkGates(gates: Gate[], platform: Metrics, statusQuo: Metrics): GateResult[] {
  return gates.map((g) => {
    const value = platform[g.metric] as number;
    const sq = statusQuo[g.metric] as number;
    let pass = Number.isFinite(value);
    let limit = "";
    if (g.max !== undefined) { pass &&= value <= g.max; limit = `≤ ${g.max}`; }
    if (g.min !== undefined) { pass &&= value >= g.min; limit = `≥ ${g.min}`; }
    if (g.maxShareOfStatusQuo !== undefined) { pass &&= value <= g.maxShareOfStatusQuo * sq; limit = `≤ ${g.maxShareOfStatusQuo} × spreadsheet (${fmt(sq)})`; }
    if (g.minDeltaVsStatusQuo !== undefined) { pass &&= value - sq > g.minDeltaVsStatusQuo; limit = `> spreadsheet (${fmt(sq)})`; }
    return { id: g.id, label: g.label, value, limit, pass };
  });
}

function fmt(x: number): string {
  return Math.abs(x) >= 100 ? Math.round(x).toLocaleString("en-GB") : Number(x.toPrecision(3)).toString();
}
