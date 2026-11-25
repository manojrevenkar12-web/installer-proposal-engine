// Seeded randomness in named streams. A stream depends only on the seed and its keys, never on
// the design being run, so every design meets the same households, weather and faults.

function mix(h: number, x: number): number {
  h = Math.imul(h ^ x, 0x5bd1e995);
  h ^= h >>> 13;
  return Math.imul(h, 0x5bd1e995) >>> 0;
}

function hashKeys(seed: number, keys: (string | number)[]): number {
  let h = mix(0x9747b28c, seed);
  for (const k of keys) {
    const s = String(k);
    for (let i = 0; i < s.length; i++) h = mix(h, s.charCodeAt(i));
    h = mix(h, 0x2f);
  }
  return h >>> 0;
}

export type Random = () => number;

export function stream(seed: number, ...keys: (string | number)[]): Random {
  let a = hashKeys(seed, keys);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const uniform = (r: Random, [lo, hi]: [number, number] | number[]) => lo + (hi - lo) * r();
export function normal(r: Random): number {
  const u = Math.max(1e-12, r());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}
export function pick<T>(r: Random, weighted: [T, number][]): T {
  const total = weighted.reduce((s, [, w]) => s + w, 0);
  let x = r() * total;
  for (const [v, w] of weighted) { if ((x -= w) <= 0) return v; }
  return weighted[weighted.length - 1][0];
}
