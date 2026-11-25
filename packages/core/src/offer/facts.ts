// The numbers an offer may state. Everything the customer reads must come from here.
import type { Plan } from "../types.ts";

export type Unit = "kWp" | "kWh" | "%" | "EUR" | "years";

export interface Fact {
  key: string;
  label: string;
  value: number;
  unit: Unit;
  decimals: number;
}

export function offerFacts(plan: Plan): Fact[] {
  const self = plan.expected.yieldKwh > 0 ? (plan.expected.selfConsumedKwh / plan.expected.yieldKwh) * 100 : 0;
  const autarky = plan.expected.loadKwh > 0 ? (plan.expected.selfConsumedKwh / plan.expected.loadKwh) * 100 : 0;
  const facts: Fact[] = [
    { key: "kwp", label: "Anlagenleistung", value: plan.kwp, unit: "kWp", decimals: 1 },
    { key: "battery", label: "Speicher", value: plan.batteryKwh, unit: "kWh", decimals: 0 },
    { key: "price", label: "Preis", value: plan.priceEur, unit: "EUR", decimals: 0 },
    { key: "yield", label: "Jahresertrag", value: Math.round(plan.promise.yieldKwh / 10) * 10, unit: "kWh", decimals: 0 },
    { key: "selfConsumption", label: "Eigenverbrauchsanteil", value: self, unit: "%", decimals: 0 },
    { key: "autarky", label: "Autarkiegrad", value: autarky, unit: "%", decimals: 0 },
    { key: "savings", label: "Ersparnis im ersten Jahr", value: Math.round(plan.promise.savingsEur / 10) * 10, unit: "EUR", decimals: 0 },
    { key: "payback", label: "Amortisation", value: plan.paybackYears, unit: "years", decimals: 1 },
    { key: "horizon", label: "Betrachtungszeitraum", value: 20, unit: "years", decimals: 0 },
  ];
  return facts;
}

export function formatNumber(value: number, decimals: number, language: "de" | "en"): string {
  return value.toLocaleString(language === "de" ? "de-DE" : "en-GB", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
