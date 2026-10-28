# 2026-10-28 — Documentation accuracy

The README previously described the released package as unpublished and implied broad
assistant compatibility without explaining transport requirements. It now records the
0.1.4 distribution channels, distinguishes local stdio/loopback HTTP from a hosted
ChatGPT connector, and uses the declared marketplace/plugin names for installation.
The preset table now includes the additional configured capability tools, and the
introduction makes clear that source accuracy and assistant behavior affect answers.
No runtime, package version, authentication or hosting behavior changed.

Validation: public GitHub/npm/official-registry metadata agrees on 0.1.4 and source
revision 9e7d21ea428a4a0ad7f224adc2eb768b264ac6fa; the desktop bundle hash matches the
registry. Thirty-five existing source tests passed, including real stdio checks for
all three workflow kits. Plugin commands were checked against installed CLI help and
the repository marketplace manifest; no plugin was installed by this review.

# 0.1.4 — Workflow review kits

Adds quote follow-up, invoice discrepancies and order-support handoff as stateless CLI kits with two narrow tools each. Previously Main Street served configured business facts and setup only. Each kit validates supplied data, reports uncertainty and prepares unsent review drafts; no connected provider or saved action is implied. Existing industry behavior remains covered by real stdio tests.

Validation: source/transport tests, packaged fresh-client installation, direct failure cases, public browser demo and independent reviews. Release evidence records actual counts and package hashes; a generated draft is not a customer outcome.
