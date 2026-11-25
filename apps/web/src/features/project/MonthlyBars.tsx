// Promised yield per month, with what was measured where the system is running.
import { useState } from "react";
import { MONTHS, kwh } from "../../shared/format.ts";
import { chart } from "../../shared/theme/chart.ts";
import { useWidth } from "../../shared/ui/useWidth.ts";

const H = 200;
const PAD = { l: 44, r: 8, t: 10, b: 24 };

export function MonthlyBars({ promised, measured }: { promised: number[]; measured: (number | null)[] | null }) {
  const [hover, setHover] = useState<number | null>(null);
  const [box, W] = useWidth<HTMLDivElement>(640);
  const max = Math.max(...promised, ...(measured ?? []).map((m) => m ?? 0), 1);
  const nice = Math.ceil(max / 200) * 200;
  const bw = (W - PAD.l - PAD.r) / 12;
  const y = (v: number) => PAD.t + (H - PAD.t - PAD.b) * (1 - v / nice);
  const series = measured ? 2 : 1;
  const barW = (bw - 10 - chart.barGap * (series - 1)) / series;
  return (
    <figure className="m-0">
      {(
        <div className="mb-2 flex gap-4 text-xs text-ink-2"><span>kWh per month</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-pv" />Promised</span>
          {measured && <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-export" />Measured</span>}
        </div>
      )}
      <div className="relative" ref={box}>
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block" role="img" aria-label="Promised yield per month">
          {[0, 0.5, 1].map((t) => (
            <g key={t}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(nice * t)} y2={y(nice * t)} stroke="var(--line)" opacity={chart.gridOpacity} />
              <text x={PAD.l - 6} y={y(nice * t) + 4} textAnchor="end" fontSize={chart.axisFont} fill="var(--ink-3)">{Math.round(nice * t)}</text>
            </g>
          ))}
          {promised.map((p, m) => {
            const x0 = PAD.l + m * bw + 5;
            const meas = measured?.[m] ?? null;
            return (
              <g key={m} onMouseEnter={() => setHover(m)} onMouseLeave={() => setHover(null)}>
                <rect x={PAD.l + m * bw} y={PAD.t} width={bw} height={H - PAD.t - PAD.b} fill="transparent" />
                <Bar x={x0} w={barW} top={y(p)} bottom={y(0)} fill="var(--flow-pv)" />
                {measured && meas !== null && <Bar x={x0 + barW + chart.barGap} w={barW} top={y(meas)} bottom={y(0)} fill="var(--flow-export)" />}
                <text x={PAD.l + m * bw + bw / 2} y={H - 6} textAnchor="middle" fontSize={chart.axisFont} fill="var(--ink-3)">{MONTHS[m]}</text>
              </g>
            );
          })}
                  </svg>
        {hover !== null && (
          <div className="pointer-events-none absolute top-0 rounded-[var(--radius-mark)] border border-line bg-surface px-2.5 py-1.5 text-xs shadow-sm"
            style={{ left: `${((PAD.l + hover * bw + bw) / W) * 100}%` }}>
            <span className="font-semibold">{MONTHS[hover]}</span>
            <span className="block text-ink-2">Promised {kwh(promised[hover])}</span>
            {measured && <span className="block text-ink-2">Measured {measured[hover] === null ? "no data" : kwh(measured[hover]!)}</span>}
          </div>
        )}
      </div>
    </figure>
  );
}

function Bar({ x, w, top, bottom, fill }: { x: number; w: number; top: number; bottom: number; fill: string }) {
  const h = Math.max(0, bottom - top);
  const r = Math.min(chart.barRadius, h, w / 2);
  // Rounded at the data end only; square on the baseline.
  return <path d={`M${x},${bottom} V${top + r} Q${x},${top} ${x + r},${top} H${x + w - r} Q${x + w},${top} ${x + w},${top + r} V${bottom} Z`} fill={fill} />;
}
