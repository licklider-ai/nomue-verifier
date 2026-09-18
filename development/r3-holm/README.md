# Unissued Holm D1 successor inner call

Date: 2026-09-18 UTC. **Component implementation checkpoint; D1 remains open.**
This directory is outside the npm allowlist, released CLI, registered dispatcher,
and Protocol reference-source synchronization. Only unissued development outputs
are produced; no supported capability is added. The package remains Release 1 only.

## Fixed design authority and scope

- Verifier base: `940b8fb6990632029bcebd2ebdf6ce9dca8e9244`.
- Protocol design: [PR #355 head 1eb6b93](https://github.com/licklider-ai/nomue-protocol/tree/1eb6b931d7e20466bb8d3c364965545362efb2f0/governance/drafts/release-3-preparation/holm-design-decision-20260918).
- D0 permission: [reviewer confirmation at 6410025](https://github.com/licklider-ai/nomue-protocol/blob/6410025cb56631a63c311e4aa213890e02f4d0be/review-inputs/r3-holm-design-decision-20260918/REPAIR-CONFIRMATION.md),
  GO_FOR_UNISSUED_IMPLEMENTATION only, not adoption or publication.
- Existing candidate.4: Protocol `b52389fd3efc6b8968613f59f147a578d5bbb55d`.
  Eight schema/fixture artifacts are copied byte-for-byte under `fixtures/`,
  pinned in `PROVENANCE.json`. The D0 relation algorithm is extracted into
  `d0-relations.ts`; see the current handoff for its exact source and adaptations.
  The next checkpoint also retains the numerical kernel, worker and independent
  oracle byte-for-byte in `numerics/`, with their own provenance manifest.
  The legacy envelope and supervisor are not imported.

This step connects actual S/K/D/H/I/C evaluations to the unchanged numerical
worker A and versioned development output. Source/IEEE/Holm numerical evidence
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

The old Record and expected schemas remain exact component fixtures. New
`contracts/` schemas use candidate.5 identities; its inner call rejects candidate.4
instead of aliasing it. The Record and expected schema constraints are unchanged
apart from their candidate identities. The new output schema separates four
conformance rows from three verification rows and keeps all eight non-claims.
Permanent registry allocation and supported dispatch remain D2/D3 work.
`ExpectedContextAccessError` may wrap only an expected-input access error;
unexpected callback errors and budget failures propagate as invocation failures.
`execution.ts` now supplies a regular-file reader bounded to cap+1 bytes, before
decoding; expected-file access is delayed until C. It also supplies one monotonic
time/heap budget, explicit cancellation and a bounded isolated Python child.
Checkpoint callbacks must come from the trusted shared budget owner; test no-op
callbacks provide no enforcement evidence. Raw/expected document bounds share
one owner in `stored-bytes.ts`; legacy adapter size guards remain explicit.

## Reproduce

```sh
npm ci --ignore-scripts
node --import tsx --test development/r3-holm/dependencies.test.ts development/r3-holm/stored-bytes.test.ts development/r3-holm/local-checks.test.ts development/r3-holm/inner-call.test.ts development/r3-holm/controlled-call.test.ts development/r3-holm/fault-injections.test.ts
npx tsc --project development/r3-holm/tsconfig.json
npm test
npm run test:package
```

CI uses these same test and strict typecheck commands, naming files explicitly
so Node 20/22 on Windows/macOS/Linux does not rely on shell globbing.
Those component regressions do not admit those platforms for full R3 execution.

For the actual numerical child, use Linux x64 / Python 3.12.14 and set
`NOMUE_TEST_PYTHON` to its absolute executable path before the test command above.
Then run `python3 development/r3-holm/numerics/test_worker.py` with that interpreter.
The dedicated CI job uses Node 24.19.0 / Python 3.12.14. Without the explicit
interpreter the one actual-child test is skipped, not treated as passing evidence.

`evaluateInner` and `evaluateInnerFiles` are development-only inner compositions.
They produce either a scoped candidate.5 report or a verifier-selected refusal,
never both. A runs only on six genuine passes. Its exact numerator and displayed
bits are compared separately; malformed child output becomes an invocation
refusal. Final output is checked against its schema, dependency graph and private
evaluation evidence, then serialized and checked again. The API never forwards
Record bytes. The new development-only `controlledCall` joins this inner result to a direct
supervisor lifecycle and original-byte forwarding. The released CLI is unchanged;
this checkpoint does not qualify a host or complete D1.

Tests include 14 hand-specified raw input/projection pairs, independent expected
hashes from those literal targets, strict-parser rejection, bounds, early/late
checkpoint interruption, 192 graph combinations checked against a separate
boolean expression, and 15 invalid-output mutations. Expected byte targets are
not generated by either implementation component. No published numerical oracle
or independent researcher review is claimed for these author tests.

`tests/boundary.ts` names every file in this directory in its existing
repository inventory; it does not use a wildcard or edit historical extraction
evidence. `scripts/package-smoke.mjs` additionally rejects any `development/`
entry in the actual npm tarball. See [current handoff](OUTER-CALL-HANDOFF.md) for coverage, self-review,
remaining work and the bounded independent implementation-review request.

Prepared with OpenAI Codex assistance in the continuing author/coordinator
context under the owner's R3 work direction. Public inputs only; no private product
source or production orchestration is included. Self-review is not independent
clearance and no human expert review is claimed.

## Controlled-call reproduction

```sh
python -B development/r3-holm/outer-supervisor.test.py
# Only on an explicitly delegated Linux x64 / Node 24.19.0 / Python 3.12.14 host:
python -I development/r3-holm/outer-host.py --delegation "$NOMUE_DELEGATION" --output /tmp/r3-host-evidence
```

The test runner never enables root controllers. A read-only or unavailable cgroup
is NOT_RUN for enforcement, not a passing mock. The dedicated CI lane retains
actual inputs, expectations, outputs and receipts. `projectTrustedReceipt` is a
trusted-transport test helper, not authentication or a receipt-import API. Use
`controlledCall` for a new supervised invocation. Its evidence callback supplies
no input to verification. Raw memory of the supervisor/caller is outside the leaf
limit; supervisor loss still requires external delegation cleanup.

File paths deliberately follow symbolic links to regular targets. Expected-only
path failures, including directories/loops/overlong names, produce C error;
resource and unexpected host failures still refuse the invocation. Candidate.5
uses `p_generation: not_asserted`; p generation remains outside the checked scope.
The versioned vocabulary change needs D3 schema/public-surface disposition.

The next bounded expansion and review request is [EXPANSION-HANDOFF.md](EXPANSION-HANDOFF.md).
It distinguishes ordinary controlled-call variants from trusted fault-entry runs.
