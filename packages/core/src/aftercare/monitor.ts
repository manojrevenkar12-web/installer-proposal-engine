// The aftercare agent's detector. Each day it receives the system's measured hourly yield and
// decides whether to raise an alarm. Two modes:
//   threshold  - the status quo: at month end, compare measured yield with the offer's promise.
//   normalized - compare with what the system should have produced in the weather that
//                actually happened (simulated from satellite irradiance), learn the system's
//                own ratio in its first weeks, and run a CUSUM on the shortfall. A cause is
//                named from the shape of the loss: by sun azimuth (shading), by speed (an
//                abrupt step is a string fault, a slow slide is soiling), or zero output.

import { sunAt } from "@ipe/sim";
import type { ProductConfig } from "../config.ts";
import type { AftercareMode } from "../types.ts";

export type Cause = "inverter-outage" | "string-fault" | "shading" | "soiling" | "underperformance";

export interface Alarm {
  day: number;
  kind: "fault" | "offline";
  cause: Cause | "monitoring-offline";
  /** Measured over expected over the days that triggered the alarm, 0..1+. */
  performance: number;
  /** Estimated energy lost per day, kWh. */
  lossKwhPerDay: number;
}

const MONTH_STARTS = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 365];
const AZIMUTH_BIN = 30;
const BINS = 360 / AZIMUTH_BIN;

interface DayRecord { day: number; ratio: number; act: number; exp: number; binAct: number[]; binExp: number[]; clean: boolean }

export class AftercareMonitor {
  private records: DayRecord[] = [];
  private baseline: number | null = null;
  private cusum = 0;
  private cusumStart = -1;
  private offlineRun = 0;
  private quietUntil = -1;
  private monthAct = 0;

  private mode: AftercareMode;
  private cfg: ProductConfig["aftercare"];
  /** Expected AC yield per hour given observed weather (normalized mode). */
  private expectedHourly: Float64Array;
  /** Promised yield per month from the offer (threshold mode). */
  private promisedMonthly: number[];
  private latDeg: number;
  private lonDeg: number;

  constructor(mode: AftercareMode, cfg: ProductConfig["aftercare"], expectedHourly: Float64Array, promisedMonthly: number[], latDeg: number, lonDeg: number) {
    this.mode = mode;
    this.cfg = cfg;
    this.expectedHourly = expectedHourly;
    this.promisedMonthly = promisedMonthly;
    this.latDeg = latDeg;
    this.lonDeg = lonDeg;
  }

  /** Observe one day of measurements (24 values, NaN where data is missing). */
  observeDay(day: number, measured: ArrayLike<number>): Alarm | null {
    return this.mode === "threshold" ? this.threshold(day, measured) : this.normalized(day, measured);
  }

  /** Tell the monitor a repair finished so it relearns nothing but stops counting the old loss. */
  resolved(day: number): void {
    this.cusum = 0;
    this.cusumStart = -1;
    this.quietUntil = Math.max(this.quietUntil, day + 2);
  }

  private threshold(day: number, measured: ArrayLike<number>): Alarm | null {
    for (let h = 0; h < 24; h++) this.monthAct += Number.isNaN(measured[h]) ? 0 : measured[h];
    const month = MONTH_STARTS.findIndex((s, i) => i > 0 && day === s - 1) - 1;
    if (month < 0) return null;
    const promised = this.promisedMonthly[month];
    const act = this.monthAct;
    this.monthAct = 0;
    if (promised > 0 && act < this.cfg.thresholdShare * promised && day > this.quietUntil) {
      const days = MONTH_STARTS[month + 1] - MONTH_STARTS[month];
      return { day, kind: "fault", cause: "underperformance", performance: act / promised, lossKwhPerDay: (promised - act) / days };
    }
    return null;
  }

  private normalized(day: number, measured: ArrayLike<number>): Alarm | null {
    let missing = 0;
    for (let h = 0; h < 24; h++) if (Number.isNaN(measured[h])) missing++;
    if (missing === 24) {
      this.offlineRun++;
      if (this.offlineRun === this.cfg.offlineAfterDays) {
        return { day, kind: "offline", cause: "monitoring-offline", performance: Number.NaN, lossKwhPerDay: 0 };
      }
      return null;
    }
    this.offlineRun = 0;
    let act = 0;
    let exp = 0;
    const binAct = new Array(BINS).fill(0);
    const binExp = new Array(BINS).fill(0);
    for (let h = 0; h < 24; h++) {
      const m = measured[h];
      if (Number.isNaN(m)) continue;
      const e = this.expectedHourly[day * 24 + h];
      act += m;
      exp += e;
      if (e > 0.02) {
        const bin = Math.floor(sunAt(day * 24 + h, this.latDeg, this.lonDeg).azimuthDeg / AZIMUTH_BIN) % BINS;
        binAct[bin] += m;
        binExp[bin] += e;
      }
    }
    if (exp < this.cfg.minExpectedKwh) return null;
    const ratio = act / exp;
    const record: DayRecord = { day, ratio, act, exp, binAct, binExp, clean: true };
    this.records.push(record);
    if (this.records.length > 120) this.records.shift();
    // The system's own normal: the median ratio of clean days 10 to 45 days ago. It follows the
    // seasons (the model's error changes with sun height) but not a fault younger than 10 days.
    const reference = this.records.filter((r) => r.clean && r.day < day - 10 && r.day >= day - 45);
    if (reference.length < this.cfg.baselineDays * 0.6) {
      if (this.records.length < this.cfg.baselineDays) return null;
    }
    const pool = reference.length >= this.cfg.baselineDays * 0.6 ? reference : this.records.filter((r) => r.clean && r !== record);
    if (pool.length < 5) return null;
    const ratios = pool.map((r) => r.ratio).sort((a, b) => a - b);
    this.baseline = ratios[Math.floor(ratios.length / 2)];
    const typicalExp = pool.map((r) => r.exp).sort((a, b) => a - b)[Math.floor(pool.length / 2)];
    if (day <= this.quietUntil) { record.clean = false; return null; }
    if (act <= 0.02 * exp) {
      record.clean = false;
      this.quietUntil = day + 3;
      this.cusum = 0;
      return { day, kind: "fault", cause: "inverter-outage", performance: ratio, lossKwhPerDay: exp * this.baseline - act };
    }
    // Low-yield days are noisy; they count less.
    const weight = Math.min(1, exp / typicalExp);
    const shortfall = (this.baseline - ratio) / this.baseline - this.cfg.cusumSlack;
    const before = this.cusum;
    this.cusum = Math.max(0, this.cusum + weight * shortfall);
    if (before === 0 && this.cusum > 0) this.cusumStart = day;
    if (this.cusum === 0) this.cusumStart = -1;
    else record.clean = false;
    if (this.cusum <= this.cfg.cusumLimit) return null;

    const window = this.records.filter((r) => r.day >= this.cusumStart);
    const wAct = window.reduce((s, r) => s + r.act, 0);
    const wExp = window.reduce((s, r) => s + r.exp, 0);
    const performance = wAct / wExp / this.baseline;
    const cause = this.classify(window, pool, day);
    this.cusum = 0;
    this.cusumStart = -1;
    this.quietUntil = day + 5;
    return { day, kind: "fault", cause, performance, lossKwhPerDay: (wExp * this.baseline - wAct) / window.length };
  }

  private classify(window: DayRecord[], pool: DayRecord[], day: number): Cause {
    const rel: number[] = [];
    const total = window.reduce((s, r) => s + r.exp, 0);
    for (let b = 0; b < BINS; b++) {
      const a = window.reduce((s, r) => s + r.binAct[b], 0);
      const e = window.reduce((s, r) => s + r.binExp[b], 0);
      const pa = pool.reduce((s, r) => s + r.binAct[b], 0);
      const pe = pool.reduce((s, r) => s + r.binExp[b], 0);
      if (e < 0.04 * total || pe <= 0 || pa <= 0) continue;
      rel.push(a / e / (pa / pe));
    }
    if (rel.length >= 3 && Math.max(...rel) - Math.min(...rel) > this.cfg.shadingBinSpread) return "shading";
    // A step is a string fault: a week ago the system was still normal. A slide is soiling:
    // it was already below its normal a week ago and has kept falling.
    const weekAgo = this.records.filter((r) => r.day >= day - 10 && r.day <= day - 4);
    const base = this.baseline ?? 1;
    const weekAgoRatio = weekAgo.length ? weekAgo.reduce((s, r) => s + r.act, 0) / weekAgo.reduce((s, r) => s + r.exp, 0) / base : 1;
    const month = this.records.filter((r) => r.day >= day - 30);
    const xs = month.map((r) => r.day);
    const ys = month.map((r) => r.ratio / base);
    const mx = xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
    const my = ys.reduce((a, b) => a + b, 0) / Math.max(1, ys.length);
    let num = 0;
    let den = 0;
    for (let i = 0; i < xs.length; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
    const slope = den > 0 ? num / den : 0;
    return weekAgoRatio < 1 - this.cfg.cusumSlack && slope < this.cfg.soilingSlopePerDay ? "soiling" : "string-fault";
  }
}
