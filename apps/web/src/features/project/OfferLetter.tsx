// The offer as the customer reads it. Every number is matched against the simulation's facts
// by the same checker the server runs; a checked number is underlined and says where it came from.
import { factFor, statedNumbers } from "@ipe/core/offer";
import type { Fact } from "@ipe/core/offer";
import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { duration, ease, stagger } from "../../shared/theme/motion.ts";

const SOURCE_LABEL: Record<string, string> = { template: "Written by the template", model: "Written by the model, numbers checked", fallback: "The model's drafts failed the check; the template was sent" };

export function OfferLetter({ text, facts, source, draftsRejected }: { text: string; facts: Fact[]; source: string; draftsRejected: number }) {
  const numbers = statedNumbers(text, "de");
  const parts: ReactNode[] = [];
  let cursor = 0;
  let checked = 0;
  numbers.forEach((n, i) => {
    if (n.index > cursor) parts.push(text.slice(cursor, n.index));
    const fact = factFor(n, facts);
    const order = checked++;
    parts.push(
      <span key={i} className="relative whitespace-nowrap" title={fact ? `${fact.label}: from the simulation` : "Not a fact: this number would be blocked"}>
        <span className={fact ? "font-semibold" : "font-semibold text-alarm"}>{n.text}</span>
        <motion.span aria-hidden className={`absolute -bottom-0.5 left-0 h-0.5 w-full origin-left rounded-full ${fact ? "bg-check" : "bg-alarm"}`}
          initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: 0.35 + order * stagger.fact, duration: duration.settle, ease }} />
      </span>,
    );
    cursor = n.index + n.text.length;
  });
  parts.push(text.slice(cursor));
  const unchecked = numbers.filter((n) => !factFor(n, facts)).length;
  return (
    <figure className="m-0">
      <blockquote className="m-0 whitespace-pre-line rounded-[var(--radius-panel)] border border-line bg-surface px-6 py-5 leading-relaxed" lang="de">{parts}</blockquote>
      <figcaption className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-2">
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded-full bg-check" />{numbers.length - unchecked} of {numbers.length} numbers are facts from the simulation</span>
        <span>{SOURCE_LABEL[source] ?? source}</span>
        {draftsRejected > 0 && <span>{draftsRejected} invented number{draftsRejected === 1 ? "" : "s"} stopped before sending</span>}
      </figcaption>
    </figure>
  );
}
