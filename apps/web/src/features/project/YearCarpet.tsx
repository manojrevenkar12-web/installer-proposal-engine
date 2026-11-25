// The year in one picture: 365 days across, 24 hours down, each cell the expected solar yield
// of that hour. Summer noons glow; winter mornings and the shade of a tree show as gaps.
import { useEffect, useRef, useState } from "react";
import { dayLabel, MONTHS } from "../../shared/format.ts";
import { resolveRamp } from "../../shared/theme/chart.ts";

const MONTH_STARTS = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

function mix(a: string, b: string, t: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16));
  const x = p(a);
  const y = p(b);
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(",")})`;
}

export function YearCarpet({ pvKwh, peakKw }: { pvKwh: number[]; peakKw: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<{ day: number; hour: number; x: number; y: number } | null>(null);
  useEffect(() => {
    const c = canvas.current;
    if (!c || pvKwh.length !== 8760) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const ramp = resolveRamp();
    const max = Math.max(peakKw * 0.85, 0.001);
    for (let d = 0; d < 365; d++) for (let h = 0; h < 24; h++) {
      const t = Math.min(1, pvKwh[d * 24 + h] / max);
      const seg = Math.min(ramp.length - 2, Math.floor(t * (ramp.length - 1)));
      ctx.fillStyle = t <= 0 ? ramp[0] : mix(ramp[seg], ramp[seg + 1], t * (ramp.length - 1) - seg);
      ctx.fillRect(d, h, 1, 1);
    }
  }, [pvKwh, peakKw]);
  const value = hover ? pvKwh[hover.day * 24 + hover.hour] : 0;
  return (
    <figure className="m-0">
      <div className="relative">
        <div className="flex">
          <div className="flex w-10 flex-col justify-between py-0.5 pr-2 text-right text-xs text-ink-3" aria-hidden>
            <span>0:00</span><span>12:00</span><span>23:00</span>
          </div>
          <canvas ref={canvas} width={365} height={24} role="img"
            aria-label="Expected solar yield for every hour of a typical year"
            className="h-40 min-w-0 flex-1 rounded-[var(--radius-mark)] [image-rendering:pixelated] md:h-48"
            onMouseLeave={() => setHover(null)}
            onMouseMove={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              const day = Math.min(364, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * 365)));
              const hour = Math.min(23, Math.max(0, Math.floor(((e.clientY - r.top) / r.height) * 24)));
              setHover({ day, hour, x: e.clientX - r.left, y: e.clientY - r.top });
            }} />
        </div>
        <div className="ml-10 mt-1 grid grid-cols-12 text-xs text-ink-3" aria-hidden>
          {MONTHS.map((m, i) => <span key={m} style={{ gridColumnStart: i + 1 }}>{m}</span>)}
        </div>
        {hover && (
          <div className="pointer-events-none absolute z-10 rounded-[var(--radius-mark)] border border-line bg-surface px-2.5 py-1.5 text-xs shadow-sm"
            style={{ left: `calc(2.5rem + ${hover.x}px + 12px)`, top: hover.y - 8 }}>
            <span className="font-semibold">{dayLabel(hover.day)}, {hover.hour}:00</span>
            <span className="block text-ink-2">{value.toFixed(2)} kWh expected</span>
          </div>
        )}
      </div>
      <figcaption className="ml-10 mt-3 flex items-center gap-3 text-xs text-ink-2">
        <span>No sun</span>
        <span className="h-2 w-40 rounded-full" style={{ background: "linear-gradient(90deg, var(--sun-0), var(--sun-1), var(--sun-2), var(--sun-3), var(--sun-4))" }} />
        <span>Full output</span>
      </figcaption>
      <span className="sr-only">{MONTH_STARTS.length} months shown</span>
    </figure>
  );
}
