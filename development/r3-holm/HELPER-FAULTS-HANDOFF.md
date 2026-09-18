# D1 helper failure checkpoint

Date: 2026-09-18 UTC. Predecessor: `735e62046e84a90197e2aa44aba59f75141c7ba8`
(PR #22). This separate checkpoint requires independent implementation review
before merging its refusal-classification repair or relying on its new evidence.
It does not complete D1, qualify a host, close the Research Gate or authorize D2/D3.

## Defect and bounded repair

Protocol D0 at `1eb6b93`, DESIGN's faithful-report section and ACCEPTANCE R3D-43,
requires unavailable canonicalization, projection or digest computation to refuse
as canonicalization_failure, even when S or K would fail. Generic exceptions
from the projection and digest helpers instead escaped to internal_error.

Author reproduction at the predecessor: 14 inner-only cases, 8 passing and
6 failing assertions (projection/digest throw crossed with valid, S-fail and
K-fail Records). The stored result is [helper-before-results.json](evidence/helper-before-results.json).
The present suite uses the retained Python ORACLE-whitespace fixture for K failure
and adds a reserialization sensitivity control, so its 15 cases are not a claim
to replay that earlier 14-case inventory byte-for-byte.

`stored-bytes.ts` now maps unexpected projection failures and hash computation
failures to canonicalization_failure. Projection checkpoint exceptions retain
their original identity, including non-Error thrown values; typed StoredInputError
also retains its owner. Checkpoints before and after the digest remain outside
the new catch. Resource enforcement by the outer supervisor still takes precedence.
Every checkpoint reached by the small stored-byte fixture is tested for propagation. The existing canonicalizer catch and
projection-disagreement guard are unchanged.

Only this unissued runtime source changes. The explicit outer inventory refresh
changes its hash alone. No shared reference source, public CLI, numerical kernel,
reason/schema contract, package dependency, supported bundle or SOURCE-PIN changes.

## Fault method and evidence separation

`helper-faults.py` creates disposable copies from the checked-out source. It
changes only stored-bytes.ts by exact unique anchors and records the source and
inventory hashes, replacements, changed file and whether the copy was explicitly
repinned. All other runtime entries must match. The checkout source and inventory
are checked unchanged at the end. Copies share the installed pinned node_modules;
no private source or input is used. Their source and inventories are retained in
the artifact, then temporary executable copies are removed.

The unmodified verifier API has no fault selector. Inner tests use the separate
test adapter. Host tests use each copy's normal outer-run / controlledCall /
supervisor / entry path, with probe=null and the copy's inventory identity.
These receipts describe deliberately modified test copies, never the unchanged
candidate's normal evidence. Repinning a test copy is not a release or trust grant.

| Cases                                                      | Count | Expected result                                                                                                                                     |
| ---------------------------------------------------------- | ----: | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unmodified valid / S-fail / K-fail controls                |     3 | Honest reports; original-byte forward only for valid control                                                                                        |
| Canonicalizer / projection / digest throw × three controls |     9 | canonicalization_failure, no report/reference/forward                                                                                               |
| Corrupt projection on canonical Record                     |     1 | Projection disagreement refuses                                                                                                                     |
| Corrupt projection plus removed guard                      |     1 | Negative sensitivity control: report with I fail is rejected by the required-refusal assertion                                                      |
| Reserialized projection on noncanonical bytes              |     1 | Negative sensitivity control: K fail and I not_run prevent forwarding; independent fixed raw-digest expectation detects the wrong failure-reference |
| Unpinned projection corruption (host only)                 |     1 | Source-drift preflight refusal; helper is not reached                                                                                               |

The two negative controls intentionally execute wrong implementations and prove
the test assertions detect them. They do not prove arbitrary corrupted helpers
are safely detected by the runtime. In particular, K prevents I pass in the
reserialized control, but only the independent byte oracle exposes its incorrect
failure-reference. R3D-43/44 remain partial pending independent review and any
additional required combinations.

The host archive has 190 existing checks plus 16 separately identified copy checks
(206 planned), not 206 ordinary calls against one runtime inventory. Its nested
helper-faults/RESULTS.json has 16 cases; ordinary candidate calls remain 163.
The source-drift control is preflight only, not completed lifecycle evidence.
Other helper host calls require completed_valid receipts, successful cleanup,
removed cgroup/temp paths, and original-byte forwarding only for the baseline.

## Reproduction and author checks

```sh
NOMUE_TEST_PYTHON=/absolute/python3.12.14 node --import tsx --test development/r3-holm/*.test.ts
python3.12 -B development/r3-holm/helper-faults.py --output /absolute/scratch/helper-inner
npx tsc --project development/r3-holm/tsconfig.json
npm test
npm run test:package
```

Use Node 24.19.0 / Python 3.12.14 for real-worker tests. Author local run: 244
component tests, zero skips; 15/15 inner helper cases. Real local cgroup execution
is NOT_RUN (read-only mount). Exact-head hosted results, archive digest and timing
are recorded in the PR body after CI; the planned 206 count alone is not evidence.
The numerical lane uploads the inner artifact; the existing host lane retains
both normal candidate and separately labelled helper-copy evidence.

## Independent review request — required at this checkpoint

Pin this PR's head/tree/base and review only the successor delta against PR #22.
PR #22's prior review and author repair checks do not clear this runtime change.
Challenge:

1. Does failure classification implement D0 R3D-43 without hiding resource,
   cancellation or checkpoint exceptions?
2. Do mutations actually reach the intended helper, and are assertions against
   owned refusal semantics rather than generated candidate expectations?
3. Are test-copy source/inventory hashes distinct and reproducible, with no
   normal-call selector or shipping path for injected faults?
4. Do real supervisor receipts, cleanup and byte-forward assertions cover the
   correct copies rather than mocks or archived receipt submission?
5. Do both negative controls fail their intended assertions, including the
   independent raw-projection digest on noncanonical bytes?
6. Are before/after results, checkpoint propagation and all evidence limits
   stated without claiming whole-row closure or host qualification?

Return GO_FOR_D1_CONTINUATION, REPAIR_REQUIRED or BLOCKED, fixed identities,
findings, independence disclosure and NOT_RUN. Actual setup/cleanup failure,
supervisor loss, external-owner cleanup evidence, broader boundary matrices and
the earlier oracle delta review remain open. Keep D2/D3 pending.

Prepared by OpenAI Codex in the continuing author context. This reproduction,
repair and self-review are not independent or human expert clearance.
