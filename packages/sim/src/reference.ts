// Independent TypeScript implementation of the energy model.
// It exists so the Rust engine can be checked: test/parity.test.ts runs both on random
// systems and requires agreement to 1e-9. Written from the equations, not from the Rust code.

import type { BalanceResult, FaceInput, ModuleSpec, SystemSpec, Weather } from "./types.ts";

export const HOURS = 8760;
export const HORIZON_BINS = 36;
const RAD = Math.PI / 180;
const MONTH_STARTS = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 365];

export interface SunPosition {
  cosZenith: number;
  elevationDeg: number;
  azimuthDeg: number;
  extraterrestrial: number;
}

export function sunAt(hour: number, latDeg: number, lonDeg: number): SunPosition {
  const dayOfYear = Math.floor(hour / 24) + 1;
  const clockHour = (hour % 24) + 0.5;
  const g = (2 * Math.PI * (dayOfYear - 1)) / 365; // day angle
  const declination =
    0.006918 -
    0.399912 * Math.cos(g) +
    0.070257 * Math.sin(g) -
    0.006758 * Math.cos(2 * g) +
    0.000907 * Math.sin(2 * g) -
    0.002697 * Math.cos(3 * g) +
    0.00148 * Math.sin(3 * g);
  const equationOfTimeMin =
    229.18 *
    (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const solarHour = clockHour + (4 * (lonDeg - 15) + equationOfTimeMin) / 60;
  const hourAngle = 15 * (solarHour - 12) * RAD;
  const lat = latDeg * RAD;
  const cosZenith = Math.min(1, Math.max(-1, Math.sin(lat) * Math.sin(declination) + Math.cos(lat) * Math.cos(declination) * Math.cos(hourAngle)));
  const elevationDeg = 90 - Math.acos(cosZenith) / RAD;
  let azimuthDeg = Math.atan2(Math.sin(hourAngle), Math.cos(hourAngle) * Math.sin(lat) - Math.tan(declination) * Math.cos(lat)) / RAD + 180;
  if (azimuthDeg >= 360) azimuthDeg -= 360;
  const extraterrestrial =
    1367 * (1.00011 + 0.034221 * Math.cos(g) + 0.00128 * Math.sin(g) + 0.000719 * Math.cos(2 * g) + 0.000077 * Math.sin(2 * g));
  return { cosZenith, elevationDeg, azimuthDeg, extraterrestrial };
}

/** Erbs decomposition: returns beam-normal and diffuse-horizontal irradiance. */
export function erbs(ghi: number, sun: SunPosition): { dni: number; dhi: number } {
  if (ghi <= 0 || sun.cosZenith <= 0) return { dni: 0, dhi: 0 };
  if (sun.cosZenith < 0.065) return { dni: 0, dhi: ghi };
  const kt = Math.min(1, Math.max(0, ghi / (sun.extraterrestrial * sun.cosZenith)));
  let diffuseFraction: number;
  if (kt <= 0.22) diffuseFraction = 1 - 0.09 * kt;
  else if (kt <= 0.8) diffuseFraction = 0.9511 - 0.1604 * kt + 4.388 * kt ** 2 - 16.638 * kt ** 3 + 12.336 * kt ** 4;
  else diffuseFraction = 0.165;
  const dhi = diffuseFraction * ghi;
  return { dni: (ghi - dhi) / sun.cosZenith, dhi };
}

export function horizonBinOf(azimuthDeg: number): number {
  const bin = Math.floor(azimuthDeg / 10);
  return ((bin % HORIZON_BINS) + HORIZON_BINS) % HORIZON_BINS;
}

function energyPerKwp(poa: number, ambient: number, module: ModuleSpec): number {
  if (poa <= 0) return 0;
  const cellTemp = ambient + (poa / 800) * (module.noct - 20);
  return Math.max(0, (poa / 1000) * (1 + module.gamma * (cellTemp - 25)));
}

export function faceProfileReference(weather: Weather, face: FaceInput, module: ModuleSpec): { shaded: Float64Array; unshaded: Float64Array } {
  const shaded = new Float64Array(HOURS);
  const unshaded = new Float64Array(HOURS);
  const tilt = face.tiltDeg * RAD;
  const horizon = face.horizonDeg;
  const meanHorizon = horizon.length ? horizon.reduce((a, b) => a + b, 0) / horizon.length : 0;
  const skyView = Math.min(1, Math.max(0, 1 - meanHorizon / 90));
  for (let h = 0; h < HOURS; h++) {
    const ghi = weather.ghi[h];
    if (ghi <= 0) continue;
    const sun = sunAt(h, weather.latDeg, weather.lonDeg);
    const { dni, dhi } = erbs(ghi, sun);
    const sinZenith = Math.sqrt(Math.max(0, 1 - sun.cosZenith * sun.cosZenith));
    const cosIncidence = sun.cosZenith * Math.cos(tilt) + sinZenith * Math.sin(tilt) * Math.cos((sun.azimuthDeg - face.azimuthDeg) * RAD);
    const direct = sun.cosZenith > 0 ? dni * Math.max(0, cosIncidence) : 0;
    const behindObstacle = horizon.length === HORIZON_BINS && sun.elevationDeg < horizon[horizonBinOf(sun.azimuthDeg)];
    const reflected = (ghi * module.albedo * (1 - Math.cos(tilt))) / 2;
    const skyDiffuse = (dhi * (1 + Math.cos(tilt))) / 2;
    unshaded[h] = energyPerKwp(direct + skyDiffuse + reflected, weather.tempC[h], module);
    shaded[h] = energyPerKwp((behindObstacle ? 0 : direct) + skyDiffuse * skyView + reflected, weather.tempC[h], module);
  }
  return { shaded, unshaded };
}

export function monthOfHour(hour: number): number {
  const day = Math.floor(hour / 24);
  for (let m = 0; m < 12; m++) if (day < MONTH_STARTS[m + 1]) return m;
  return 11;
}

export function balanceReference(
  pvDc: Float64Array,
  load: Float64Array,
  priceImport: Float64Array,
  feedIn: number,
  system: SystemSpec,
  keepHourly: boolean,
): BalanceResult {
  const r: BalanceResult = {
    pvKwh: 0, loadKwh: 0, selfConsumedKwh: 0, exportedKwh: 0, importedKwh: 0, clippedKwh: 0,
    batteryDischargedKwh: 0, billBeforeEur: 0, billAfterEur: 0, feedInEur: 0,
    monthlyPvKwh: new Array(12).fill(0), monthlyImportedKwh: new Array(12).fill(0), monthlyExportedKwh: new Array(12).fill(0),
    acKwh: new Float64Array(keepHourly ? HOURS : 0),
  };
  const oneWay = Math.sqrt(Math.max(1e-9, system.batteryEfficiency));
  const reserve = system.batteryKwh * system.batteryReserve;
  let stored = reserve;
  for (let h = 0; h < HOURS; h++) {
    const beforeLimit = pvDc[h] * (1 - system.losses);
    const ac = Math.min(beforeLimit, system.inverterKw);
    const demand = load[h];
    let fromGrid = 0;
    let toGrid = 0;
    if (ac >= demand) {
      const spare = ac - demand;
      const intoBattery = Math.min(spare, system.batteryKw, Math.max(0, (system.batteryKwh - stored) / oneWay));
      stored += intoBattery * oneWay;
      toGrid = spare - intoBattery;
    } else {
      const shortfall = demand - ac;
      const fromBattery = Math.min(shortfall, system.batteryKw, Math.max(0, (stored - reserve) * oneWay));
      stored -= fromBattery / oneWay;
      r.batteryDischargedKwh += fromBattery;
      fromGrid = shortfall - fromBattery;
    }
    const m = monthOfHour(h);
    r.pvKwh += ac;
    r.loadKwh += demand;
    r.importedKwh += fromGrid;
    r.exportedKwh += toGrid;
    r.clippedKwh += beforeLimit - ac;
    r.billBeforeEur += demand * priceImport[h];
    r.billAfterEur += fromGrid * priceImport[h];
    r.feedInEur += toGrid * feedIn;
    r.monthlyPvKwh[m] += ac;
    r.monthlyImportedKwh[m] += fromGrid;
    r.monthlyExportedKwh[m] += toGrid;
    if (keepHourly) r.acKwh[h] = ac;
  }
  r.selfConsumedKwh = r.loadKwh - r.importedKwh;
  return r;
}
