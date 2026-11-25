// npm run lab -- <dev|heldout|report|gate|bench>
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { join } from "node:path";
import { HOURS, defaultEngine, referenceEngine } from "@ipe/sim";
import type { Engine } from "@ipe/sim";
import { loadProductConfig, plan, typicalYear } from "@ipe/core";
import { checkGates, loadGates } from "./gates.ts";
import { fullReport, readReport, resultsBlock, root, summarise, writeJson, writeReadmeBlock } from "./report.ts";
import type { BenchReport, StudyReport } from "./report.ts";
import { loadDesigns, runSeed } from "./study.ts";
import { loadWorldConfig } from "./world/config.ts";
import { makeHouseholds } from "./world/households.ts";

const seeds = JSON.parse(readFileSync(join(root, "config", "seeds.json"), "utf8")) as { dev: number[]; heldout: number[] };
const lockPath = join(root, "reports", "heldout.lock");

async function study(kind: "dev" | "heldout"): Promise<StudyReport> {
  const designs = loadDesigns();
  const engine = defaultEngine();
  const results = [];
  for (const seed of seeds[kind]) {
    const r = await runSeed(seed, designs, { engine });
    console.log(`${kind} seed ${seed}: ${r.seconds.toFixed(1)} s`);
    results.push(r);
  }
  const summary = summarise(designs, results);
  const platform = summary.find((d) => d.id === "platform")!.mean;
  const statusQuo = summary.find((d) => d.kind === "status-quo")!.mean;
  return {
    kind,
    seeds: seeds[kind],
    householdsPerSeed: loadWorldConfig().households,
    engine: engine.name,
    designs: summary,
    gates: checkGates(loadGates(), platform, statusQuo),
  };
}

function regenerate(): void {
  const dev = readReport("dev");
  if (!dev) throw new Error("run `npm run lab -- dev` first");
  const heldout = readReport("heldout");
  const benchPath = join(root, "reports", "bench.json");
  const bench = existsSync(benchPath) ? (JSON.parse(readFileSync(benchPath, "utf8")) as BenchReport) : null;
  writeFileSync(join(root, "REPORT.md"), `${fullReport(dev, heldout)}\n`);
  writeReadmeBlock(resultsBlock(dev, heldout, bench));
  writeJson(join(root, "apps", "web", "public", "data", "study.json"), { dev, heldout, bench });
}

function configHash(): string {
  const h = createHash("sha256");
  for (const f of ["product.json", "world.json", "designs.json", "gates.json", "seeds.json"]) h.update(readFileSync(join(root, "config", f)));
  return h.digest("hex").slice(0, 16);
}

function time(fn: () => void, runs: number): number {
  fn();
  const t = performance.now();
  for (let i = 0; i < runs; i++) fn();
  return (performance.now() - t) / runs;
}

function bench(): BenchReport {
  const product = loadProductConfig();
  const lead = makeHouseholds(101, { ...loadWorldConfig(), households: 30 }).find((h) => h.lead.faces.length === 3)!.lead;
  const w = typicalYear(lead.latDeg, lead.lonDeg);
  const face = { azimuthDeg: 180, tiltDeg: 35, horizonDeg: lead.faces[0].horizonDeg };
  const engines: Record<"rust" | "reference", Engine> = { rust: defaultEngine(), reference: referenceEngine };
  if (engines.rust.name !== "rust") throw new Error("bench needs the Rust engine: npm run build:native");
  const pv = engines.rust.faceProfile(w, face, product.module).shaded.map((x) => x * 8);
  const load = new Float64Array(HOURS).fill(0.45);
  const price = new Float64Array(HOURS).fill(0.36);
  const sys = { losses: 0.14, inverterKw: 7, batteryKwh: 10, batteryKw: 5, batteryEfficiency: 0.9, batteryReserve: 0.05 };
  const opts = { sizing: "optimiser", energy: "hourly", shading: true, load: "planned", promise: "haircut" } as const;
  const planMs = (e: Engine) => time(() => plan(lead, opts, { engine: e, config: product, weather: () => w }), 5);
  return {
    machine: `${cpus()[0]?.model.trim() ?? "unknown CPU"}, ${cpus().length} cores, Node ${process.version}`,
    faceProfileMs: { rust: time(() => engines.rust.faceProfile(w, face, product.module), 50), reference: time(() => referenceEngine.faceProfile(w, face, product.module), 50) },
    balanceMs: { rust: time(() => engines.rust.balance(pv, load, price, 0.08, sys, false), 300), reference: time(() => referenceEngine.balance(pv, load, price, 0.08, sys, false), 300) },
    planLeadMs: { rust: planMs(engines.rust), reference: planMs(referenceEngine), candidates: plan(lead, opts, { engine: engines.rust, config: product, weather: () => w }).candidatesEvaluated },
  };
}

const command = process.argv[2];
switch (command) {
  case "dev": {
    writeJson(join(root, "reports", "dev.json"), await study("dev"));
    regenerate();
    break;
  }
  case "heldout": {
    if (existsSync(lockPath) && !process.argv.includes("--reproduce")) {
      console.error(`Held-out seeds were already run (${readFileSync(lockPath, "utf8").trim()}). They are run once; see AGENTS.md.`);
      process.exit(3);
    }
    const report = await study("heldout");
    if (process.argv.includes("--reproduce")) {
      writeJson(join(root, "reports", "heldout.reproduced.json"), report);
      break;
    }
    writeJson(join(root, "reports", "heldout.json"), report);
    writeFileSync(lockPath, `config ${configHash()} seeds ${seeds.heldout.join(",")}\n`);
    regenerate();
    break;
  }
  case "report":
    regenerate();
    break;
  case "gate": {
    const dev = readReport("dev");
    if (!dev) throw new Error("no reports/dev.json");
    for (const g of dev.gates) console.log(`${g.pass ? "pass" : "FAIL"}  ${g.label}: ${g.value} (${g.limit})`);
    process.exit(dev.gates.every((g) => g.pass) ? 0 : 1);
    break;
  }
  case "bench":
    writeJson(join(root, "reports", "bench.json"), bench());
    regenerate();
    break;
  default:
    console.error("usage: npm run lab -- <dev|heldout|report|gate|bench>");
    process.exit(2);
}
