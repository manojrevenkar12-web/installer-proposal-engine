# Working on this repository

## Fast feedback

```bash
npm ci && npm run build:native          # the Rust simulation as a Node addon (about 30 s the first time)
npm run typecheck
DATABASE_URL=postgresql://… npm test    # sim parity, planner, offer checker, monitor, lab, API (about 40 s)
cd packages/sim && cargo test && cargo clippy --all-targets -- -D warnings
npm test -w @ipe/web && npm run build -w @ipe/web
npm run lab -- dev && npm run lab -- gate   # about 90 s on 2 cores
```

Without `DATABASE_URL` the API tests are skipped; everything else runs.

## Invariants

1. **The truth stays in the world.** Real roof horizons, real consumption, the heat pump's real heat demand, the
   weather that actually happens, each customer's patience and every fault live in `lab/src/world`. The product
   sees a lead: what the customer says and what the site visit measured.
2. **The world does not read the product's settings.** Nothing in `lab/src/world` reads `config/product.json` or
   imports product code from `@ipe/core` (types only). A test checks this.
3. **Same luck for every design.** Every random draw comes from `lab/src/rng.ts`, keyed by seed and household,
   never by what a design did. Every design meets the same households, weather, decisions and faults.
4. **The model writes and code decides.** The simulation and optimiser decide the system and every number. A
   writer (a language model, or the simulated one in the lab) only words them; `offer/checker.ts` blocks any
   number that is not a fact, and after the allowed drafts the template written by code is sent.
5. **Every kernel has an independent reference.** The Rust engine (`packages/sim/src/*.rs`) and the TypeScript
   reference (`packages/sim/src/reference.ts`) are written separately and must agree to 1e-9 (`parity.test.ts`,
   and a gate in every study).
6. **A proposal is created once.** Proposals are versions under a row lock; an `Idempotency-Key` returns the same
   proposal when repeated. Monitoring uploads are replayed from stored days, so the same upload gives the same alarms.
7. **The tenant comes from the API key**, never from a URL or a body. Every query is scoped by it.
8. **Settings in config.** Prices, tariffs, options, the promise haircut, detector thresholds (`product.json`),
   the world (`world.json`), designs, gates and seeds live in `config/*.json`.
9. **Generated reports.** `reports/*.json`, `REPORT.md`, the README results block and
   `apps/web/public/data/study.json` are written by `npm run lab`; never edit them by hand. CI re-runs the dev
   study and fails on any difference.

## The held-out rule

`npm run lab -- heldout` runs the held-out seeds once and writes `reports/heldout.lock` (with a hash of the
config). It refuses to run again. Do not delete the lock, change the held-out seeds, or tune anything after reading
held-out numbers. `--reproduce` re-runs them into a separate file for checking, without replacing the result.
New held-out data needs new seeds and an ADR.
