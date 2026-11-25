import { STATUS_LABEL } from "../format.ts";
import type { ProjectStatus } from "../api/types.ts";

const TONE: Record<ProjectStatus, string> = {
  LEAD: "text-ink-3 border-line",
  PLANNED: "text-ink-2 border-line",
  OFFERED: "text-export border-export/40",
  SIGNED: "text-self border-self/40",
  INSTALLED: "text-pv border-pv/50",
};

export function StatusPill({ status }: { status: ProjectStatus }) {
  return <span className={`inline-flex items-center rounded-[var(--radius-chip)] border px-2.5 py-0.5 text-xs font-medium ${TONE[status]}`}>{STATUS_LABEL[status]}</span>;
}
