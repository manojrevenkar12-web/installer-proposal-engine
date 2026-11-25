import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import type { MonitoringSeries, ProjectDetail, Proposal } from "../../shared/api/types.ts";
import { CAUSE_LABEL, dayLabel, eur, kwh, kwp, monthOfDay, pct, years } from "../../shared/format.ts";
import { duration, ease, stagger } from "../../shared/theme/motion.ts";
import { StatusPill } from "../../shared/ui/StatusPill.tsx";
import { EmptyState, ErrorState, QueryView, Skeleton } from "../../shared/ui/states.tsx";
import { MonitoringChart } from "./MonitoringChart.tsx";
import { MonthlyBars } from "./MonthlyBars.tsx";
import { OfferLetter } from "./OfferLetter.tsx";
import { RoofDial } from "./RoofDial.tsx";
import { YearCarpet } from "./YearCarpet.tsx";
import { useAccept, useMonitoring, useNewProposal, useProject, useYear } from "./hooks.ts";

export function ProjectPage() {
  const { id = "" } = useParams();
  const query = useProject(id);
  return (
    <QueryView query={query} title="the project" skeleton={<PageSkeleton />}>
      {(p) => <Project p={p} />}
    </QueryView>
  );
}

// One orchestrated entrance: the sections settle in order, top to bottom.
const section = (i: number) => ({ initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { delay: i * stagger.section, duration: duration.settle, ease } });

function Project({ p }: { p: ProjectDetail }) {
  const latest = p.proposals[0];
  const accepted = p.proposals.find((x) => x.status === "ACCEPTED");
  const shown = accepted ?? latest;
  const create = useNewProposal(p.id);
  const accept = useAccept(p.id);
  return (
    <article>
      <Link to="/" className="text-sm text-ink-2 hover:underline">All projects</Link>
      <header className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{p.customerName}</h1>
          <p className="mt-1 text-ink-2">
            {p.statedConsumptionKwh.toLocaleString("en-GB")} kWh a year on the bill
            {p.heatPumpAreaM2 ? `, heat pump planned for ${p.heatPumpAreaM2} m² (built ${p.heatPumpBuildingYear})` : ""}
            {p.evKmPerYear ? `, electric car ${p.evKmPerYear.toLocaleString("en-GB")} km a year` : ""}
            {p.budgetEur ? `, budget ${eur(p.budgetEur)}` : ""}
          </p>
        </div>
        <StatusPill status={p.status} />
      </header>

      {!shown ? (
        <motion.div {...section(1)} className="mt-8">
          {p.faces.length === 0
            ? <EmptyState title="Waiting for the site visit">Add the roof faces and the measured horizon (<code>PUT /v1/projects/{"{id}"}/faces</code>) to size a system.</EmptyState>
            : <EmptyState title="No offer yet"><NewVersionButton create={create} label="Size and write the first offer" /></EmptyState>}
        </motion.div>
      ) : (
        <>
          <motion.section {...section(1)} className="mt-8 grid gap-6 border-y border-line py-6 sm:grid-cols-2 lg:grid-cols-4">
            <Figure label="System" value={`${kwp(shown.kwp)}${shown.batteryKwh > 0 ? ` and ${shown.batteryKwh} kWh` : ""}`} note={`best of ${shown.plan.candidatesEvaluated} systems simulated`} />
            <Figure label="Price" value={eur(shown.priceEur)} note={p.budgetEur ? `${pct(shown.priceEur / p.budgetEur)} of the budget` : undefined} />
            <Figure label="Promised savings, first year" value={eur(shown.promisedSavingsEur)} note={`expected ${eur(shown.plan.expected.savingsEur)}; the promise keeps a margin`} />
            <Figure label="Payback" value={years(shown.paybackYears)} note={`${pct(shown.plan.expected.selfConsumedKwh / shown.plan.expected.yieldKwh)} of the yield used at home`} />
          </motion.section>

          <motion.section {...section(2)} className="mt-10">
            <SectionTitle title="The year, hour by hour" note={`Expected yield of version ${shown.version} in a typical year for this site`} />
            <Year id={p.id} version={shown.version} peakKw={shown.plan.inverterKw} />
          </motion.section>

          <motion.section {...section(3)} className="mt-10 grid gap-10 lg:grid-cols-[17rem_1fr]">
            <div>
              <SectionTitle title="Roof" />
              <RoofDial faces={p.faces} faceKwp={shown.plan.faceKwp} />
            </div>
            <div>
              <SectionTitle title={`Offer, version ${shown.version}`} note={shown.status === "ACCEPTED" ? "Signed by the customer" : shown.status === "SUPERSEDED" ? "Replaced by a newer version" : "Not signed yet"} />
              <OfferLetter text={shown.offerText} facts={shown.plan.facts} source={shown.offerSource} draftsRejected={shown.draftsRejected} />
              <div className="mt-4 flex flex-wrap gap-2">
                {!accepted && latest && latest.status !== "SUPERSEDED" && (
                  <button type="button" onClick={() => accept.mutate(latest.id)} disabled={accept.isPending}
                    className="rounded-[var(--radius-mark)] bg-ink px-4 py-2 text-sm font-medium text-paper disabled:opacity-50">
                    {accept.isPending ? "Recording signature…" : "Record the customer's signature"}
                  </button>
                )}
                {!accepted && <NewVersionButton create={create} label="Recalculate as a new version" />}
              </div>
              {(accept.isError || create.isError) && <div className="mt-3"><ErrorState title="That didn't work" error={accept.error ?? create.error} /></div>}
            </div>
          </motion.section>

          <motion.section {...section(4)} className="mt-10">
            <SectionTitle title="Yield per month" note={p.status === "INSTALLED" ? "Promised against measured" : "What the offer promises"} />
            <Monthly p={p} shown={shown} />
          </motion.section>

          {p.status === "INSTALLED" && (
            <motion.section {...section(5)} className="mt-10">
              <SectionTitle title="Aftercare" note="Each day's yield against what that day's weather should have given" />
              <Aftercare p={p} />
            </motion.section>
          )}

          {p.proposals.length > 1 && (
            <section className="mt-10">
              <SectionTitle title="Versions" />
              <ol className="divide-y divide-line rounded-[var(--radius-panel)] border border-line bg-surface">
                {p.proposals.map((v) => (
                  <li key={v.id} className="flex flex-wrap justify-between gap-2 px-5 py-3 text-sm">
                    <span className="font-medium">Version {v.version}</span>
                    <span>{kwp(v.kwp)}{v.batteryKwh > 0 ? ` and ${v.batteryKwh} kWh` : ""}, {eur(v.priceEur)}</span>
                    <span className="text-ink-2">{v.status.toLowerCase()}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </>
      )}
    </article>
  );
}

function NewVersionButton({ create, label }: { create: ReturnType<typeof useNewProposal>; label: string }) {
  return (
    <button type="button" onClick={() => create.mutate()} disabled={create.isPending}
      className="rounded-[var(--radius-mark)] border border-ink px-4 py-2 text-sm font-medium disabled:opacity-50">
      {create.isPending ? "Simulating every option…" : label}
    </button>
  );
}

function Year({ id, version, peakKw }: { id: string; version: number; peakKw: number }) {
  const q = useYear(id, version);
  return (
    <QueryView query={q} title="the year" skeleton={<Skeleton className="h-48 w-full" />} isEmpty={(d) => d.pvKwh.length === 0} empty={<EmptyState title="No simulation for this version" />}>
      {(d) => <YearCarpet pvKwh={d.pvKwh} peakKw={peakKw} />}
    </QueryView>
  );
}

function Monthly({ p, shown }: { p: ProjectDetail; shown: Proposal }) {
  const q = useMonitoring(p.id, p.status === "INSTALLED");
  if (p.status !== "INSTALLED") return <MonthlyBars promised={shown.plan.promise.monthlyPvKwh} measured={null} />;
  return (
    <QueryView query={q} title="measurements" skeleton={<Skeleton className="h-52 w-full" />}>
      {(d) => <MonthlyBars promised={shown.plan.promise.monthlyPvKwh} measured={monthlyMeasured(d.days)} />}
    </QueryView>
  );
}

function monthlyMeasured(days: MonitoringSeries["days"]): (number | null)[] {
  const sums: (number | null)[] = new Array(12).fill(null);
  const counts = new Array(12).fill(0);
  for (const d of days) {
    const m = monthOfDay(d.day);
    counts[m]++;
    if (d.measuredKwh !== null) sums[m] = (sums[m] ?? 0) + d.measuredKwh;
  }
  // Only complete months are compared with the promise.
  const length = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return sums.map((s, m) => (counts[m] === length[m] ? s : null));
}

function Aftercare({ p }: { p: ProjectDetail }) {
  const q = useMonitoring(p.id, true);
  return (
    <QueryView query={q} title="measurements" skeleton={<Skeleton className="h-56 w-full" />} isEmpty={(d) => d.days.length === 0}
      empty={<EmptyState title="No measurements yet">Upload daily data with <code>POST /v1/projects/{"{id}"}/monitoring</code>.</EmptyState>}>
      {(d) => (
        <>
          <MonitoringChart series={d.days} alarms={p.alarms} />
          {p.alarms.length === 0
            ? <p className="mt-3 text-sm text-ink-2">No alarm: over {d.days.length} days the system delivered what its weather allowed.</p>
            : <ul className="mt-4 space-y-2">{p.alarms.map((a) => (
              <li key={a.id} className="rounded-[var(--radius-panel)] border border-line bg-surface px-4 py-3 text-sm">
                <span className="font-semibold text-alarm">{CAUSE_LABEL[a.cause] ?? a.cause}</span> on {dayLabel(a.day)}
                {a.performance !== null && <span className="text-ink-2">, delivering {pct(a.performance)} of normal, about {kwh(a.lossKwhPerDay)} lost a day</span>}
                {a.resolvedDay !== null && <span className="text-ok">, fixed on {dayLabel(a.resolvedDay)}</span>}
              </li>
            ))}</ul>}
        </>
      )}
    </QueryView>
  );
}

function SectionTitle({ title, note }: { title: string; note?: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      {note && <p className="text-sm text-ink-3">{note}</p>}
    </div>
  );
}

function Figure({ label, value, note }: { label: string; value: string; note?: ReactNode }) {
  return (
    <div>
      <p className="text-sm text-ink-2">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
      {note && <p className="mt-1 text-xs text-ink-3">{note}</p>}
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-72" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-48 w-full" />
      <div className="grid gap-6 lg:grid-cols-[17rem_1fr]"><Skeleton className="h-64" /><Skeleton className="h-64" /></div>
    </div>
  );
}
