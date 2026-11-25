// The tenant comes from the API key, never from the URL or the body.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Db } from "./db.ts";

export const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");
export const newApiKey = () => `ipe_${randomBytes(24).toString("base64url")}`;

declare module "fastify" {
  interface FastifyRequest { companyId: string }
}

export function requireCompany(db: Db) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const key = req.headers["x-api-key"];
    if (typeof key !== "string" || key.length < 10) return reply.code(401).send({ error: "missing API key" });
    const company = await db.company.findUnique({ where: { apiKeyHash: hashKey(key) }, select: { id: true } });
    if (!company) return reply.code(401).send({ error: "unknown API key" });
    req.companyId = company.id;
  };
}

export function adminTokenMatches(given: unknown, expected: string | undefined): boolean {
  if (!expected || typeof given !== "string") return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
