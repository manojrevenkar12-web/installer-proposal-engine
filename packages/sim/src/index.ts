// Loads the Rust engine (napi-rs addon) and exposes it next to the TypeScript reference.
// The product uses the Rust engine; the reference exists to check it (see test/parity.test.ts).

import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { HOURS, balanceReference, faceProfileReference } from "./reference.ts";
import type { BalanceResult, Engine, FaceInput, ModuleSpec, SystemSpec, Weather } from "./types.ts";

export type * from "./types.ts";
export { HORIZON_BINS, HOURS, monthOfHour, sunAt } from "./reference.ts";

interface NativeBalance {
  pvKwh: number; loadKwh: number; selfConsumedKwh: number; exportedKwh: number; importedKwh: number; clippedKwh: number;
  batteryDischargedKwh: number; billBeforeEur: number; billAfterEur: number; feedInEur: number;
  monthlyPvKwh: number[]; monthlyImportedKwh: number[]; monthlyExportedKwh: number[]; acKwh: Float64Array;
}
interface NativeModule {
  faceProfile(ghi: Float64Array, temp: Float64Array, lat: number, lon: number, azimuth: number, tilt: number,
    horizon: Float64Array, albedo: number, noct: number, gamma: number): Float64Array;
  balance(pvDc: Float64Array, load: Float64Array, price: Float64Array, feedIn: number, system: SystemSpec, keepHourly: boolean): NativeBalance;
}

export const nativePath = join(import.meta.dirname, "..", "native", `ipe_sim.${process.platform}-${process.arch}.node`);

let native: NativeModule | null | undefined;
function loadNative(): NativeModule | null {
  if (native !== undefined) return native;
  native = existsSync(nativePath) ? (createRequire(import.meta.url)(nativePath) as NativeModule) : null;
  return native;
}

export const referenceEngine: Engine = {
  name: "reference",
  faceProfile: faceProfileReference,
  balance: balanceReference,
};

export function rustEngine(): Engine {
  const mod = loadNative();
  if (!mod) throw new Error(`Rust simulation not built: run "npm run build:native" (looked for ${nativePath})`);
  return {
    name: "rust",
    faceProfile(weather: Weather, face: FaceInput, module: ModuleSpec) {
      const both = mod.faceProfile(weather.ghi, weather.tempC, weather.latDeg, weather.lonDeg, face.azimuthDeg, face.tiltDeg,
        Float64Array.from(face.horizonDeg), module.albedo, module.noct, module.gamma);
      return { shaded: both.subarray(0, HOURS), unshaded: both.subarray(HOURS) };
    },
    balance(pvDc, load, priceImport, feedIn, system, keepHourly): BalanceResult {
      return mod.balance(pvDc, load, priceImport, feedIn, system, keepHourly);
    },
  };
}

/** The Rust engine when it is built; otherwise the reference, with a warning once. */
let warned = false;
export function defaultEngine(): Engine {
  if (loadNative()) return rustEngine();
  if (!warned && process.env.IPE_REQUIRE_RUST !== "0") {
    warned = true;
    console.warn(`[sim] Rust engine missing at ${nativePath}; using the TypeScript reference`);
  }
  if (process.env.IPE_REQUIRE_RUST === "1") throw new Error("IPE_REQUIRE_RUST=1 but the Rust engine is not built");
  return referenceEngine;
}
