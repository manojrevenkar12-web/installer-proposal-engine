# ADR-0002: The model writes the letter; code decides every number in it

**Context.** An installer's offer is a promise the customer can hold them to. A language model writes better
letters than a template but sometimes changes a number or adds a claim ("30 % Förderung", "bis zu 90 % Autarkie").

**Decision.** The simulation produces a list of facts (kWp, battery, price, yield, self-consumption, autarky,
savings, payback). The writer receives only the facts. `checkDraft` reads every number with a unit from the draft
(German and English formats) and requires it to equal a fact at the precision written. A failing draft is
redrafted with the rejected numbers named; after `offer.maxDrafts` the template is sent. The console shows each
number's source with the same checker.

**Consequences.** In the dev study the unchecked agent sends about 193 invented numbers per 400 leads; the checked
one sends none, and about 8 letters per 400 fall back to the template. The rule cannot catch a correct number used in a wrong
sentence; facts are therefore labelled and the template wording is kept for the legally relevant lines.
