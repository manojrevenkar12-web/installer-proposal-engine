// The roof seen from above: each face points where it faces, sized by the kWp placed on it,
// inside the horizon the site visit measured (a tree or a neighbour's house as a dark band).
import type { RoofFace } from "../../shared/api/types.ts";

const R = 86;
const C = 100;
const rad = (deg: number) => ((deg - 90) * Math.PI) / 180;
const at = (deg: number, r: number) => [C + r * Math.cos(rad(deg)), C + r * Math.sin(rad(deg))] as const;

export function RoofDial({ faces, faceKwp }: { faces: RoofFace[]; faceKwp: number[] }) {
  const horizon = faces[0]?.horizonDeg ?? [];
  const ring = horizon.length === 36
    ? horizon.map((h, b) => at(b * 10 + 5, R - (Math.min(h, 45) / 45) * 34)).map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")
    : null;
  const maxKwp = Math.max(...faceKwp, 1);
  return (
    <figure className="m-0">
      <svg viewBox="0 0 200 200" className="mx-auto w-full max-w-[16rem]" role="img" aria-label={`Roof with ${faces.length} faces and the measured horizon`}>
        <circle cx={C} cy={C} r={R} fill="var(--surface-sunk)" stroke="var(--line)" />
        {ring && <polygon points={ring} fill="var(--surface)" stroke="var(--ink-3)" strokeWidth={1} strokeDasharray="2 2" />}
        {[["N", 0], ["E", 90], ["S", 180], ["W", 270]].map(([l, d]) => {
          const [x, y] = at(d as number, R + 9);
          return <text key={l} x={x} y={y + 4} textAnchor="middle" fontSize={11} fill="var(--ink-3)">{l}</text>;
        })}
        {faces.map((f, i) => {
          const k = faceKwp[i] ?? 0;
          const len = 18 + (k / maxKwp) * 46;
          const [x, y] = at(f.azimuthDeg, len);
          const [lx, ly] = at(f.azimuthDeg, len + 13);
          return (
            <g key={f.id}>
              <line x1={C} y1={C} x2={x} y2={y} stroke={k > 0 ? "var(--flow-pv)" : "var(--ink-3)"} strokeWidth={k > 0 ? 7 : 3} strokeLinecap="round" opacity={k > 0 ? 1 : 0.5} />
              <text x={lx} y={ly + 4} textAnchor="middle" fontSize={10.5} fontWeight={600} fill="var(--ink)">{k > 0 ? `${k.toFixed(1)}` : "–"}</text>
            </g>
          );
        })}
        <circle cx={C} cy={C} r={5} fill="var(--ink)" />
      </svg>
      <figcaption className="mt-2 text-center text-xs text-ink-2">
        Faces drawn toward the direction they face; numbers are kWp placed. Dashed line: the horizon measured on site.
      </figcaption>
    </figure>
  );
}
