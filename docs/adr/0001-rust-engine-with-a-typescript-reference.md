# ADR-0001: The simulation is Rust in-process, checked against a TypeScript reference

**Context.** Sizing a lead means simulating a year hour by hour for every combination of roof faces and battery
(up to 130 candidates), and aftercare re-simulates every installed system against each day's weather. The rest of
the product is TypeScript on Node.

**Decision.** The energy model is a Rust crate exposed to Node with napi-rs (`packages/sim`). A second
implementation in TypeScript, written from the same equations but not ported from the Rust, is the reference.
Parity to 1e-9 is a unit test and a release gate. If the addon is missing the product falls back to the reference
with a warning; `IPE_REQUIRE_RUST=1` (CI, the container) makes that an error.

**Consequences.** The same physics runs in the API, the lab and the tests. Measured speed-up is modest on V8
(about 2× per kernel, `reports/bench.json`); the larger gain is a path to the heavier models (string-level
mismatch, 3-D shading) without slowing the API. A WebAssembly build for the browser was not possible in this
environment and is left for later.
