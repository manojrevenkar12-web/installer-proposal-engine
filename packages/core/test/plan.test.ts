import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultEngine } from "@ipe/sim";
import { feedInRate, loadProductConfig, npvEur, paybackYears, plan, priceEur, typicalYear } from "../src/index.ts";
import type { Lead, PlanOptions } from "../src/index.ts";

const config = loadProductConfig();
const engine = defaultEngine();
const ctx = { engine, config, weather: typicalYear };
const lead: Lead = {
  id: "t1", latDeg: 52.4, lonDeg: 13.1, statedConsumptionKwh: 4300, budgetEur: 22000,
  faces: [{ azimuthDeg: 175, tiltDeg: 35, areaM2: 38, horizonDeg: [] }, { azimuthDeg: 355, tiltDeg: 35, areaM2: 38, horizonDeg: [] }],
  heatPump: { livingAreaM2: 150, buildingYear: 1990 }, ev: { kmPerYear: 14000 },
};
const platform: PlanOptions = { sizing: "optimiser", energy: "hourly", shading: true, load: "planned", promise: "haircut" };

test("prices, feed-in tiers and value are consistent", () => {
  assert.equal(priceEur(10, 0, config.prices), config.prices.pvFixedEur + 10 * config.prices.pvPerKwpEur);
  assert.equal(feedInRate(8, config.tariff), config.tariff.feedInEurPerKwh);
  assert.ok(feedInRate(20, config.tariff) < config.tariff.feedInEurPerKwh);
  assert.ok(npvEur(10000, 1000, config.economics) > 0);
  assert.equal(paybackYears(10000, 0), Number.POSITIVE_INFINITY);
});

test("the optimiser stays within the customer's budget and tries every combination", () => {
  const p = plan(lead, platform, ctx);
  assert.ok(p.priceEur <= 22000, `price ${p.priceEur}`);
  assert.equal(p.candidatesEvaluated, (3 ** 2 - 1) * config.options.batteryKwh.length);
  assert.ok(p.faceKwp[0] >= p.faceKwp[1], "the south face is used at least as much as the north face");
});

test("the haircut lowers the promise, not the expectation", () => {
  const a = plan(lead, platform, ctx);
  const b = plan(lead, { ...platform, promise: "p50" }, ctx);
  assert.equal(a.expected.savingsEur, b.expected.savingsEur);
  assert.ok(Math.abs(a.promise.savingsEur - a.expected.savingsEur * (1 - config.promise.haircut)) < 1e-9);
});

test("a monthly balance claims more self-consumption than the hourly one", () => {
  const opts: PlanOptions = { ...platform, sizing: "fill-roof" };
  const hourly = plan(lead, opts, ctx);
  const monthly = plan(lead, { ...opts, energy: "monthly" }, ctx);
  assert.ok(monthly.expected.selfConsumedKwh > hourly.expected.selfConsumedKwh * 0.95);
  assert.ok(monthly.expected.selfConsumedKwh / monthly.expected.yieldKwh > hourly.expected.selfConsumedKwh / hourly.expected.yieldKwh - 0.02);
});

test("planning a heat pump and a car raises the expected load", () => {
  const bill = plan(lead, { ...platform, load: "bill" }, ctx);
  const planned = plan(lead, platform, ctx);
  assert.ok(planned.expected.loadKwh > bill.expected.loadKwh + 3000);
});

test("the site-visit horizon lowers the expected yield", () => {
  // A row of trees south of the house, 25° high from south-east to south-west.
  const south: Lead = { ...lead, faces: [lead.faces[0]] };
  const shaded: Lead = { ...south, faces: [{ ...south.faces[0], horizonDeg: Array.from({ length: 36 }, (_, b) => (b >= 12 && b <= 24 ? 25 : 2)) }] };
  const opts: PlanOptions = { ...platform, sizing: "fill-roof" };
  const open = plan(south, opts, ctx).expected.yieldKwh;
  const blocked = plan(shaded, opts, ctx).expected.yieldKwh;
  assert.ok(blocked < open * 0.92, `${blocked} vs ${open}`);
});
