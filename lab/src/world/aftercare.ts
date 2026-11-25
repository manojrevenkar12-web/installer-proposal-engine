// Runs one installed system through its first year: the world produces measurements (with the
// drawn fault and data gaps), the product's monitor raises alarms, and a correct alarm leads to
// a repair. Returns what the installer and the customer experienced.
import { HORIZON_BINS, HOURS } from "@ipe/sim";
import type { Engine } from "@ipe/sim";
import type { Alarm, AftercareMonitor, Plan } from "@ipe/core";
import type { WorldConfig } from "./config.ts";
import type { Household } from "./households.ts";
import type { FaultPlan, HouseholdTruth } from "./truth.ts";

export interface AftercareOutcome {
  hadFault: boolean;
  faultKind: string | null;
  detectedDay: number | null;
  daysToDetect: number | null;
  causeCorrect: boolean | null;
  falseAlarms: number;
  offlineFlagged: boolean | null;
  lostKwh: number;
  /** Share of the yield the fault would take from its start to year end if nobody acted. */
  lossShareIfIgnored: number;
  alarms: Alarm[];
}

const CAUSE = { outage: "inverter-outage", string: "string-fault", shading: "shading", soiling: "soiling" } as const;

export function runAftercare(h: Household, truth: HouseholdTruth, plan: Plan, faults: FaultPlan, monitor: AftercareMonitor, cfg: WorldConfig, engine: Engine): AftercareOutcome {
  const f = faults.fault;
  const installed = plan.faceKwp.map((k) => k > 0);
  const shadedFace = installed.indexOf(true);
  let shadedProfile: Float64Array | null = null;
  if (f?.kind === "shading" && shadedFace >= 0) {
    const face = h.truth.faces[shadedFace];
    const horizon = face.horizonDeg.slice();
    for (let b = 0; b < HORIZON_BINS; b++) {
      const d = Math.abs(((b * 10 + 5 - f.obstacle.centre + 540) % 360) - 180);
      if (d < f.obstacle.width / 2) horizon[b] = Math.max(horizon[b], f.obstacle.height);
    }
    shadedProfile = engine.faceProfile(truth.weather, { azimuthDeg: face.azimuthDeg, tiltDeg: face.tiltDeg, horizonDeg: horizon }, { albedo: 0.2, noct: 46, gamma: -0.0037 }).shaded.map((x) => x * h.truth.performance);
  }
  let repairedDay = Number.POSITIVE_INFINITY;
  let detectedDay: number | null = null;
  let causeCorrect: boolean | null = null;
  let falseAlarms = 0;
  let offlineFlagged: boolean | null = faults.dropout ? false : null;
  let soiling = 0;
  let soilingIgnored = 0;
  let lostKwh = 0;
  let healthyAfterStart = 0;
  let lostIfIgnored = 0;
  const alarms: Alarm[] = [];
  const measured = new Float64Array(24);
  for (let day = 0; day < 365; day++) {
    const active = f !== null && day >= f.startDay && day < repairedDay;
    if (f?.kind === "soiling") {
      if (active) {
        soiling = Math.min(0.35, soiling + f.lossPerDay);
        if (truth.weather.rainy[day]) soiling *= 1 - cfg.faults.soiling.rainCleans;
      } else if (day >= repairedDay) soiling = 0;
      if (day >= f.startDay) {
        soilingIgnored = Math.min(0.35, soilingIgnored + f.lossPerDay);
        if (truth.weather.rainy[day]) soilingIgnored *= 1 - cfg.faults.soiling.rainCleans;
      }
    }
    const offline = faults.dropout !== null && day >= faults.dropout.startDay && day < faults.dropout.startDay + faults.dropout.days;
    for (let hour = 0; hour < 24; hour++) {
      const x = day * 24 + hour;
      let healthy = 0;
      let actual = 0;
      let ignored = 0;
      for (let i = 0; i < plan.faceKwp.length; i++) {
        const k = plan.faceKwp[i];
        if (k <= 0) continue;
        const dc = k * truth.faceDc[i][x];
        healthy += dc;
        actual += active && f?.kind === "shading" && i === shadedFace && shadedProfile ? k * shadedProfile[x] : dc;
        ignored += f?.kind === "shading" && day >= f.startDay && i === shadedFace && shadedProfile ? k * shadedProfile[x] : dc;
      }
      if (f && day >= f.startDay) {
        if (f.kind === "outage") ignored = 0;
        else if (f.kind === "string") ignored *= 1 - f.lossShare;
        else if (f.kind === "soiling") ignored *= 1 - soilingIgnored;
      }
      if (active && f) {
        if (f.kind === "outage") actual = 0;
        else if (f.kind === "string") actual *= 1 - f.lossShare;
        else if (f.kind === "soiling") actual *= 1 - soiling;
      }
      const acHealthy = Math.min(healthy * (1 - h.truth.losses), plan.inverterKw);
      const acActual = Math.min(actual * (1 - h.truth.losses), plan.inverterKw);
      lostKwh += acHealthy - acActual;
      if (f && day >= f.startDay) {
        healthyAfterStart += acHealthy;
        lostIfIgnored += acHealthy - Math.min(ignored * (1 - h.truth.losses), plan.inverterKw);
      }
      measured[hour] = offline ? Number.NaN : acActual;
    }
    const alarm = monitor.observeDay(day, measured);
    if (alarm) {
      alarms.push(alarm);
      if (alarm.kind === "offline") {
        if (offline) offlineFlagged = true; else falseAlarms++;
      } else if (active && f) {
        if (detectedDay === null) {
          detectedDay = day;
          causeCorrect = alarm.cause === CAUSE[f.kind];
          const repair = cfg.faults.repairDays[f.kind] + (causeCorrect ? 0 : cfg.faults.diagnosisDaysWithoutCause);
          repairedDay = day + repair;
        }
      } else if (!(f && day >= f.startDay && day < repairedDay + 3)) {
        falseAlarms++;
      }
    }
    if (day === repairedDay) monitor.resolved(day);
  }
  void HOURS;
  return {
    hadFault: f !== null,
    faultKind: f?.kind ?? null,
    detectedDay,
    daysToDetect: detectedDay !== null && f ? detectedDay - f.startDay : null,
    causeCorrect,
    falseAlarms,
    offlineFlagged,
    lostKwh,
    lossShareIfIgnored: healthyAfterStart > 0 ? lostIfIgnored / healthyAfterStart : 0,
    alarms,
  };
}

/** Measurements for a year with the fault left alone (no repairs): what a monitoring portal would upload. */
export function measuredYear(h: Household, truth: HouseholdTruth, plan: Plan, faults: FaultPlan, engine: Engine): Float64Array {
  const f = faults.fault;
  const shadedFace = plan.faceKwp.findIndex((k) => k > 0);
  let shadedProfile: Float64Array | null = null;
  if (f?.kind === "shading" && shadedFace >= 0) {
    const face = h.truth.faces[shadedFace];
    const horizon = face.horizonDeg.map((v, b) => {
      const d = Math.abs(((b * 10 + 5 - f.obstacle.centre + 540) % 360) - 180);
      return d < f.obstacle.width / 2 ? Math.max(v, f.obstacle.height) : v;
    });
    shadedProfile = engine.faceProfile(truth.weather, { azimuthDeg: face.azimuthDeg, tiltDeg: face.tiltDeg, horizonDeg: horizon }, { albedo: 0.2, noct: 46, gamma: -0.0037 }).shaded.map((x) => x * h.truth.performance);
  }
  const out = new Float64Array(HOURS);
  let soiling = 0;
  for (let day = 0; day < 365; day++) {
    const active = f !== null && day >= f.startDay;
    if (active && f.kind === "soiling") { soiling = Math.min(0.35, soiling + f.lossPerDay); if (truth.weather.rainy[day]) soiling *= 0.4; }
    const offline = faults.dropout !== null && day >= faults.dropout.startDay && day < faults.dropout.startDay + faults.dropout.days;
    for (let hour = 0; hour < 24; hour++) {
      const x = day * 24 + hour;
      let dc = 0;
      plan.faceKwp.forEach((k, i) => { if (k > 0) dc += active && f.kind === "shading" && i === shadedFace && shadedProfile ? k * shadedProfile[x] : k * truth.faceDc[i][x]; });
      if (active && f.kind === "outage") dc = 0;
      if (active && f.kind === "string") dc *= 1 - f.lossShare;
      if (active && f.kind === "soiling") dc *= 1 - soiling;
      out[x] = offline ? Number.NaN : Math.min(dc * (1 - h.truth.losses), plan.inverterKw);
    }
  }
  return out;
}
