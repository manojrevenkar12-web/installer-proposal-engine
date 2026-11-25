# Repeatable tasks

## Change the energy model
1. Change `packages/sim/src/model.rs` and, independently, `packages/sim/src/reference.ts`. Do not port one from the other.
2. `cargo test`, `npm run build:native`, `node --test packages/sim/test/parity.test.ts`: both must agree to 1e-9.
3. `npm run lab -- dev` and commit the regenerated reports.

## Add a design or an ablation
Add it to `config/designs.json` (an ablation names its `base` and the one choice it changes). `npm run lab -- dev`
puts it in every table. A new choice needs a field in `PlanOptions` or the offer/aftercare mode, honoured in
`plan.ts`, `compose.ts` or `AftercareMonitor`.

## Add a fault kind
1. Draw it in `drawFaults` (`lab/src/world/truth.ts`) and apply it in `runAftercare` and `measuredYear`.
2. Give it a cause in `AftercareMonitor.classify` and a text in `CAUSE_TEXT`, and a repair time in `config/world.json`.
3. Add a monitor test with synthetic data in `packages/core/test/monitor.test.ts`.

## Change a price, tariff or threshold
Edit `config/product.json`, then `npm run lab -- dev`. Thresholds are tuned on dev seeds only (see the held-out rule).

## Change the database
Edit `apps/api/prisma/schema.prisma`, run `npx prisma migrate dev --name <change>` in `apps/api`, and commit the
new folder under `prisma/migrations`. CI applies the migrations and fails if they do not produce the schema.

## Use Claude for the letters
Set `ANTHROPIC_API_KEY`; the API then drafts offers and aftercare letters with the model in `config/product.json`
→ `offer.model`. Numbers are still checked; a draft with an invented number is redrafted or replaced by the template.

## Demo data and screenshots
Start Postgres and the API (`ADMIN_TOKEN=… DATABASE_URL=… npm run api`), run
`node lab/src/seed-api.ts http://localhost:8080 $ADMIN_TOKEN`, open the console (`npm run web`), paste the printed
key, and capture the five views into `docs/screenshots/`.
