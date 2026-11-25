// Builds the Rust simulation as a Node addon: cargo build, then copy the shared library to
// packages/sim/native/ipe_sim.<platform>-<arch>.node, where packages/sim/src/index.ts loads it.
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..", "packages", "sim");
execFileSync("cargo", ["build", "--release", "--lib"], { cwd: root, stdio: "inherit" });
const lib = { linux: "libipe_sim.so", darwin: "libipe_sim.dylib", win32: "ipe_sim.dll" }[process.platform as string];
if (!lib) throw new Error(`unsupported platform ${process.platform}`);
mkdirSync(join(root, "native"), { recursive: true });
const target = join(root, "native", `ipe_sim.${process.platform}-${process.arch}.node`);
copyFileSync(join(root, "target", "release", lib), target);
console.log(`native simulation: ${target}`);
