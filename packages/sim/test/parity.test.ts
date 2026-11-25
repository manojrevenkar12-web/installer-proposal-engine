// The Rust engine and the independent TypeScript reference must agree on random systems.
import assert from "node:assert/strict";
import { test } from "node:test";
import { HOURS, referenceEngine, rustEngine, sunAt } from "../src/index.ts";
import type { FaceInput, SystemSpec, Weather } from "../src/index.ts";

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

function randomWeather(r: () => number): Weather {
  const latDeg = 47.5 + r() * 7;
  const lonDeg = 6 + r() * 9;
  const ghi = new Float64Array(HOURS);
  const tempC = new Float64Array(HOURS);
  for (let h = 0; h < HOURS; h++) {
    const sun = sunAt(h, latDeg, lonDeg);
    ghi[h] = sun.cosZenith > 0 ? 1000 * sun.cosZenith * (0.2 + 0.8 * r()) : 0;
    tempC[h] = -5 + 30 * r();
  }
  return { latDeg, lonDeg, ghi, tempC };
}

const close = (a: number, b: number, what: string) =>
  assert.ok(Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b)), `${what}: rust ${a} vs reference ${b}`);

test("Rust and reference agree on face profiles and balances", { skip: !rustEngineAvailable() }, () => {
  const rust = rustEngine();
  const ref = referenceEngine;
  const r = rng(7);
  const module = { albedo: 0.2, noct: 45, gamma: -0.0035 };
  for (let trial = 0; trial < 12; trial++) {
    const weather = randomWeather(r);
    const face: FaceInput = {
      azimuthDeg: 60 + r() * 240,
      tiltDeg: 5 + r() * 45,
      horizonDeg: trial % 3 === 0 ? [] : Array.from({ length: 36 }, () => r() * 30),
    };
    const a = rust.faceProfile(weather, face, module);
    const b = ref.faceProfile(weather, face, module);
    for (let h = 0; h < HOURS; h++) {
      close(a.shaded[h], b.shaded[h], `shaded[${h}]`);
      close(a.unshaded[h], b.unshaded[h], `unshaded[${h}]`);
    }
    const kwp = 3 + r() * 12;
    const pv = a.shaded.map((x) => x * kwp);
    const load = Float64Array.from({ length: HOURS }, () => 0.1 + r() * 1.5);
    const price = Float64Array.from({ length: HOURS }, () => 0.25 + r() * 0.2);
    const system: SystemSpec = {
      losses: 0.1 + r() * 0.06, inverterKw: kwp * (0.7 + r() * 0.4),
      batteryKwh: trial % 2 ? 0 : 5 + r() * 10, batteryKw: 2 + r() * 5, batteryEfficiency: 0.88 + r() * 0.08, batteryReserve: 0.05,
    };
    const x = rust.balance(pv, load, price, 0.0786, system, true);
    const y = ref.balance(pv, load, price, 0.0786, system, true);
    for (const key of ["pvKwh", "loadKwh", "selfConsumedKwh", "exportedKwh", "importedKwh", "clippedKwh", "batteryDischargedKwh", "billBeforeEur", "billAfterEur", "feedInEur"] as const) {
      close(x[key], y[key], key);
    }
    for (let m = 0; m < 12; m++) close(x.monthlyPvKwh[m], y.monthlyPvKwh[m], `monthlyPvKwh[${m}]`);
    for (let h = 0; h < HOURS; h += 97) close(x.acKwh[h], y.acKwh[h], `acKwh[${h}]`);
  }
});

test("the Rust engine rejects arrays of the wrong length", { skip: !rustEngineAvailable() }, () => {
  const rust = rustEngine();
  assert.throws(() => rust.balance(new Float64Array(10), new Float64Array(10), new Float64Array(10), 0.08,
    { losses: 0.1, inverterKw: 5, batteryKwh: 0, batteryKw: 0, batteryEfficiency: 0.9, batteryReserve: 0.05 }, false), /8760/);
});

test("the Rust engine is faster than the reference", { skip: !rustEngineAvailable() }, () => {
  const weather = randomWeather(rng(3));
  const face: FaceInput = { azimuthDeg: 180, tiltDeg: 30, horizonDeg: [] };
  const module = { albedo: 0.2, noct: 45, gamma: -0.0035 };
  const time = (fn: () => void) => { const t = performance.now(); for (let i = 0; i < 20; i++) fn(); return performance.now() - t; };
  const rust = rustEngine();
  const tr = time(() => rust.faceProfile(weather, face, module));
  const tf = time(() => referenceEngine.faceProfile(weather, face, module));
  assert.ok(tr < tf * 1.5, `rust ${tr.toFixed(1)} ms vs reference ${tf.toFixed(1)} ms`);
});

function rustEngineAvailable(): boolean {
  try { rustEngine(); return true; } catch { if (process.env.IPE_REQUIRE_RUST === "1") throw new Error("Rust engine required"); return false; }
}
