import assert from "node:assert/strict";
import { test } from "node:test";
import { AnthropicWriter, SimulatedWriter, checkDraft, compose, offerFacts, statedNumbers, templateText } from "../src/index.ts";
import type { Fact, Plan } from "../src/index.ts";

const plan: Plan = {
  faceKwp: [8.2, 4.1], kwp: 12.3, batteryKwh: 10, batteryKw: 5, inverterKw: 11.1, priceEur: 27390, feedInEurPerKwh: 0.0757,
  expected: { yieldKwh: 11234, loadKwh: 6200, selfConsumedKwh: 4100, exportedKwh: 7134, savingsEur: 2016, monthlyPvKwh: new Array(12).fill(936) },
  promise: { yieldKwh: 10560, savingsEur: 1895, monthlyPvKwh: new Array(12).fill(880) },
  paybackYears: 14.45, npvEur: 4200, candidatesEvaluated: 40,
};
const facts = offerFacts(plan);

test("German numbers with thousands dots and decimal commas are read with their units", () => {
  const n = statedNumbers("Preis: 27.390 €. Ertrag 10.560 kWh, Leistung 12,3 kWp, 66 % selbst, nach 14,5 Jahren.", "de");
  assert.deepEqual(n.map((x) => [x.value, x.unit, x.decimals]), [[27390, "EUR", 0], [10560, "kWh", 0], [12.3, "kWp", 1], [66, "%", 0], [14.5, "years", 1]]);
});

test("the template states only facts", () => {
  const text = templateText({ kind: "offer", facts, language: "de", customerName: "Familie Muster" });
  const check = checkDraft(text, facts, "de");
  assert.ok(check.ok, JSON.stringify(check.unmatched));
  assert.ok(check.stated.length >= 9);
});

test("a changed number and an invented claim are both caught", () => {
  const text = templateText({ kind: "offer", facts, language: "de", customerName: "X" }).replace("27.390 €", "25.390 €") + "\nMit der Förderung sparen Sie zusätzlich 30 % der Kosten.";
  const check = checkDraft(text, facts, "de");
  assert.deepEqual(check.unmatched.map((u) => u.text), ["25.390 €", "30 %"]);
});

test("the checked composer never sends an invented number; the unchecked one does", async () => {
  let checkedInvented = 0;
  let uncheckedInvented = 0;
  let fallbacks = 0;
  for (let seed = 1; seed <= 300; seed++) {
    let s = seed;
    const rand = () => ((s = (s * 48271) % 2147483647) / 2147483647);
    const checked = await compose({ kind: "offer", facts, language: "de", customerName: "X" }, "agent-checked", new SimulatedWriter(rand), 3);
    checkedInvented += checked.inventedSent.length + checkDraft(checked.text, facts, "de").unmatched.length;
    if (checked.source === "fallback") fallbacks++;
    const unchecked = await compose({ kind: "offer", facts, language: "de", customerName: "X" }, "agent-unchecked", new SimulatedWriter(rand), 3);
    uncheckedInvented += unchecked.inventedSent.length;
  }
  assert.equal(checkedInvented, 0);
  assert.ok(uncheckedInvented > 30, `unchecked invented ${uncheckedInvented}`);
  assert.ok(fallbacks < 30, `fallbacks ${fallbacks}`);
});

test("the Anthropic writer sends the facts and the rule, and returns the text", async () => {
  let body: { model: string; system: string; messages: { content: string }[] } | null = null;
  const fake = (async (_url: string, init: { body: string }) => {
    body = JSON.parse(init.body);
    return new Response(JSON.stringify({ content: [{ type: "text", text: "Guten Tag" }] }), { status: 200 });
  }) as unknown as typeof fetch;
  const w = new AnthropicWriter("key", "claude-sonnet-5-5", fake);
  const text = await w.draft({ kind: "offer", facts: facts as Fact[], language: "de", customerName: "X", rejected: ["30 %"] });
  assert.equal(text, "Guten Tag");
  assert.equal(body!.model, "claude-sonnet-5-5");
  assert.match(body!.system, /Use only the numbers/);
  assert.match(body!.system, /30 %/);
  assert.match(body!.messages[0].content, /12,3 kWp/);
});
