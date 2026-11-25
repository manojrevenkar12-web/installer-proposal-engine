# ADR-0005: PostgreSQL through Prisma 7 with the pg driver adapter

**Context.** The installer stack in the job description is Node, TypeScript, PostgreSQL and Prisma.

**Decision.** Prisma 7's TypeScript client (`prisma-client` generator) over `@prisma/adapter-pg`, which needs no
query-engine binary. Proposal versions are allocated under `SELECT … FOR UPDATE` on the project, with a unique
constraint on `(projectId, idempotencyKey)` as the second line. Migrations are SQL files in `prisma/migrations`; CI
applies them and runs `prisma migrate diff --exit-code` against the schema.

**Consequences.** Four parallel requests get versions 1 to 4, and a repeated key returns the same proposal (tested).
Monitoring days are stored as arrays per day, which keeps a year at 365 rows per system; a time-series store
would be the next step past tens of thousands of systems.
