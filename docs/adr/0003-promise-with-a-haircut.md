# ADR-0003: Promise less than the typical year

**Context.** The simulation's expected savings are for a typical year. A real first year can be 5% darker, the
roof's losses can be higher, and the customer's use differs from the bill.

**Decision.** The offer promises the expected savings minus `promise.haircut` (6%). Payback and the letter use the
promised figure; the console shows both.

**Consequences.** Dev study: broken promises 1.5% → 0.1%, signed offers 66% → 59%. The haircut costs signatures,
and we chose it deliberately: an installer's reputation lives on reviews, and the platform still signs twice the
spreadsheet's rate. The haircut is a setting; the `promise-p50` ablation keeps the trade-off visible.
