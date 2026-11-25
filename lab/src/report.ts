// Turns study results into reports/*.json, REPORT.md, the README results block and the
// console's data file. Nothing in these outputs is typed by hand.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { GateResult } from "./gates.ts";
import type { Design, Metrics, SeedResult } from "./study.ts";

export const root = join(import.meta.dirname, "..", "..");

export interface DesignSummary { id: string; label: string; kind: Design["kind"]; mean: Metrics; perSeed: Metrics[] }
export interface StudyReport {
  kind: "dev" | "heldout";
  seeds: number[];
  householdsPerSeed: number;
  engine: string;
  designs: DesignSummary[];
  gates: GateResult[];
}
export interface BenchReport {
  machine: string;
  faceProfileMs: { rust: number; reference: number };
  balanceMs: { rust: number; reference: number };
  planLeadMs: { rust: number; reference: number; candidates: number };
}

function round(x: number): number {
  return Number.isFinite(x) ? Number(x.toPrecision(7)) : x;
}

export function summarise(designs: Design[], results: SeedResult[]): DesignSummary[] {
  return designs.map((d) => {
    const perSeed = results.map((r) => r.byDesign[d.id]);
    const mean = {} as Record<string, unknown>;
    for (const key of Object.keys(perSeed[0]) as (keyof Metrics)[]) {
      if (key === "faultsByKind") {
        const kinds: Metrics["faultsByKind"] = {};
        for (const m of perSeed) for (const [k, v] of Object.entries(m.faultsByKind)) {
          const t = (kinds[k] ??= { faults: 0, detected: 0, causeCorrect: 0, medianDays: 0 });
          t.faults += v.faults; t.detected += v.detected; t.causeCorrect += v.causeCorrect;
          t.medianDays += (Number.isFinite(v.medianDays) ? v.medianDays : 0) / perSeed.length;
        }
        mean[key] = kinds;
        continue;
      }
      const values = perSeed.map((m) => m[key] as number).filter((v) => Number.isFinite(v));
      mean[key] = round(values.length ? values.reduce((a, b) => a + b, 0) / values.length : Number.NaN);
    }
    return { id: d.id, label: d.label, kind: d.kind, mean: mean as unknown as Metrics, perSeed };
  });
}

export function writeJson(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(data, (_k, v) => (typeof v === "number" ? (Number.isFinite(v) ? round(v) : null) : v), 2)}\n`);
}

export function readReport(kind: "dev" | "heldout"): StudyReport | null {
  const p = join(root, "reports", `${kind}.json`);
  return existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as StudyReport) : null;
}

const eur = (x: number) => `€${Math.round(x).toLocaleString("en-GB")}`;
const pct = (x: number, d = 1) => (x === null || !Number.isFinite(x) ? "–" : `${(x * 100).toFixed(d)}%`);
const num = (x: number, d = 1) => (x === null || !Number.isFinite(x) ? "–" : x.toFixed(d));

function mainTable(r: StudyReport, ids: string[]): string {
  const rows = r.designs.filter((d) => ids.includes(d.id));
  const head = "| Design | Signed | Broken promises | Yield error | Promise vs reality | Customer value per 100 leads | Installer revenue per 100 leads | Invented numbers sent |";
  const sep = "|---|---:|---:|---:|---:|---:|---:|---:|";
  const lines = rows.map((d) => {
    const m = d.mean;
    const bold = d.kind === "platform" ? "**" : "";
    return `| ${bold}${d.label}${bold} | ${pct(m.winRate, 0)} | ${bold}${pct(m.brokenPromiseRate)}${bold} | ${num(m.yieldErrorPct)}% | ${m.savingsBiasPct > 0 ? "+" : ""}${num(m.savingsBiasPct)}% | ${eur(m.customerValuePer100LeadsEur)} | ${eur(m.revenuePer100LeadsEur)} | ${Math.round(m.inventedNumbersSent)} |`;
  });
  return [head, sep, ...lines].join("\n");
}

function aftercareTable(r: StudyReport, ids: string[]): string {
  const head = "| Design | Material faults found | Median days to alarm | Right cause | False alarms per 100 systems | Data gaps flagged | Energy lost per fault |";
  const sep = "|---|---:|---:|---:|---:|---:|---:|";
  const lines = r.designs.filter((d) => ids.includes(d.id)).map((d) => {
    const m = d.mean;
    return `| ${d.label} | ${pct(m.materialDetectionRate, 0)} | ${num(m.medianDaysToDetect)} | ${pct(m.causeAccuracy, 0)} | ${num(m.falseAlarmsPer100)} | ${pct(m.offlineFlaggedRate, 0)} | ${Math.round(m.lostKwhPerFault)} kWh |`;
  });
  return [head, sep, ...lines].join("\n");
}

function byKindTable(r: StudyReport, id: string): string {
  const d = r.designs.find((x) => x.id === id);
  if (!d) return "";
  const head = "| Fault | Faults | Found | Right cause | Median days to alarm |";
  const sep = "|---|---:|---:|---:|---:|";
  const lines = Object.entries(d.mean.faultsByKind).map(([k, v]) => `| ${k} | ${v.faults} | ${v.detected} | ${v.causeCorrect} | ${num(v.medianDays)} |`);
  return [head, sep, ...lines].join("\n");
}

function gatesTable(gates: GateResult[]): string {
  const head = "| Gate | Value | Limit | |";
  const sep = "|---|---:|---|---|";
  const lines = gates.map((g) => `| ${g.label} | ${g.value === null ? "–" : Math.abs(g.value) >= 100 ? Math.round(g.value).toLocaleString("en-GB") : Number(g.value.toPrecision(3))} | ${g.limit} | ${g.pass ? "pass" : "**fail**"} |`);
  return [head, sep, ...lines].join("\n");
}

const HEADLINE = ["spreadsheet", "model-alone", "platform"];

export function resultsBlock(dev: StudyReport, heldout: StudyReport | null, bench: BenchReport | null): string {
  const platform = dev.designs.find((d) => d.id === "platform")!.mean;
  const sq = dev.designs.find((d) => d.id === "spreadsheet")!.mean;
  const passed = dev.gates.filter((g) => g.pass).length;
  const out: string[] = [];
  out.push(`Dev: ${dev.seeds.length} seeds × ${dev.householdsPerSeed} households, every design on the same households, weather and faults. Engine: ${dev.engine}. **${passed} of ${dev.gates.length} gates pass.**`);
  out.push("");
  out.push(`| | Spreadsheet (status quo) | Platform |`);
  out.push(`|---|---:|---:|`);
  out.push(`| Customers whose savings fall below 85% of the promise | ${pct(sq.brokenPromiseRate)} | **${pct(platform.brokenPromiseRate)}** |`);
  out.push(`| Offers signed | ${pct(sq.winRate, 0)} | **${pct(platform.winRate, 0)}** |`);
  out.push(`| Customers' realised 20-year value per 100 leads | ${eur(sq.customerValuePer100LeadsEur)} | **${eur(platform.customerValuePer100LeadsEur)}** |`);
  out.push(`| Installer revenue per 100 leads | ${eur(sq.revenuePer100LeadsEur)} | **${eur(platform.revenuePer100LeadsEur)}** |`);
  out.push(`| Material faults found within the year | ${pct(sq.materialDetectionRate, 0)} | **${pct(platform.materialDetectionRate, 0)}** |`);
  out.push(`| Median days from fault to alarm | ${num(sq.medianDaysToDetect)} | **${num(platform.medianDaysToDetect)}** |`);
  out.push(`| False alarms per 100 systems and year | ${num(sq.falseAlarmsPer100)} | **${num(platform.falseAlarmsPer100)}** |`);
  out.push("");
  out.push("**Status quo, a model alone, and the platform**");
  out.push("");
  out.push(mainTable(dev, HEADLINE));
  out.push("");
  out.push("**Ablations: what each part of the platform is worth**");
  out.push("");
  out.push(mainTable(dev, dev.designs.filter((d) => d.kind === "ablation" || d.id === "platform").map((d) => d.id)));
  out.push("");
  out.push("**Aftercare**");
  out.push("");
  out.push(aftercareTable(dev, ["spreadsheet", "platform", "no-shading", "threshold-aftercare"]));
  out.push("");
  out.push(byKindTable(dev, "platform"));
  out.push("");
  out.push("**Gates (dev)**");
  out.push("");
  out.push(gatesTable(dev.gates));
  out.push("");
  if (heldout) {
    const hp = heldout.designs.find((d) => d.id === "platform")!.mean;
    const hs = heldout.designs.find((d) => d.id === "spreadsheet")!.mean;
    const hpass = heldout.gates.filter((g) => g.pass).length;
    out.push(`**Held-out (${heldout.seeds.length} seeds, run once): ${hpass} of ${heldout.gates.length} gates pass.**`);
    out.push("");
    out.push(`Broken promises ${pct(hs.brokenPromiseRate)} → ${pct(hp.brokenPromiseRate)}; customer value per 100 leads ${eur(hs.customerValuePer100LeadsEur)} → ${eur(hp.customerValuePer100LeadsEur)}; material faults found ${pct(hp.materialDetectionRate, 0)}, false alarms ${num(hp.falseAlarmsPer100)} per 100 systems.`);
    const failed = heldout.gates.filter((g) => !g.pass);
    if (failed.length) out.push(`\nFailed on held-out: ${failed.map((g) => `${g.label} (${Number(g.value.toPrecision(3))}, limit ${g.limit})`).join("; ")}.`);
    out.push("");
    out.push(gatesTable(heldout.gates));
    out.push("");
  } else {
    out.push("_Held-out seeds not run yet._");
    out.push("");
  }
  if (bench) {
    out.push(`**Engine speed** (${bench.machine}): one roof face for a year ${num(bench.faceProfileMs.rust, 2)} ms in Rust vs ${num(bench.faceProfileMs.reference, 2)} ms in TypeScript; one hourly balance ${num(bench.balanceMs.rust, 3)} ms vs ${num(bench.balanceMs.reference, 3)} ms; sizing one lead over ${bench.planLeadMs.candidates} candidate systems ${num(bench.planLeadMs.rust)} ms vs ${num(bench.planLeadMs.reference)} ms.`);
  }
  return out.join("\n");
}

export function writeReadmeBlock(block: string, path = join(root, "README.md")): void {
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  const start = "<!-- results:start -->";
  const end = "<!-- results:end -->";
  const a = text.indexOf(start);
  const b = text.indexOf(end);
  if (a < 0 || b < 0) return;
  writeFileSync(path, `${text.slice(0, a + start.length)}\n${block}\n${text.slice(b)}`);
}

export function fullReport(dev: StudyReport, heldout: StudyReport | null): string {
  const out = ["# Study report", "", "Generated by `npm run lab -- report`. Do not edit by hand.", ""];
  for (const r of [dev, heldout]) {
    if (!r) continue;
    out.push(`## ${r.kind === "dev" ? "Dev" : "Held-out"} seeds ${r.seeds.join(", ")} (${r.householdsPerSeed} households each)`, "");
    out.push(mainTable(r, r.designs.map((d) => d.id)), "");
    out.push(aftercareTable(r, r.designs.map((d) => d.id)), "");
    out.push("| Design | Mean kWp | With battery | Drafts rejected | Offers from the fallback template | Faults | All faults found |", "|---|---:|---:|---:|---:|---:|---:|");
    for (const d of r.designs) out.push(`| ${d.label} | ${num(d.mean.meanKwp)} | ${pct(d.mean.batteryShare, 0)} | ${Math.round(d.mean.draftsRejected)} | ${Math.round(d.mean.offersFromFallback)} | ${num(d.mean.faults)} | ${pct(d.mean.faultDetectionRate, 0)} |`);
    out.push("", gatesTable(r.gates), "");
  }
  return out.join("\n");
}
