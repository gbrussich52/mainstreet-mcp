# 0.1.5 — Inquiry annotation accuracy

`submit_inquiry` previously advertised `openWorldHint: false` for every sink, even
when configured to forward messages to an external webhook. It now advertises
`true` in webhook mode and `false` in file mode. The other behavior hints and inquiry
delivery, screening and rate limiting are unchanged. This package also includes the
October 28 README corrections below; the published 0.1.4 tarball predates them.

The native npm audit also identified six vulnerable dependencies in the previous
lockfiles. Exact direct pins now use MCP node 2.1.2, server/client 2.4.0 and Zod
4.6.7; both root and desktop lockfiles resolve Hono 4.13.14 and its Node adapter
2.1.5. These compatible updates repair the advisories without changing the CLI or
adding services. Both native audits now report zero vulnerabilities.

Validation: discovery-only regression tests inspect both modes using a real MCP
stdio client without submitting an inquiry. The file case includes a webhook URL
to prove that the configured mode controls the hint. Existing tests and package
readback cover the unchanged business/setup/workflow surfaces.

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
