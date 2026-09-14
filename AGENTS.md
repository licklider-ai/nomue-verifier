# Verifier implementation ownership

Read README.md, CONTRIBUTING.md, NON-CLAIMS.md, SOURCE-PIN.json and
REFERENCE-OWNERSHIP.md before modifying the implementation.

This repository is the development home of the public reference checker.
Protocol owns scientific meaning, schemas, registered checks, tolerance policy,
support declarations and conformance expectations. Its research, change and
release rules still govern changes to those meanings. Source location grants
no semantic or release authority. Never resolve a specification gap by code.

Keep the covered checker correct, offline and scoped. Preserve strict input
parsing, exact bundle dispatch, refusal reasons and non-asserted boundaries.
Do not introduce an overall scientific verdict or private implementation inputs.
Numerical expected values need independent evidence, not this checker alone.

Make reference implementation changes here first. Protocol's pinned copies are
updated as a coordinated intake, never edited as a second implementation.
Keep the Protocol resource adapter distinct from the package adapter.

The imported approval, attestation, lifecycle and paired-t spike sources remain
unreleased development material. Do not add them to the npm runtime or infer
new supported bundles from their presence. Retain published release identities.

Run npm test and npm run test:package for runtime or packaging changes. Use
the corresponding pinned Protocol conformance/oracle tests for reference
changes. Preserve Linux, Windows and macOS coverage. Follow CONTRIBUTING.md
for artifact naming, attribution and material process disclosure.

## Public implementation boundary

Steward direction adopted 2026-09-14: maintain the public reference checker for
continued public Protocol scopes. Keep its promised numerical checking correct.
Production-only optimization, orchestration, session handling and private runtime
data do not belong here merely because the commercial product uses them.
Before any public push or PR, inspect the actual outgoing files and text for
unnecessary production detail. Use public or explicitly publication-cleared inputs.
The public checker is not intentionally degraded to create a paid-product gap.
Preserve the methodology and evidence needed to reproduce covered checks.
