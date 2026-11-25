// Chart tokens shared by every chart: mark sizes and the sequential ramp for energy.
export const chart = {
  barRadius: 4,
  barGap: 2,
  line: 2,
  marker: 8,
  gridOpacity: 0.6,
  axisFont: 12,
} as const;

export const sunRamp = ["var(--sun-0)", "var(--sun-1)", "var(--sun-2)", "var(--sun-3)", "var(--sun-4)"] as const;

/** Resolved hex values for canvas drawing, read from the CSS variables once. */
export function resolveRamp(): string[] {
  const style = getComputedStyle(document.documentElement);
  return ["--sun-0", "--sun-1", "--sun-2", "--sun-3", "--sun-4"].map((v) => style.getPropertyValue(v).trim() || "#c47f00");
}
