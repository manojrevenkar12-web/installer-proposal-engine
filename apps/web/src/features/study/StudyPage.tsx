// The lab's results, read from the generated reports (apps/web/public/data/study.json).
import { useQuery } from "@tanstack/react-query";
import { eur, pct } from "../../shared/format.ts";
import { EmptyState, QueryView, Skeleton } from "../../shared/ui/states.tsx";

interface M { winRate: number; brokenPromiseRate: number; yieldErrorPct: number; savingsBiasPct: number; customerValuePer100LeadsEur: number; revenuePer100LeadsEur: number; inventedNumbersSent: number; materialDetectionRate: number; medianDaysToDetect: number; falseAlarmsPer100: number; causeAccuracy: number }
interface D { id: string; label: string; kind: string; mean: M }
interface G { id: string; label: string; value: number | null; limit: string; pass: boolean }
interface R { seeds: number[]; householdsPerSeed: number; designs: D[]; gates: G[] }
interface Study { dev: R; heldout: R | null }

export function StudyPage() {
  const query = useQuery({ queryKey: ["study"], queryFn: async () => {
    const res = await fetch("data/study.json");
    if (!res.ok) throw new Error(`The study report is missing (${res.status}). Run npm run lab -- dev.`);
    return (await res.json()) as Study;
  } });
  return (
    <section>
      <h1 className="text-2xl font-semibold">Study</h1>
      <p className="mt-1 max-w-2xl text-ink-2">
        Ten designs met the same simulated households, roofs, weather and faults. The world knows the truth; the designs only see what an installer would.
      </p>
      <div className="mt-6">
        <QueryView query={query} title="the study" skeleton={<Skeleton className="h-96 w-full" />} isEmpty={(s) => !s.dev} empty={<EmptyState title="No study yet" />}>
          {(s) => <Results s={s} />}
        </QueryView>
      </div>
    </section>
  );
}

function Results({ s }: { s: Study }) {
  const d = s.dev;
  const max = Math.max(...d.designs.map((x) => x.mean.customerValuePer100LeadsEur));
  return (
    <>
      <p className="text-sm text-ink-3">Dev: {d.seeds.length} seeds of {d.householdsPerSeed} households. {s.heldout ? `Held-out: ${s.heldout.seeds.length} seeds, run once.` : "Held-out not run."}</p>
      <div className="mt-4 overflow-x-auto rounded-[var(--radius-panel)] border border-line bg-surface">
        <table className="w-full min-w-[46rem] text-sm">
          <thead className="text-left text-xs text-ink-3">
            <tr className="border-b border-line">
              <th className="px-4 py-2.5 font-medium">Design</th>
              <th className="px-3 py-2.5 text-right font-medium">Signed</th>
              <th className="px-3 py-2.5 text-right font-medium">Promises broken</th>
              <th className="px-3 py-2.5 font-medium">Customers' value per 100 leads</th>
              <th className="px-3 py-2.5 text-right font-medium">Invented numbers sent</th>
            </tr>
          </thead>
          <tbody>
            {d.designs.map((x) => (
              <tr key={x.id} className={`border-b border-line last:border-0 ${x.kind === "platform" ? "bg-sunk/60 font-semibold" : ""}`}>
                <td className="px-4 py-2.5">{x.label}</td>
                <td className="px-3 py-2.5 text-right">{pct(x.mean.winRate)}</td>
                <td className={`px-3 py-2.5 text-right ${x.mean.brokenPromiseRate > 0.1 ? "text-alarm" : ""}`}>{pct(x.mean.brokenPromiseRate, 1)}</td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 flex-1 rounded-r-[var(--radius-mark)] bg-sunk"><div className="h-full rounded-r-[var(--radius-mark)] bg-self" style={{ width: `${(x.mean.customerValuePer100LeadsEur / max) * 100}%` }} /></div>
                    <span className="w-24 text-right">{eur(x.mean.customerValuePer100LeadsEur)}</span>
                  </div>
                </td>
                <td className={`px-3 py-2.5 text-right ${x.mean.inventedNumbersSent > 0 ? "text-alarm" : ""}`}>{Math.round(x.mean.inventedNumbersSent)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        {[["Dev gates", d] as const, ["Held-out gates", s.heldout] as const].map(([title, r]) => r && (
          <div key={title}>
            <h2 className="text-lg font-semibold">{title} <span className="font-normal text-ink-3">{r.gates.filter((g) => g.pass).length} of {r.gates.length} pass</span></h2>
            <ul className="mt-3 divide-y divide-line rounded-[var(--radius-panel)] border border-line bg-surface text-sm">
              {r.gates.map((g) => (
                <li key={g.id} className="flex items-baseline justify-between gap-3 px-4 py-2.5">
                  <span>{g.label}</span>
                  <span className={`shrink-0 whitespace-nowrap ${g.pass ? "text-ok" : "font-semibold text-alarm"}`}>{g.pass ? "pass" : "fail"} <span className="font-normal text-ink-3">{formatGate(g.value)}</span></span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </>
  );
}

function formatGate(v: number | null): string {
  if (v === null) return "–";
  if (v !== 0 && Math.abs(v) < 0.001) return v.toExponential(1);
  return Number(v.toPrecision(3)).toLocaleString("en-GB");
}
