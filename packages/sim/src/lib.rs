//! Node binding (napi-rs) for the energy model in `model.rs`.

pub mod model;

use napi::bindgen_prelude::Float64Array;
use napi::{Error, Result, Status};
use napi_derive::napi;

fn check_len(name: &str, values: &[f64], len: usize) -> Result<()> {
    if values.len() != len {
        return Err(Error::new(
            Status::InvalidArg,
            format!("{name} must have {len} values, got {}", values.len()),
        ));
    }
    Ok(())
}

/// DC energy per kWp for one roof face. Returns 2 × 8,760 values: shaded, then unshaded.
#[napi]
#[allow(clippy::too_many_arguments)]
pub fn face_profile(
    ghi: Float64Array,
    temp: Float64Array,
    lat: f64,
    lon: f64,
    azimuth: f64,
    tilt: f64,
    horizon: Float64Array,
    albedo: f64,
    noct: f64,
    gamma: f64,
) -> Result<Float64Array> {
    check_len("ghi", &ghi, model::HOURS)?;
    check_len("temp", &temp, model::HOURS)?;
    if !horizon.is_empty() {
        check_len("horizon", &horizon, model::HORIZON_BINS)?;
    }
    let (shaded, open) = model::face_profile(
        &ghi,
        &temp,
        lat,
        lon,
        azimuth,
        tilt,
        &horizon,
        model::Module {
            albedo,
            noct,
            gamma,
        },
    );
    let mut out = shaded;
    out.extend_from_slice(&open);
    Ok(Float64Array::new(out))
}

#[napi(object)]
pub struct SystemSpec {
    pub losses: f64,
    pub inverter_kw: f64,
    pub battery_kwh: f64,
    pub battery_kw: f64,
    pub battery_efficiency: f64,
    pub battery_reserve: f64,
}

#[napi(object)]
pub struct BalanceResult {
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
    pub ac_kwh: Float64Array,
}

/// Hour-by-hour balance of PV, battery, household load and grid.
#[napi]
pub fn balance(
    pv_dc: Float64Array,
    load: Float64Array,
    price_import: Float64Array,
    feed_in: f64,
    system: SystemSpec,
    keep_hourly: bool,
) -> Result<BalanceResult> {
    check_len("pvDc", &pv_dc, model::HOURS)?;
    check_len("load", &load, model::HOURS)?;
    check_len("priceImport", &price_import, model::HOURS)?;
    let b = model::balance(
        &pv_dc,
        &load,
        &price_import,
        feed_in,
        model::System {
            losses: system.losses,
            inverter_kw: system.inverter_kw,
            battery_kwh: system.battery_kwh,
            battery_kw: system.battery_kw,
            battery_efficiency: system.battery_efficiency,
            battery_reserve: system.battery_reserve,
        },
        keep_hourly,
    );
    Ok(BalanceResult {
        pv_kwh: b.pv_kwh,
        load_kwh: b.load_kwh,
        self_consumed_kwh: b.self_consumed_kwh,
        exported_kwh: b.exported_kwh,
        imported_kwh: b.imported_kwh,
        clipped_kwh: b.clipped_kwh,
        battery_discharged_kwh: b.battery_discharged_kwh,
        bill_before_eur: b.bill_before_eur,
        bill_after_eur: b.bill_after_eur,
        feed_in_eur: b.feed_in_eur,
        monthly_pv_kwh: b.monthly_pv_kwh,
        monthly_imported_kwh: b.monthly_imported_kwh,
        monthly_exported_kwh: b.monthly_exported_kwh,
        ac_kwh: Float64Array::new(b.ac_kwh),
    })
}
