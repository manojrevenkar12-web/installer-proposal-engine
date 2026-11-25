// The aftercare agent's customer message: the model writes, code supplies and checks the numbers.
import type { Fact } from "../offer/facts.ts";
import type { Alarm } from "./monitor.ts";

export const CAUSE_TEXT: Record<string, string> = {
  "inverter-outage": "der Wechselrichter liefert keinen Strom",
  "string-fault": "ein Modulstrang liefert zu wenig",
  shading: "eine neue Verschattung",
  soiling: "verschmutzte Module",
  underperformance: "die Anlage liefert weniger als angeboten",
  "monitoring-offline": "die Datenverbindung der Anlage ist unterbrochen",
};

export function aftercareFacts(alarm: Alarm): Fact[] {
  return [
    { key: "performance", label: "Leistung", value: Number.isFinite(alarm.performance) ? alarm.performance * 100 : 0, unit: "%", decimals: 0 },
    { key: "lossPerDay", label: "Verlust pro Tag", value: Math.max(0, alarm.lossKwhPerDay), unit: "kWh", decimals: 1 },
  ];
}
