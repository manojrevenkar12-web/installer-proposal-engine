import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../shared/api/client.ts";
import type { Alarm } from "../../shared/api/types.ts";
import { CAUSE_LABEL, dayLabel, kwh, pct } from "../../shared/format.ts";
import { duration, ease } from "../../shared/theme/motion.ts";
import { EmptyState, ErrorState, QueryView, Skeleton } from "../../shared/ui/states.tsx";

export function AftercarePage() {
  const query = useQuery({ queryKey: ["alarms"], queryFn: () => api<{ alarms: Alarm[] }>("/v1/alarms").then((r) => r.alarms) });
  return (
    <section>
      <h1 className="text-2xl font-semibold">Aftercare</h1>
      <p className="mt-1 max-w-2xl text-ink-2">
        Installed systems are compared every day with what that day's weather should have given. An alarm names the likely cause, so the right person goes out with the right parts.
      </p>
      <div className="mt-6">
        <QueryView query={query} title="alarms" skeleton={<div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 w-full" />)}</div>}
          isEmpty={(a) => a.length === 0} empty={<EmptyState title="No alarms">Every monitored system is delivering what its weather allows.</EmptyState>}>
          {(alarms) => <AlarmList alarms={alarms} />}
        </QueryView>
      </div>
    </section>
  );
}

function AlarmList({ alarms }: { alarms: Alarm[] }) {
  const open = alarms.filter((a) => a.resolvedDay === null);
  const closed = alarms.filter((a) => a.resolvedDay !== null);
  return (
    <>
      <h2 className="text-lg font-semibold">Open <span className="font-normal text-ink-3">{open.length}</span></h2>
      {open.length === 0 ? <p className="mt-2 text-sm text-ink-2">Nothing open.</p> : (
        <ul className="mt-3 space-y-3">
          <AnimatePresence initial={false}>{open.map((a) => <AlarmItem key={a.id} alarm={a} />)}</AnimatePresence>
        </ul>
      )}
      {closed.length > 0 && (
        <>
          <h2 className="mt-10 text-lg font-semibold">Fixed <span className="font-normal text-ink-3">{closed.length}</span></h2>
          <ul className="mt-3 divide-y divide-line rounded-[var(--radius-panel)] border border-line bg-surface">
            {closed.map((a) => (
              <li key={a.id} className="flex flex-wrap justify-between gap-2 px-5 py-3 text-sm">
                <span>{a.project?.customerName}: {CAUSE_LABEL[a.cause] ?? a.cause}</span>
                <span className="text-ink-2">found {dayLabel(a.day)}, fixed {dayLabel(a.resolvedDay!)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function AlarmItem({ alarm }: { alarm: Alarm }) {
  const qc = useQueryClient();
  const [day, setDay] = useState(Math.min(364, alarm.day + 3));
  const resolve = useMutation({
    mutationFn: () => api<Alarm>(`/v1/alarms/${alarm.id}/resolve`, { method: "POST", body: JSON.stringify({ day }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["alarms"] }); qc.invalidateQueries({ queryKey: ["project", alarm.projectId] }); },
  });
  const offline = alarm.kind === "offline";
  return (
    <motion.li layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={{ duration: duration.settle, ease }}
      className={`rounded-[var(--radius-panel)] border bg-surface px-5 py-4 ${offline ? "border-line" : "border-alarm/40"}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p>
          <span className={`font-semibold ${offline ? "text-warn" : "text-alarm"}`}>{CAUSE_LABEL[alarm.cause] ?? alarm.cause}</span>
          {" at "}
          {alarm.project ? <Link to={`/projects/${alarm.project.id}`} className="font-medium underline-offset-2 hover:underline">{alarm.project.customerName}</Link> : "a system"}
        </p>
        <p className="text-sm text-ink-2">
          found {dayLabel(alarm.day)}
          {alarm.performance !== null && `, ${pct(alarm.performance)} of normal, about ${kwh(alarm.lossKwhPerDay)} lost a day`}
        </p>
      </div>
      <p className="mt-3 whitespace-pre-line border-l-2 border-line pl-3 text-sm text-ink-2" lang="de">{alarm.message}</p>
      <form className="mt-4 flex flex-wrap items-center gap-2 text-sm" onSubmit={(e) => { e.preventDefault(); resolve.mutate(); }}>
        <label htmlFor={`fixed-${alarm.id}`} className="text-ink-2">Fixed on day</label>
        <input id={`fixed-${alarm.id}`} type="number" min={alarm.day} max={364} value={day} onChange={(e) => setDay(Number(e.target.value))}
          className="w-20 rounded-[var(--radius-mark)] border border-line bg-surface px-2 py-1" />
        <button type="submit" disabled={resolve.isPending} className="rounded-[var(--radius-mark)] bg-ink px-3 py-1.5 font-medium text-paper disabled:opacity-50">
          {resolve.isPending ? "Saving…" : "Mark fixed"}
        </button>
      </form>
      {resolve.isError && <div className="mt-3"><ErrorState title="Couldn't mark it fixed" error={resolve.error} /></div>}
    </motion.li>
  );
}
