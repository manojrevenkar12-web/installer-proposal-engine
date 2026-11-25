// Measured daily yield against what the weather that day should have given. A fault opens a gap.
import { useState } from "react";
import type { Alarm, MonitoringSeries } from "../../shared/api/types.ts";
import { CAUSE_LABEL, dayLabel } from "../../shared/format.ts";
import { chart } from "../../shared/theme/chart.ts";
import { useWidth } from "../../shared/ui/useWidth.ts";

const H = 210;
const PAD = { l: 40, r: 10, t: 14, b: 24 };

export function MonitoringChart({ series, alarms }: { series: MonitoringSeries["days"]; alarms: Alarm[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [box, W] = useWidth<HTMLDivElement>(640);
  if (series.length === 0) return null;
  const first = series[0].day;
  const last = series[series.length - 1].day;
  const max = Math.max(...series.map((d) => Math.max(d.expectedKwh, d.measuredKwh ?? 0)), 1);
  const x = (day: number) => PAD.l + ((day - first) / Math.max(1, last - first)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (H - PAD.t - PAD.b) * (1 - v / max);
  const path = (pick: (d: MonitoringSeries["days"][number]) => number | null) => {
    let d = "";
    let pen = false;
    for (const p of series) {
      const v = pick(p);
      if (v === null) { pen = false; continue; }
      d += `${pen ? "L" : "M"}${x(p.day).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    }
    return d;
  };
  const point = hover === null ? null : series.reduce((a, b) => (Math.abs(b.day - hover) < Math.abs(a.day - hover) ? b : a));
  return (
    <figure className="m-0">
      <div className="mb-2 flex flex-wrap gap-4 text-xs text-ink-2"><span>kWh per day</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded-full bg-ink-3" />Expected for the day's weather</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded-full bg-export" />Measured</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-px bg-alarm" />Alarm</span>
      </div>
      <div className="relative" ref={box}>
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block" role="img" aria-label="Measured and expected daily yield"
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const px = ((e.clientX - r.left) / r.width) * W;
            setHover(Math.round(first + ((px - PAD.l) / (W - PAD.l - PAD.r)) * (last - first)));
          }}>
          {[0, 0.5, 1].map((t) => (
            <g key={t}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(max * t)} y2={y(max * t)} stroke="var(--line)" opacity={chart.gridOpacity} />
              <text x={PAD.l - 6} y={y(max * t) + 4} textAnchor="end" fontSize={chart.axisFont} fill="var(--ink-3)">{Math.round(max * t)}</text>
            </g>
          ))}
          {alarms.map((a) => (
            <g key={a.id}>
              <line x1={x(a.day)} x2={x(a.day)} y1={PAD.t} y2={H - PAD.b} stroke="var(--alarm)" strokeWidth={1.5} />
              <text x={x(a.day) + 4} y={PAD.t + 8} fontSize={11} fill="var(--alarm)">{CAUSE_LABEL[a.cause] ?? a.cause}</text>
            </g>
          ))}
          <path d={path((d) => d.expectedKwh)} fill="none" stroke="var(--ink-3)" strokeWidth={chart.line} strokeLinejoin="round" />
          <path d={path((d) => d.measuredKwh)} fill="none" stroke="var(--flow-export)" strokeWidth={chart.line} strokeLinejoin="round" />
          {point && <line x1={x(point.day)} x2={x(point.day)} y1={PAD.t} y2={H - PAD.b} stroke="var(--ink-2)" strokeDasharray="3 3" />}
          {[first, Math.round((first + last) / 2), last].map((d, i) => <text key={d} x={x(d)} y={H - 6} textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"} fontSize={chart.axisFont} fill="var(--ink-3)">{dayLabel(d)}</text>)}
                  </svg>
        {point && (
          <div className="pointer-events-none absolute top-6 rounded-[var(--radius-mark)] border border-line bg-surface px-2.5 py-1.5 text-xs shadow-sm"
            style={{ left: `min(calc(${(x(point.day) / W) * 100}% + 10px), calc(100% - 11rem))` }}>
            <span className="font-semibold">{dayLabel(point.day)}</span>
            <span className="block text-ink-2">Expected {point.expectedKwh.toFixed(1)} kWh</span>
            <span className="block text-ink-2">Measured {point.measuredKwh === null ? "no data" : `${point.measuredKwh.toFixed(1)} kWh`}</span>
          </div>
        )}
      </div>
    </figure>
  );
}
