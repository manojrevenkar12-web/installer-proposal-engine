/** One year of hourly weather at a site: 8,760 values each. */
export interface Weather {
  latDeg: number;
  lonDeg: number;
  /** Global horizontal irradiance, hourly mean W/m² (equals Wh/m² for the hour). */
  ghi: Float64Array;
  /** Ambient temperature, °C. */
  tempC: Float64Array;
}

export interface FaceInput {
  /** Clockwise from north: 180 is south, 90 east, 270 west. */
  azimuthDeg: number;
  tiltDeg: number;
  /** Obstruction elevation in 36 bins of 10° azimuth, or empty for an open horizon. */
  horizonDeg: number[];
}

export interface ModuleSpec {
  albedo: number;
  noct: number;
  gamma: number;
}

export interface SystemSpec {
  losses: number;
  inverterKw: number;
  batteryKwh: number;
  batteryKw: number;
  batteryEfficiency: number;
  batteryReserve: number;
}

export interface BalanceResult {
  pvKwh: number;
  loadKwh: number;
  selfConsumedKwh: number;
  exportedKwh: number;
  importedKwh: number;
  clippedKwh: number;
  batteryDischargedKwh: number;
  billBeforeEur: number;
  billAfterEur: number;
  feedInEur: number;
  monthlyPvKwh: number[];
  monthlyImportedKwh: number[];
  monthlyExportedKwh: number[];
  acKwh: Float64Array;
}

export interface Engine {
  name: "rust" | "reference";
  faceProfile(weather: Weather, face: FaceInput, module: ModuleSpec): { shaded: Float64Array; unshaded: Float64Array };
  balance(pvDc: Float64Array, load: Float64Array, priceImport: Float64Array, feedIn: number, system: SystemSpec, keepHourly: boolean): BalanceResult;
}
