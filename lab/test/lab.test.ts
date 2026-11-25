import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { resultsBlock, readReport, root } from "../src/report.ts";
import { loadDesigns, runSeed } from "../src/study.ts";
import { loadWorldConfig } from "../src/world/config.ts";
import { makeHouseholds } from "../src/world/households.ts";
import { drawFaults } from "../src/world/truth.ts";

test("every design meets the same households and faults (same luck)", () => {
  const cfg = { ...loadWorldConfig(), households: 25 };
  const a = makeHouseholds(7, cfg);
  const b = makeHouseholds(7, cfg);
  assert.deepEqual(a, b);
  assert.deepEqual(drawFaults(7, 3, cfg.faults), drawFaults(7, 3, cfg.faults));
  assert.notDeepEqual(makeHouseholds(8, cfg)[0].lead, a[0].lead);
});

test("the world never reads the product's settings", () => {
  const dir = join(root, "lab", "src", "world");
  for (const f of readdirSync(dir)) {
    const text = readFileSync(join(dir, f), "utf8");
    assert.ok(!text.includes("product.json") && !/loadProductConfig/.test(text), `${f} reads the product's settings`);
    for (const m of text.matchAll(/^import (?!type)[^;]*from "@ipe\/core"/gm)) assert.fail(`${f} imports product code: ${m[0]}`);
  }
});

test("the lead the product sees differs from the truth it does not", () => {
  const [h] = makeHouseholds(11, { ...loadWorldConfig(), households: 1 });
  assert.notDeepEqual(h.lead.faces.map((f) => f.horizonDeg), h.truth.faces.map((f) => f.horizonDeg));
  assert.notEqual(h.lead.statedConsumptionKwh, Math.round(h.truth.baseKwh / 10) * 10);
});

test("a study is deterministic and every design reports finite numbers", async () => {
  const designs = loadDesigns().filter((d) => ["spreadsheet", "platform"].includes(d.id));
  const x = await runSeed(5, designs, { households: 12 });
  const y = await runSeed(5, designs, { households: 12 });
  assert.deepEqual(x.byDesign, y.byDesign);
  for (const m of Object.values(x.byDesign)) {
    assert.ok(Number.isFinite(m.winRate) && Number.isFinite(m.revenuePer100LeadsEur));
    assert.ok(m.inventedNumbersSent >= 0);
  }
  assert.equal(x.byDesign.platform.inventedNumbersSent, 0);
});

test("designs inherit from their base and change only what they name", () => {
  const designs = Object.fromEntries(loadDesigns().map((d) => [d.id, d]));
  assert.equal(designs["no-shading"].shading, false);
  assert.equal(designs["no-shading"].sizing, designs.platform.sizing);
  assert.equal(designs["monthly-balance"].energy, "monthly");
});

test("the README results block is generated, not edited", () => {
  const dev = readReport("dev");
  if (!dev) return;
  const benchPath = join(root, "reports", "bench.json");
  const bench = existsSync(benchPath) ? JSON.parse(readFileSync(benchPath, "utf8")) : null;
  const readme = readFileSync(join(root, "README.md"), "utf8");
  const block = readme.slice(readme.indexOf("<!-- results:start -->") + 22, readme.indexOf("<!-- results:end -->")).trim();
  assert.equal(block, resultsBlock(dev, readReport("heldout"), bench).trim());
});

test("the held-out seeds cannot be run twice", () => {
  if (!existsSync(join(root, "reports", "heldout.lock"))) return;
  const r = spawnSync(process.execPath, [join(root, "lab", "src", "cli.ts"), "heldout"], { encoding: "utf8" });
  assert.equal(r.status, 3);
  assert.match(r.stderr, /run once/);
  void execFileSync;
});
