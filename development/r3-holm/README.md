# Unissued Holm D1 local checking components

Date: 2026-09-18 UTC. **Component implementation checkpoint; D1 remains open.**
This directory is outside the npm allowlist, released CLI, registered dispatcher,
and Protocol reference-source synchronization. No supported capability or public
report is produced by these components. The package remains Release 1 only.

## Fixed design authority and scope

- Verifier base: `940b8fb6990632029bcebd2ebdf6ce9dca8e9244`.
- Protocol design: [PR #355 head 1eb6b93](https://github.com/licklider-ai/nomue-protocol/tree/1eb6b931d7e20466bb8d3c364965545362efb2f0/governance/drafts/release-3-preparation/holm-design-decision-20260918).
- D0 permission: [reviewer confirmation at 6410025](https://github.com/licklider-ai/nomue-protocol/blob/6410025cb56631a63c311e4aa213890e02f4d0be/review-inputs/r3-holm-design-decision-20260918/REPAIR-CONFIRMATION.md),
  GO_FOR_UNISSUED_IMPLEMENTATION only, not adoption or publication.
- Existing candidate.4: Protocol `b52389fd3efc6b8968613f59f147a578d5bbb55d`.
  Eight schema/fixture artifacts are copied byte-for-byte under `fixtures/`,
  pinned in `PROVENANCE.json`. The D0 relation algorithm is extracted into
  `d0-relations.ts`; see the current handoff for its exact source and adaptations.
  No numerical kernel, worker, public report schema or legacy envelope is imported.

This step connects raw projection and dependencies to six actual local checks,
before coupling them to a complete successor. Source/IEEE/Holm numerical evidence
remains at its original scope. There is no new theorem, numerical method,
tolerance or performance/host qualification in this checkpoint.

## Implemented components

`stored-bytes.ts` uses the existing strict parser and JCS implementation, enforces
the candidate Record byte/depth/node/container/string limits, preserves a copied
input buffer, and extracts P(B) by lexical byte spans. It removes only the decoded
top-level integrity member and the delimiter specified by DESIGN, preserving all
other whitespace, ordering and spellings. It computes the domain-separated hash
from those bytes and compares stored bytes with their canonical representation.
On a canonical-storage path it independently compares P(B) with the canonical
parsed projection. Unavailable canonicalization, malformed input, exceeded bounds
or checkpoint failure produce no inspection result.

The returned `canonicalStorage` is a storage observation, not an I result, Record
schema result, admission judgment or forwarding permission. A K-failure reference
hash identifies rejected stored bytes. Caller-owned returned buffers are mutable;
the future full-call adapter must preserve its private inspected-byte snapshot
through completion and forwarding. This component does not expose a forwarding API.

`dependencies.ts` fixes S/K/D/H/I/C/A identities and dependencies using unissued
local labels. It builds blocked rows only from actual blocker identities/reasons,
propagates transitively with a deterministic deduplicated union, and rejects
attempts to supply an evaluation for a blocked stage. Its validator checks row
identity/order, exact field sets, execution/outcome consistency, and every blocker
and reason. Only C accepts the design's expected-context execution-error state;
whole-invocation failure is not converted into a graph row.

Graph invariant violations throw `GraphInvariantError`, with
`kind=internal_error`. Every graph-component exception (including unexpected
exceptions) must become a whole-invocation internal-error refusal at integration,
never a graph row or report. The future full-call adapter must test this mapping.
Parsed `StoredInspection.value` is also caller-owned and must be treated read-only.

The graph receives **trusted local evaluations**, not submitted evidence. It does
not prove that any supplied pass is true or perform D0/Holm validation. Admitting
arbitrary user-supplied rows through this helper would be an integration defect.
The future public report still needs scoped versioned schemas and inverse/output
validation. No public wire shape is issued by these internal TypeScript interfaces.

`local-checks.ts` performs exact candidate routing, supplied-reference admission,
Record schema S, storage K, D0 relations D, bounded Holm admission H, declared
digest comparison I and independent expected-context comparison C. It takes raw
bytes, a trusted context acquisition callback and budget checkpoint; it accepts
no caller-supplied evaluation flags. It freezes its private parsed Record and
does not expose inspected buffers. S failure prevents context acquisition. D/H
do not depend on I/C agreement; K failure blocks I. Graph rows can be assembled
for blocked-A cases; a six-pass preparation deliberately has no A evaluation and
cannot be assembled into a complete graph until actual arithmetic is added.

The old Record and expected schemas describe component input fixtures only.
This does not implement the old candidate.4 invocation semantics or issue a
successor bundle. A versioned public output contract, numerical worker, refusal
adapter, supported-host controls and full lifecycle remain for D1/D2 work.
`ExpectedContextAccessError` may wrap only an expected-input access error;
unexpected callback errors and budget failures propagate as invocation failures.
Actual filesystem acquisition and its bounded reader are not implemented here.
Checkpoint callbacks must come from the trusted shared budget owner; test no-op
callbacks provide no enforcement evidence. Raw/expected document bounds share
one owner in `stored-bytes.ts`; legacy adapter size guards remain explicit.

## Reproduce

```sh
npm ci --ignore-scripts
node --import tsx --test development/r3-holm/dependencies.test.ts development/r3-holm/stored-bytes.test.ts development/r3-holm/local-checks.test.ts
npx tsc --noEmit --target es2022 --module nodenext --moduleResolution nodenext --allowImportingTsExtensions --strict --types node development/r3-holm/dependencies.ts development/r3-holm/dependencies.test.ts development/r3-holm/stored-bytes.ts development/r3-holm/stored-bytes.test.ts development/r3-holm/d0-relations.ts development/r3-holm/local-checks.ts development/r3-holm/local-checks.test.ts
npm test
npm run test:package
```

CI uses these same test and strict typecheck commands, naming files explicitly
so Node 20/22 on Windows/macOS/Linux does not rely on shell globbing.
Those component regressions do not admit those platforms for full R3 execution.

Tests include 14 hand-specified raw input/projection pairs, independent expected
hashes from those literal targets, strict-parser rejection, bounds, early/late
checkpoint interruption, 192 graph combinations checked against a separate
boolean expression, and 15 invalid-output mutations. Expected byte targets are
not generated by either implementation component. No published numerical oracle
or independent researcher review is claimed for these author tests.

`tests/boundary.ts` names every file in this directory in its existing
repository inventory; it does not use a wildcard or edit historical extraction
evidence. `scripts/package-smoke.mjs` additionally rejects any `development/`
entry in the actual npm tarball. See [current handoff](LOCAL-CHECKS-HANDOFF.md) for coverage, self-review,
remaining work and the bounded independent implementation-review request.

Prepared with OpenAI Codex assistance in the continuing author/coordinator
context under the owner's R3 work direction. Public inputs only; no private product
source or production orchestration is included. Self-review is not independent
clearance and no human expert review is claimed.
