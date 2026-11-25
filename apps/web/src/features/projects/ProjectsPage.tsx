import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { ProjectListItem, ProjectStatus } from "../../shared/api/types.ts";
import { STATUS_LABEL, eur, kwp, years } from "../../shared/format.ts";
import { duration, ease } from "../../shared/theme/motion.ts";
import { StatusPill } from "../../shared/ui/StatusPill.tsx";
import { EmptyState, QueryView, Skeleton } from "../../shared/ui/states.tsx";
import { useProjects } from "./useProjects.ts";

const FILTERS: (ProjectStatus | "ALL")[] = ["ALL", "LEAD", "PLANNED", "OFFERED", "SIGNED", "INSTALLED"];

export function ProjectsPage() {
  const query = useProjects();
  const [filter, setFilter] = useState<ProjectStatus | "ALL">("ALL");
  return (
    <section>
      <h1 className="text-2xl font-semibold">Projects</h1>
      <p className="mt-1 max-w-2xl text-ink-2">Every offer is sized by an hourly simulation of the customer's roof and household, and every number in it is checked against that simulation.</p>
      <QueryView query={query} title="projects" skeleton={<ListSkeleton />} isEmpty={(d) => d.length === 0}
        empty={<div className="mt-8"><EmptyState title="No projects yet">Create one through the API (<code>POST /v1/projects</code>) or run the demo seed.</EmptyState></div>}>
        {(projects) => <ProjectList projects={projects} filter={filter} setFilter={setFilter} />}
      </QueryView>
    </section>
  );
}

function ProjectList({ projects, filter, setFilter }: { projects: ProjectListItem[]; filter: ProjectStatus | "ALL"; setFilter: (f: ProjectStatus | "ALL") => void }) {
  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f, f === "ALL" ? projects.length : projects.filter((p) => p.status === f).length])), [projects]);
  const shown = filter === "ALL" ? projects : projects.filter((p) => p.status === filter);
  return (
    <>
      <div role="tablist" aria-label="Filter by stage" className="mt-6 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button key={f} type="button" role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}
            className={`rounded-[var(--radius-chip)] border px-3 py-1 text-sm ${filter === f ? "border-ink bg-ink text-paper" : "border-line text-ink-2 hover:border-ink-3"}`}>
            {f === "ALL" ? "All" : STATUS_LABEL[f]} <span className="opacity-60">{counts[f]}</span>
          </button>
        ))}
      </div>
      <div className="mt-4 overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface">
        <div className="hidden grid-cols-[1.6fr_1fr_1fr_0.9fr_0.9fr_auto] gap-4 border-b border-line px-5 py-2.5 text-xs text-ink-3 md:grid">
          <span>Customer</span><span>Stage</span><span>System</span><span>Price</span><span>Payback</span><span className="w-16 text-right">Alarms</span>
        </div>
        {shown.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-ink-2">No project is at this stage.</p>
        ) : (
          <ul>
            <AnimatePresence initial={false}>
              {shown.map((p) => <Row key={p.id} p={p} />)}
            </AnimatePresence>
          </ul>
        )}
      </div>
    </>
  );
}

function Row({ p }: { p: ProjectListItem }) {
  const offer = p.proposals[0];
  return (
    <motion.li layout="position" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: duration.quick, ease }} className="border-b border-line last:border-b-0">
      <Link to={`/projects/${p.id}`} className="grid grid-cols-2 gap-x-4 gap-y-1 px-5 py-3.5 hover:bg-sunk/50 md:grid-cols-[1.6fr_1fr_1fr_0.9fr_0.9fr_auto] md:items-center">
        <span className="font-medium">{p.customerName}<span className="block text-xs font-normal text-ink-3">{p.statedConsumptionKwh.toLocaleString("en-GB")} kWh a year on the bill</span></span>
        <span><StatusPill status={p.status} /></span>
        <span className="text-sm">{offer ? `${kwp(offer.kwp)}${offer.batteryKwh > 0 ? ` + ${offer.batteryKwh} kWh` : ""}` : <span className="text-ink-3">Not sized</span>}</span>
        <span className="text-sm">{offer ? eur(offer.priceEur) : "–"}</span>
        <span className="text-sm">{offer ? years(offer.paybackYears) : "–"}</span>
        <span className="w-16 text-right text-sm">{p._count.alarms > 0 ? <span className="font-semibold text-alarm">{p._count.alarms}</span> : <span className="text-ink-3">0</span>}</span>
      </Link>
    </motion.li>
  );
}

function ListSkeleton() {
  return (
    <div className="mt-6 space-y-2">
      <Skeleton className="h-8 w-96" />
      {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-14 w-full" />)}
    </div>
  );
}
