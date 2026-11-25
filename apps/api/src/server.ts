import { buildApp } from "./app.ts";
import { createDb } from "./db.ts";

const db = createDb();
const app = buildApp({ db, logger: true });
const port = Number(process.env.PORT ?? 8080);
await app.listen({ host: process.env.HOST ?? "0.0.0.0", port });
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    await app.close();
    await db.$disconnect();
    process.exit(0);
  });
}
