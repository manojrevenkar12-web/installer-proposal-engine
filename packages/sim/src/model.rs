//! The energy model, free of any Node binding so it can be tested with `cargo test`.
//!
//! One year has 8,760 hours (no leap day). Hour `h` covers local standard time (UTC+1)
//! `h % 24` to `h % 24 + 1` on day `h / 24 + 1`; the sun is placed at the middle of the hour.
//!
//! The TypeScript reference in `reference.ts` implements the same physics independently;
//! `test/parity.test.ts` checks that both agree to 1e-9 on random systems.

use std::f64::consts::PI;

pub const HOURS: usize = 8760;
pub const HORIZON_BINS: usize = 36;
const DEG: f64 = PI / 180.0;
const MONTH_DAYS: [usize; 12] = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

#[derive(Clone, Copy, Debug)]
pub struct Sun {
    /// Cosine of the zenith angle.
    pub cos_zenith: f64,
    /// Elevation above the horizon, degrees.
    pub elevation: f64,
    /// Azimuth clockwise from north, degrees in [0, 360).
    pub azimuth: f64,
    /// Extraterrestrial normal irradiance, W/m².
    pub extra: f64,
}

/// Sun position for the middle of hour `hour` (0..8760) at latitude/longitude in degrees.
/// Spencer (1971) declination and equation of time; clock time is UTC+1.
pub fn sun_position(hour: usize, lat: f64, lon: f64) -> Sun {
    let day = (hour / 24) as f64 + 1.0;
    let clock = (hour % 24) as f64 + 0.5;
    let b = 2.0 * PI * (day - 1.0) / 365.0;
    let decl = 0.006918 - 0.399912 * b.cos() + 0.070257 * b.sin() - 0.006758 * (2.0 * b).cos()
        + 0.000907 * (2.0 * b).sin()
        - 0.002697 * (3.0 * b).cos()
        + 0.00148 * (3.0 * b).sin();
    let eot = 229.18
        * (0.000075 + 0.001868 * b.cos()
            - 0.032077 * b.sin()
            - 0.014615 * (2.0 * b).cos()
            - 0.040849 * (2.0 * b).sin());
    let solar_time = clock + (4.0 * (lon - 15.0) + eot) / 60.0;
    let omega = (15.0 * (solar_time - 12.0)) * DEG;
    let phi = lat * DEG;
    let cos_z = (phi.sin() * decl.sin() + phi.cos() * decl.cos() * omega.cos()).clamp(-1.0, 1.0);
    let elevation = 90.0 - cos_z.acos() / DEG;
    let az_south = omega
        .sin()
        .atan2(omega.cos() * phi.sin() - decl.tan() * phi.cos());
    let mut azimuth = az_south / DEG + 180.0;
    if azimuth >= 360.0 {
        azimuth -= 360.0;
    }
    let extra = 1367.0
        * (1.00011
            + 0.034221 * b.cos()
            + 0.00128 * b.sin()
            + 0.000719 * (2.0 * b).cos()
            + 0.000077 * (2.0 * b).sin());
    Sun {
        cos_zenith: cos_z,
        elevation,
        azimuth,
        extra,
    }
}

/// Erbs et al. (1982) split of global horizontal irradiance into beam-normal and diffuse.
/// Returns (dni, dhi). Below 0.065 cos-zenith all light is treated as diffuse.
pub fn split_irradiance(ghi: f64, sun: &Sun) -> (f64, f64) {
    if ghi <= 0.0 || sun.cos_zenith <= 0.0 {
        return (0.0, 0.0);
    }
    if sun.cos_zenith < 0.065 {
        return (0.0, ghi);
    }
    let kt = (ghi / (sun.extra * sun.cos_zenith)).clamp(0.0, 1.0);
    let kd = if kt <= 0.22 {
        1.0 - 0.09 * kt
    } else if kt <= 0.8 {
        0.9511 - 0.1604 * kt + 4.388 * kt * kt - 16.638 * kt.powi(3) + 12.336 * kt.powi(4)
    } else {
        0.165
    };
    let dhi = kd * ghi;
    let dni = (ghi - dhi) / sun.cos_zenith;
    (dni, dhi)
}

#[derive(Clone, Copy, Debug)]
pub struct Module {
    pub albedo: f64,
    /// Nominal operating cell temperature, °C.
    pub noct: f64,
    /// Power temperature coefficient, 1/K (negative).
    pub gamma: f64,
}

/// Index of the 10° horizon bin that contains a sun azimuth.
pub fn horizon_bin(azimuth: f64) -> usize {
    let bin = (azimuth / 10.0).floor() as i64;
    bin.rem_euclid(HORIZON_BINS as i64) as usize
}

/// DC energy per installed kWp, hour by hour, for one roof face.
/// Returns (shaded, unshaded); unshaded ignores the horizon so the loss can be reported.
#[allow(clippy::too_many_arguments)]
pub fn face_profile(
    ghi: &[f64],
    temp: &[f64],
    lat: f64,
    lon: f64,
    azimuth: f64,
    tilt: f64,
    horizon: &[f64],
    module: Module,
) -> (Vec<f64>, Vec<f64>) {
    let beta = tilt * DEG;
    let mean_horizon = if horizon.is_empty() {
        0.0
    } else {
        horizon.iter().sum::<f64>() / horizon.len() as f64
    };
    let sky_view = (1.0 - mean_horizon / 90.0).clamp(0.0, 1.0);
    let mut shaded = vec![0.0; HOURS];
    let mut open = vec![0.0; HOURS];
    for h in 0..HOURS {
        let g = ghi[h];
        if g <= 0.0 {
            continue;
        }
        let sun = sun_position(h, lat, lon);
        let (dni, dhi) = split_irradiance(g, &sun);
        let sin_z = (1.0 - sun.cos_zenith * sun.cos_zenith).max(0.0).sqrt();
        let cos_aoi = sun.cos_zenith * beta.cos()
            + sin_z * beta.sin() * ((sun.azimuth - azimuth) * DEG).cos();
        let beam = if sun.cos_zenith > 0.0 {
            dni * cos_aoi.max(0.0)
        } else {
            0.0
        };
        let blocked =
            horizon.len() == HORIZON_BINS && sun.elevation < horizon[horizon_bin(sun.azimuth)];
        let ground = g * module.albedo * (1.0 - beta.cos()) / 2.0;
        let sky = dhi * (1.0 + beta.cos()) / 2.0;
        let poa_open = beam + sky + ground;
        let poa = if blocked { 0.0 } else { beam } + sky * sky_view + ground;
        shaded[h] = dc_per_kwp(poa, temp[h], module);
        open[h] = dc_per_kwp(poa_open, temp[h], module);
    }
    (shaded, open)
}

fn dc_per_kwp(poa: f64, ambient: f64, module: Module) -> f64 {
    if poa <= 0.0 {
        return 0.0;
    }
    let cell = ambient + poa / 800.0 * (module.noct - 20.0);
    (poa / 1000.0 * (1.0 + module.gamma * (cell - 25.0))).max(0.0)
}

#[derive(Clone, Copy, Debug)]
pub struct System {
    /// Fraction lost between DC and AC before the inverter limit (wiring, mismatch, inverter).
    pub losses: f64,
    pub inverter_kw: f64,
    pub battery_kwh: f64,
    pub battery_kw: f64,
    /// Round-trip efficiency; charge and discharge each lose its square root.
    pub battery_efficiency: f64,
    /// Lowest state of charge as a fraction of capacity.
    pub battery_reserve: f64,
}

#[derive(Clone, Debug, Default)]
pub struct Balance {
    pub pv_kwh: f64,
    pub load_kwh: f64,
    pub self_consumed_kwh: f64,
    pub exported_kwh: f64,
    pub imported_kwh: f64,
    pub clipped_kwh: f64,
    pub battery_discharged_kwh: f64,
    pub bill_before_eur: f64,
    pub bill_after_eur: f64,
    pub feed_in_eur: f64,
    pub monthly_pv_kwh: Vec<f64>,
    pub monthly_imported_kwh: Vec<f64>,
    pub monthly_exported_kwh: Vec<f64>,
    pub ac_kwh: Vec<f64>,
}

/// Month (0..12) of hour `hour`.
pub fn month_of(hour: usize) -> usize {
    let mut day = hour / 24;
    for (m, days) in MONTH_DAYS.iter().enumerate() {
        if day < *days {
            return m;
        }
        day -= days;
    }
    11
}

/// Hour-by-hour energy balance of a household with PV and an optional battery.
/// The battery charges from PV surplus only and discharges to cover household load.
pub fn balance(
    pv_dc: &[f64],
    load: &[f64],
    price_import: &[f64],
    feed_in: f64,
    system: System,
    keep_hourly: bool,
) -> Balance {
    let mut out = Balance {
        monthly_pv_kwh: vec![0.0; 12],
        monthly_imported_kwh: vec![0.0; 12],
        monthly_exported_kwh: vec![0.0; 12],
        ac_kwh: if keep_hourly {
            vec![0.0; HOURS]
        } else {
            Vec::new()
        },
        ..Default::default()
    };
    let leg = system.battery_efficiency.max(1e-9).sqrt();
    let floor = system.battery_kwh * system.battery_reserve;
    let mut soc = floor;
    for h in 0..HOURS {
        let raw = pv_dc[h] * (1.0 - system.losses);
        let ac = raw.min(system.inverter_kw);
        let clipped = raw - ac;
        let demand = load[h];
        let mut imported = 0.0;
        let mut exported = 0.0;
        if ac >= demand {
            let surplus = ac - demand;
            let room = (system.battery_kwh - soc) / leg;
            let charge = surplus.min(system.battery_kw).min(room.max(0.0));
            soc += charge * leg;
            exported = surplus - charge;
        } else {
            let need = demand - ac;
            let available = (soc - floor) * leg;
            let discharge = need.min(system.battery_kw).min(available.max(0.0));
            soc -= discharge / leg;
            out.battery_discharged_kwh += discharge;
            imported = need - discharge;
        }
        let month = month_of(h);
        out.pv_kwh += ac;
        out.load_kwh += demand;
        out.imported_kwh += imported;
        out.exported_kwh += exported;
        out.clipped_kwh += clipped;
        out.bill_before_eur += demand * price_import[h];
        out.bill_after_eur += imported * price_import[h];
        out.feed_in_eur += exported * feed_in;
        out.monthly_pv_kwh[month] += ac;
        out.monthly_imported_kwh[month] += imported;
        out.monthly_exported_kwh[month] += exported;
        if keep_hourly {
            out.ac_kwh[h] = ac;
        }
    }
    out.self_consumed_kwh = out.load_kwh - out.imported_kwh;
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn module() -> Module {
        Module {
            albedo: 0.2,
            noct: 45.0,
            gamma: -0.0035,
        }
    }

    #[test]
    fn sun_is_high_at_noon_in_june_and_below_horizon_at_midnight() {
        let noon = sun_position(171 * 24 + 12, 52.5, 13.4);
        assert!(
            noon.elevation > 55.0 && noon.elevation < 62.0,
            "{}",
            noon.elevation
        );
        assert!((noon.azimuth - 180.0).abs() < 25.0, "{}", noon.azimuth);
        let midnight = sun_position(171 * 24, 52.5, 13.4);
        assert!(midnight.elevation < 0.0);
    }

    #[test]
    fn diffuse_never_exceeds_global() {
        let sun = sun_position(100 * 24 + 11, 48.0, 11.0);
        for g in [10.0, 200.0, 500.0, 900.0] {
            let (dni, dhi) = split_irradiance(g, &sun);
            assert!(dhi <= g + 1e-9 && dni >= 0.0);
            assert!((dni * sun.cos_zenith + dhi - g).abs() < 1e-9);
        }
    }

    #[test]
    fn a_full_horizon_blocks_all_beam() {
        let ghi: Vec<f64> = (0..HOURS)
            .map(|h| {
                let s = sun_position(h, 50.0, 10.0);
                if s.cos_zenith > 0.0 {
                    800.0 * s.cos_zenith
                } else {
                    0.0
                }
            })
            .collect();
        let temp = vec![15.0; HOURS];
        let (open, _) = face_profile(
            &ghi,
            &temp,
            50.0,
            10.0,
            180.0,
            30.0,
            &[0.0; HORIZON_BINS],
            module(),
        );
        let (walled, unshaded) = face_profile(
            &ghi,
            &temp,
            50.0,
            10.0,
            180.0,
            30.0,
            &[90.0; HORIZON_BINS],
            module(),
        );
        let sum = |v: &Vec<f64>| v.iter().sum::<f64>();
        assert!(sum(&walled) < 0.2 * sum(&open));
        assert!((sum(&unshaded) - sum(&open)).abs() < 1e-6);
    }

    #[test]
    fn battery_never_creates_energy() {
        let pv: Vec<f64> = (0..HOURS)
            .map(|h| {
                if (8..16).contains(&(h % 24)) {
                    1.2
                } else {
                    0.0
                }
            })
            .collect();
        let load = vec![0.4; HOURS];
        let price = vec![0.35; HOURS];
        let sys = System {
            losses: 0.1,
            inverter_kw: 10.0,
            battery_kwh: 10.0,
            battery_kw: 5.0,
            battery_efficiency: 0.9,
            battery_reserve: 0.05,
        };
        let b = balance(&pv, &load, &price, 0.08, sys, false);
        let charged_in =
            b.pv_kwh - b.exported_kwh - (b.load_kwh - b.imported_kwh - b.battery_discharged_kwh);
        // Energy out of the battery is at most 90% of what went in.
        assert!(b.battery_discharged_kwh <= charged_in * 0.9 + 1e-6);
        assert!((b.self_consumed_kwh + b.imported_kwh - b.load_kwh).abs() < 1e-6);
    }

    #[test]
    fn months_cover_the_year() {
        assert_eq!(month_of(0), 0);
        assert_eq!(month_of(31 * 24), 1);
        assert_eq!(month_of(HOURS - 1), 11);
    }
}
