// Draft, check, redraft. A checked composer never sends a number that is not a fact: after
// the allowed drafts it falls back to the template written by code.
import { checkDraft } from "./checker.ts";
import type { StatedNumber } from "./checker.ts";
import { templateText } from "./writer.ts";
import type { DraftRequest, Writer } from "./writer.ts";

export interface Composed {
  text: string;
  source: "template" | "model" | "fallback";
  drafts: number;
  rejectedNumbers: StatedNumber[];
  /** Numbers in the sent text that are not facts (0 whenever the composer checks). */
  inventedSent: StatedNumber[];
}

export async function compose(req: DraftRequest, mode: "template" | "agent-checked" | "agent-unchecked", writer: Writer | null, maxDrafts: number): Promise<Composed> {
  if (mode === "template" || !writer) {
    return { text: templateText(req), source: "template", drafts: 0, rejectedNumbers: [], inventedSent: [] };
  }
  if (mode === "agent-unchecked") {
    const text = await writer.draft(req);
    return { text, source: "model", drafts: 1, rejectedNumbers: [], inventedSent: checkDraft(text, req.facts, req.language).unmatched };
  }
  const rejected: StatedNumber[] = [];
  for (let attempt = 1; attempt <= maxDrafts; attempt++) {
    const text = await writer.draft({ ...req, rejected: rejected.map((r) => r.text) });
    const check = checkDraft(text, req.facts, req.language);
    if (check.ok) return { text, source: "model", drafts: attempt, rejectedNumbers: rejected, inventedSent: [] };
    rejected.push(...check.unmatched);
  }
  return { text: templateText(req), source: "fallback", drafts: maxDrafts, rejectedNumbers: rejected, inventedSent: [] };
}
