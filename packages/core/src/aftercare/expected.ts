// What a built system should have produced, hour by hour, in the weather that happened.
import { HOURS } from "@ipe/sim";
import type { Engine, Weather } from "@ipe/sim";
import type { ProductConfig } from "../config.ts";
import type { Lead, Plan } from "../types.ts";

export function expectedHourly(lead: Lead, plan: Plan, observed: Weather, engine: Engine, cfg: ProductConfig, useHorizon: boolean): Float64Array {
  const pv = new Float64Array(HOURS);
  lead.faces.forEach((f, i) => {
    const kwp = plan.faceKwp[i];
    if (kwp <= 0) return;
    const p = engine.faceProfile(observed, { azimuthDeg: f.azimuthDeg, tiltDeg: f.tiltDeg, horizonDeg: useHorizon ? f.horizonDeg : [] }, cfg.module).shaded;
    for (let h = 0; h < HOURS; h++) pv[h] += kwp * p[h];
  });
  const none = new Float64Array(HOURS);
  return engine.balance(pv, none, none, 0, { losses: cfg.system.losses, inverterKw: plan.inverterKw, batteryKwh: 0, batteryKw: 0, batteryEfficiency: 1, batteryReserve: 0 }, true).acKwh;
}
