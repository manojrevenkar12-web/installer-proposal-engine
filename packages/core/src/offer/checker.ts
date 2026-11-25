// Code decides whether a draft may go out: every number with a unit must be one of the facts,
// rounded the way the draft writes it. Anything else is an invented number and blocks the draft.
import type { Fact, Unit } from "./facts.ts";

export interface StatedNumber { text: string; value: number; unit: Unit; decimals: number; index: number }
export interface CheckResult { ok: boolean; stated: StatedNumber[]; unmatched: StatedNumber[] }

const UNIT_PATTERN = /(\d{1,3}(?:[.\s]\d{3})+|\d+)(?:,(\d+))?\s*(kWp|kWh|%|€|EUR|Euro|Jahren|Jahre|years)(?![\w])/g;
const EN_PATTERN = /(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?\s*(kWp|kWh|%|€|EUR|years)(?![\w])/g;

function unitOf(raw: string): Unit {
  if (raw === "€" || raw === "EUR" || raw === "Euro") return "EUR";
  if (raw === "Jahre" || raw === "Jahren" || raw === "years") return "years";
  return raw as Unit;
}

export function statedNumbers(text: string, language: "de" | "en"): StatedNumber[] {
  const out: StatedNumber[] = [];
  const pattern = language === "de" ? UNIT_PATTERN : EN_PATTERN;
  for (const m of text.matchAll(pattern)) {
    const whole = m[1].replace(/[.,\s]/g, "");
    const fraction = m[2] ?? "";
    const value = Number(fraction ? `${whole}.${fraction}` : whole);
    out.push({ text: m[0], value, unit: unitOf(m[3]), decimals: fraction.length, index: m.index ?? 0 });
  }
  return out;
}

export function matchesFact(n: StatedNumber, facts: Fact[]): boolean {
  return facts.some((f) => {
    if (f.unit !== n.unit) return false;
    const scale = 10 ** n.decimals;
    return Math.round(f.value * scale) === Math.round(n.value * scale);
  });
}

/** The fact a stated number matches, if any. */
export function factFor(n: StatedNumber, facts: Fact[]): Fact | undefined {
  return facts.find((f) => f.unit === n.unit && Math.round(f.value * 10 ** n.decimals) === Math.round(n.value * 10 ** n.decimals));
}

export function checkDraft(text: string, facts: Fact[], language: "de" | "en"): CheckResult {
  const stated = statedNumbers(text, language);
  const unmatched = stated.filter((n) => !matchesFact(n, facts));
  return { ok: unmatched.length === 0, stated, unmatched };
}
