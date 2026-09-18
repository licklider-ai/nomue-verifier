# D1 stored-byte oracle and retained-result checkpoint

Date: 2026-09-18 UTC. Parent and last independently reviewed Verifier head:
`eda3ba9354429baf936212bc68572af94a5e20f6`. D1 continuation only; D1 completion,
host qualification, D2/D3, whole Research Gate closure and adoption remain open.

## Independent receipt and MINOR repair

Protocol reviewer commit `4bc89252e0cd248462c0799ccac369cc3c61f795` records
GO_FOR_D1_CONTINUATION for `3c51172..eda3ba9` and Protocol `3233522`, with zero
BLOCKER/MAJOR and one MINOR. Original blob `56f93e8032f5b11d2b85a63066940d88e50de173`,
SHA-256 `7e59e123868af38c6af5e8b67f477d64b764cefce3316d560ee0e47a12b88a66`.
Prior controlled-call m-2/m-3 are independently closed. The reviewer separately
confirmed the sort repair and wiring, and disclosed continuing D0/D1 review context,
shared CPython/vendor trust bases, and NOT_RUN for its own actual cgroup and
Python 3.12.14 execution. This is language-model review, not human/steward review.

m-1 is author-repaired here: the repair packet's RESULTS.json is copied unchanged
as `numerics/b2-sources/repair-results.json` and pinned in B2-PROVENANCE.json.
The replay compares every result group and field, excluding only the top-level
environment field. Missing/additional groups and changed counts/maxima/refusals
fail; bool does not compare equal to an integer count. The eight mutation cases
exercise those errors. A separate end-to-end negative test alters a saved count
and updates its temporary hash pin consistently: the replay still fails at the
retained-result comparison, proving that a hash check alone is not the repair.
Original review/repair source/results and old evidence files are unchanged.

## New independent byte expectations

`oracles/generate.py` is a test-only author oracle, importing only Python standard
libraries. It imports no Verifier parser, JCS, projection or digest helper.
It constructs member and whitespace fragments first, then constructs P(B) by
omitting the already-known member/delimiter fragments according to D0. It never
uses candidate output to select an expected projection. Fixed SHA-256 values are
computed by hashlib over the literal domain plus those expected bytes, before any
candidate call. Python hashlib and Node crypto may share OpenSSL; this is an
independent byte-construction/call-path check, not independent cryptographic
implementation validation or independent investigator review.

The saved JSON contains 324 component vectors across one through six members,
absent/first/middle/last/sole integrity, escaped keys, nested lookalikes, escaped
strings, Unicode/multibyte text, numeric spellings and whitespace. Ten full Record
vectors cover canonical success, first/last placement, mixed whitespace, escaped
integrity, trailing newline, absent integrity, nested Unicode/lookalikes,
noncanonical numeric spelling and a false declared digest. Full Record fragments
come from the pinned historical fixture with candidate.5 identities; CPython's
standard decoder identifies its source tokens. Nested spelling is retained.
The absent-integrity input is canonical bytes but schema-invalid: the component
observes canonical storage while the full call correctly blocks K on S failure.

`python -B development/r3-holm/oracles/generate.py` checks byte-identical
regeneration and never overwrites saved targets. `--write` is an explicit authoring
operation, not a test/CI step. A JSON-value comparison is only a generator sanity
check; expected P(B) is not reserialized from that parsed value.

`oracles.test.ts` checks actual projected bytes, fixed digest, copy separation
and nonzero typed-array offsets. Its inner-call tests check all seven states and
the report's stored-projection reference. Actual numerical execution is used on
the all-pass path only with the pinned Python explicitly provided; other paths
cannot invoke A. The same ten literal inputs, expected states and hashes join the
ordinary controlled-host suite. The host runner now asserts the report reference
digest, in addition to outcome and original-byte forwarding.

## Parameterized limits and evidence scope

Eighteen component-bound cases cover below/equal/above raw Record bytes, nesting
depth, node count, container entries, UTF-16 string length and key length. Targets
are literal independent caps, checked against the declared LIMITS. Exact node
counts exclude object keys. These tests do not close narrower D0 payload limits,
expected-input limits, worker limits, shared budgets or whole-call resource rows.
No parameterized R3D locator is marked closed. The coverage map now explicitly
names existing lifecycle controls under R3D-26/27/36 without claiming failed
setup/cleanup or supervisor-loss coverage.

## Author checks and remaining work

- 121 TypeScript tests pass with no skips on Node 24.19.0 / Python 3.12.14.
- Retained B-2 replay matches C1-C9 and repair RESULTS except environment;
  13088 repair checks, 1024 size bounds and 46233 permutations remain unchanged.
- Three replay-regression tests pass, including eight comparison mutations and
  the coherently repinned negative replay.
- Oracle regeneration is byte-identical; strict TypeScript, npm/package tests
  are recorded in evidence/ORACLES-VALIDATION.json.
- The hosted plan is 85 checks: 58 ordinary calls, 14 trusted fault-entry runs,
  13 lifecycle controls. Exact-head execution and raw archive are fixed separately
  in Protocol after CI; the plan is not itself successful execution evidence.

Runtime source, numerical functions, worker, dispatcher, contracts, outer-runtime
inventory and Protocol SOURCE-PIN are unchanged from eda3ba9. Only tests, their
runners, source-result provenance, evidence and handoffs change. The new files
remain outside the npm tarball and are explicitly listed in tests/boundary.ts.
The local cgroup mount is read-only: local actual enforcement is NOT_RUN.

Next: remaining parameterized reason/context/numerical and tighter limit matrices;
full-call helper corruption for R3D-43/44; actual setup/cleanup failure and loss of
the supervisor with external-owner cleanup evidence. D2/D3 stay pending.

## Bounded review request

Review this delivery against eda3ba9. Check the exact original receipt and repair
RESULTS pins; prove that the replay rejects altered saved expectations; challenge
the fragment-based P(B) oracle and its preserved whitespace; check saved digest
references through actual calls; independently count each structural boundary;
and look for inflated whole-row or host claims. Review the new evidence on its
own head; reuse the unchanged numerical/runtime review only within its scope.

Return GO_FOR_D1_CONTINUATION, REPAIR_REQUIRED or BLOCKED, findings and closure
conditions, exact target, continuity/independence disclosures and NOT_RUN. Save
Protocol `review-inputs/r3-holm-d1-oracles-20260918/REVIEW-RESULT.md`. No normative
change, merge, publication, RFC, gate or SOURCE-PIN action is requested.

Prepared with OpenAI Codex assistance in the continuing author/coordinator context;
public source and synthetic data only. Author oracles/self-review are not a new
independent primary-source or implementation review.
