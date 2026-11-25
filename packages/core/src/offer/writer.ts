// Writers draft text from facts. The simulated writer stands in for a language model in the
// lab: it writes fluent text but sometimes changes a number or adds a claim nobody computed.
import { formatNumber } from "./facts.ts";
import type { Fact } from "./facts.ts";

export interface DraftRequest {
  kind: "offer" | "aftercare";
  facts: Fact[];
  language: "de" | "en";
  customerName: string;
  /** Numbers the checker rejected in the previous draft, if any. */
  rejected?: string[];
  context?: Record<string, string>;
}

export interface Writer {
  name: string;
  draft(req: DraftRequest): Promise<string>;
}

const get = (facts: Fact[], key: string) => facts.find((f) => f.key === key);
const fmt = (f: Fact | undefined, lang: "de" | "en") => (f ? formatNumber(f.value, f.decimals, lang) : "?");

/** Deterministic text from facts only: what goes out when no draft passes the check. */
export function templateText(req: DraftRequest): string {
  const f = (k: string) => fmt(get(req.facts, k), req.language);
  if (req.kind === "aftercare") {
    return [
      `Guten Tag ${req.customerName},`,
      `Ihre Anlage hat in den letzten Tagen ${f("performance")} % des erwarteten Ertrags geliefert.`,
      `Wir vermuten: ${req.context?.cause ?? "eine Störung"}. Geschätzter Verlust: ${f("lossPerDay")} kWh pro Tag.`,
      `Wir melden uns mit einem Termin.`,
    ].join("\n");
  }
  const battery = get(req.facts, "battery");
  return [
    `Guten Tag ${req.customerName},`,
    `wir empfehlen eine Photovoltaikanlage mit ${f("kwp")} kWp${battery && battery.value > 0 ? ` und einem Speicher mit ${f("battery")} kWh` : " ohne Speicher"}.`,
    `Erwarteter Jahresertrag: ${f("yield")} kWh. Davon nutzen Sie ${f("selfConsumption")} % selbst; Ihr Autarkiegrad liegt bei ${f("autarky")} %.`,
    `Ersparnis im ersten Jahr: ${f("savings")} €. Preis: ${f("price")} €. Amortisation nach ${f("payback")} Jahren, betrachtet über ${f("horizon")} Jahre.`,
  ].join("\n");
}

export interface SimulatedWriterRates {
  /** Chance that a stated number is changed. */
  wrongNumber: number;
  /** Chance that a draft adds a claim with a number nobody computed. */
  inventedClaim: number;
}

const INVENTED_CLAIMS = [
  "Mit der aktuellen Förderung sparen Sie zusätzlich 30 % der Kosten.",
  "Damit erreichen Sie bis zu 90 % Unabhängigkeit vom Netz.",
  "Die Module halten problemlos 40 Jahre.",
  "Ihr Strompreis sinkt dauerhaft um 0,12 € pro kWh.",
];

export class SimulatedWriter implements Writer {
  name = "simulated-model";
  private random: () => number;
  private rates: SimulatedWriterRates;
  constructor(random: () => number, rates: SimulatedWriterRates = { wrongNumber: 0.04, inventedClaim: 0.12 }) {
    this.random = random;
    this.rates = rates;
  }

  async draft(req: DraftRequest): Promise<string> {
    const retry = (req.rejected?.length ?? 0) > 0;
    const factor = retry ? 0.5 : 1; // told what was wrong, it errs less but still errs
    const facts = req.facts.map((f) => {
      if (this.random() >= this.rates.wrongNumber * factor) return f;
      const bump = 1 + (0.08 + this.random() * 0.3) * (this.random() < 0.7 ? 1 : -1);
      return { ...f, value: f.value * bump + (f.decimals === 0 ? 1 : 0.1) };
    });
    let text = templateText({ ...req, facts });
    text = text.replace("wir empfehlen", "nach der Auswertung Ihres Dachs empfehlen wir");
    if (this.random() < this.rates.inventedClaim * factor) {
      text += `\n${INVENTED_CLAIMS[Math.floor(this.random() * INVENTED_CLAIMS.length)]}`;
    }
    return text;
  }
}

/** Claude through the Messages API. Used by the API when ANTHROPIC_API_KEY is set; the lab never calls it. */
export class AnthropicWriter implements Writer {
  name: string;
  private apiKey: string;
  private model: string;
  private fetchImpl: typeof fetch;
  constructor(apiKey: string, model: string, fetchImpl: typeof fetch = fetch) {
    this.apiKey = apiKey;
    this.model = model;
    this.fetchImpl = fetchImpl;
    this.name = `anthropic:${model}`;
  }

  async draft(req: DraftRequest): Promise<string> {
    const facts = req.facts.map((f) => `- ${f.label}: ${formatNumber(f.value, f.decimals, req.language)} ${f.unit === "EUR" ? "€" : f.unit === "years" ? "Jahre" : f.unit}`).join("\n");
    const system = [
      "You write short customer letters for a solar installer, in German.",
      "Use only the numbers listed under FACTS, written exactly as given. Do not add any other number, percentage or price.",
      req.rejected?.length ? `Your previous draft stated numbers that are not facts: ${req.rejected.join(", ")}. Remove them.` : "",
    ].join("\n");
    const res = await this.fetchImpl("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": this.apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 600,
        system,
        messages: [{ role: "user", content: `Kunde: ${req.customerName}\nArt: ${req.kind}\nFACTS:\n${facts}\n${req.context ? JSON.stringify(req.context) : ""}` }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic API ${res.status}`);
    const body = (await res.json()) as { content: { type: string; text?: string }[] };
    return body.content.filter((c) => c.type === "text").map((c) => c.text ?? "").join("").trim();
  }
}
