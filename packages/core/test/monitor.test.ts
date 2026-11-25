import assert from "node:assert/strict";
import { test } from "node:test";
import { HOURS, sunAt } from "@ipe/sim";
import { AftercareMonitor, loadProductConfig } from "../src/index.ts";

const cfg = loadProductConfig().aftercare;
const lat = 50.1;
const lon = 8.7;

function year(): Float64Array {
  const e = new Float64Array(HOURS);
  for (let h = 0; h < HOURS; h++) { const cz = sunAt(h, lat, lon).cosZenith; e[h] = cz > 0 ? 6 * cz : 0; }
  return e;
}
function rng(seed: number) { let s = seed; return () => ((s = (s * 48271) % 2147483647) / 2147483647); }

function run(expected: Float64Array, measure: (day: number, hour: number, base: number) => number) {
  const m = new AftercareMonitor("normalized", cfg, expected, new Array(12).fill(0), lat, lon);
  const alarms = [];
  const day = new Float64Array(24);
  for (let d = 0; d < 365; d++) {
    for (let h = 0; h < 24; h++) day[h] = measure(d, h, expected[d * 24 + h]);
    const a = m.observeDay(d, day);
    if (a) alarms.push(a);
  }
  return alarms;
}

test("a healthy system with noisy data raises no alarm in a year", () => {
  const r = rng(11);
  const noise = Array.from({ length: 365 }, () => 0.92 + 0.08 * r());
  assert.deepEqual(run(year(), (d, _h, e) => e * noise[d]), []);
});

test("an inverter outage is reported on its first day", () => {
  const alarms = run(year(), (d, _h, e) => (d >= 150 ? 0 : e * 0.95));
  assert.equal(alarms[0].day, 150);
  assert.equal(alarms[0].cause, "inverter-outage");
});

test("a string fault is found within three days and named", () => {
  const alarms = run(year(), (d, _h, e) => e * (d >= 200 ? 0.6 : 0.95));
  assert.ok(alarms[0].day >= 200 && alarms[0].day <= 203, `day ${alarms[0].day}`);
  assert.equal(alarms[0].cause, "string-fault");
});

test("a data gap is flagged once as offline, not as a fault", () => {
  const alarms = run(year(), (d, _h, e) => (d >= 90 && d < 96 ? Number.NaN : e * 0.95));
  assert.deepEqual(alarms.map((a) => [a.kind, a.day]), [["offline", 90 + cfg.offlineAfterDays - 1]]);
});

test("the threshold monitor compares month totals with the promise", () => {
  const promised = new Array(12).fill(100);
  const m = new AftercareMonitor("threshold", cfg, new Float64Array(HOURS), promised, lat, lon);
  const day = new Float64Array(24).fill(0.08); // 1.92 kWh a day, about 60 a month
  let alarm = null;
  for (let d = 0; d < 31 && !alarm; d++) alarm = m.observeDay(d, day);
  assert.equal(alarm?.day, 30);
  assert.equal(alarm?.cause, "underperformance");
});
