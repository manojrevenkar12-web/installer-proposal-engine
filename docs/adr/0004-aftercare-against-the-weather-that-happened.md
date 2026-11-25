# ADR-0004: Aftercare compares each day with what its weather should have given

**Context.** Installers usually notice faults when a customer complains or a monthly total looks low. A monthly
threshold against the offer cannot tell a dark month from a broken string.

**Decision.** Each day, the monitor simulates the as-built system with that day's observed irradiance (satellite or
sensor) and compares the measured yield. The system's normal ratio is the median of clean days 10 to 45 days back,
so it follows the seasons but not a new fault. A CUSUM on the energy-weighted shortfall raises the alarm. The cause
is named from the shape of the loss: zero output (inverter), loss concentrated at some sun azimuths (shading), a
step (string fault) or a slide (soiling). Missing data is flagged as offline, never as a fault. Thresholds were
tuned on dev seeds only.

**Consequences.** Dev: 97% of material faults found, median 1 day, 92% right cause, 3.1 false alarms per 100
systems a year (threshold design: 35 days, 17 false alarms). Held-out: 91%, 1.25 days, 90%, but 5.9 false alarms,
above the gate of 5. Without the site-visit horizon false alarms rise to 16, because the normal ratio then swings
with sun height.
