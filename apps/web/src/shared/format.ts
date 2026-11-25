const de = (d: number) => new Intl.NumberFormat("en-GB", { maximumFractionDigits: d, minimumFractionDigits: d });
export const kwh = (x: number) => `${de(0).format(Math.round(x))} kWh`;
export const kwp = (x: number) => `${de(1).format(x)} kWp`;
export const eur = (x: number) => `€${de(0).format(Math.round(x))}`;
export const pct = (x: number, d = 0) => `${de(d).format(x * 100)}%`;
export const years = (x: number) => `${de(1).format(x)} years`;
export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_STARTS = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 365];
export function dayLabel(day: number): string {
  const m = MONTH_STARTS.findIndex((s, i) => day < MONTH_STARTS[i + 1] && day >= s);
  return `${day - MONTH_STARTS[m] + 1} ${MONTHS[m]}`;
}
export const monthOfDay = (day: number) => MONTH_STARTS.findIndex((s, i) => day >= s && day < MONTH_STARTS[i + 1]);
export const STATUS_LABEL = { LEAD: "Lead", PLANNED: "Site visit done", OFFERED: "Offer sent", SIGNED: "Signed", INSTALLED: "Installed" } as const;
export const CAUSE_LABEL: Record<string, string> = {
  "inverter-outage": "Inverter outage",
  "string-fault": "String fault",
  shading: "New shading",
  soiling: "Soiled modules",
  underperformance: "Under-performing",
  "monitoring-offline": "Monitoring offline",
};
