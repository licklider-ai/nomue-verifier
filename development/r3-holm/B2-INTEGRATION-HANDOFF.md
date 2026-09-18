# B-2 numerical review intake and successor wiring

Unissued checkpoint, 2026-09-18 UTC. Implementation parent is `5ee62cd`;
last independently reviewed controlled-call head is `3c51172`. The intervening
expansion handoff remains an open review input, not an independently cleared
baseline. D1, host qualification, D2/D3, adoption and publication remain open.

## Source and disposition

Protocol reviewer branch head `7ac803a1b9fa71a5a0064a0e81d02b9321cf86d9` contains
the B-2 GO review, its explicit SHOULD-FIX-2 withdrawal, independent checks/results
and a separate comparison-guard repair. The nine original files are preserved in
Protocol. The supplied Holm PDF SHA-256 is
`43a5a10279f8bf1752a3e8d4a8407f9717579f8f903be4bcd62d969e82d573af`;
the PDF itself is not redistributed.

B-2 establishes the reviewed adjusted-value derivation on `0 < alpha < 1`, exact
binary64 decoding, nearest/even projection, ties, identity and evidence comparison.
Adjusted p values are a downstream derivation, not a quotation from Holm (1979).
No alpha argument, rejection output, significance boolean or unconditional FWER
claim is added. Supplied p generation and source authenticity remain not_asserted.
The source review does not establish controlled execution or all of R3's Research
Gate. The independent reviewer used Python 3.11.15 and reported a Claude session;
its model/independence limitations remain in the original record. The reviewer
also authored the repair, so that repair is not independently reviewed merely
because it sits beside the review.

SHOULD-FIX-2 was withdrawn after the reviewer traced the independent expected-file
comparison before legacyTexts. No missing-context defect is reintroduced into the
ledger. OPTIONAL-1 retains original refusal precedence. OPTIONAL-2 is clarified:
Holm refuses negative zero; the R4 source report's mapping of both zero encodings
to integer zero is R4-specific. No IEEE source report is rewritten.

## Implementation delta

`numerics/candidate.py` is byte-identical to the separate repaired source, SHA-256
`a1b0bf801096fa35ce7ac159193ecfae7f66373cb51b69f6caf9728cc935a694`.
The runtime sort is replaced by stable bottom-up merge sort. Its maximum comparison
count depends only on family size: 9217 at 1024, 713 at the worker's maximum 120.
The check remains an internal invariant, not a runtime-dependent admission rule.

The source of transform is byte-identical; ASTs of require, decode, project,
transform, identical, evidence_view and check_evidence are unchanged. Comparison
counters remain outside evidence identity. Worker and independent oracle bytes,
schemas, reasons, private channel, pinned interpreter, non-claims, released CLI
and SOURCE-PIN are unchanged. The worker's source pin and explicit runtime inventory
are updated to the repaired module. Each provenance asset now names its own
source commit; the closure has more than one historical source commit.

Preserved B-2 scripts/results and the predecessor are under `numerics/b2-sources`;
[B2-PROVENANCE.json](numerics/B2-PROVENANCE.json) fixes every imported byte source.
`replay_b2.py` constructs an isolated temporary Protocol-shaped tree, reruns the
original repair checks, and applies the unchanged independent C1-C9 functions to
the exact wired module. It compares all nine result groups with the retained
independent expectations, including expected domain refusals and alpha=1 divergence.
No original result file is overwritten. C10's interpreter-sort search is replaced
by a separate recursive bound calculation for every size 1..1024 and exhaustive
permutations for sizes 1..8. This rerun is author evidence, not a new independent
investigation.

The actual worker now has boundary tests for counts 2, 3, 119, 120 and 121. For
identical least subnormals the exact numerator/display are the admitted count;
2 and 121 refuse at the private worker boundary. The worker's 119-member carrier
is only a private-channel test: public all-pairs admission still requires a
triangular count matching its group declaration.

R3D-23-maximum-family supplies a complete 16-group D0 Record with 120 all-pairs
members and tied least-subnormal p inputs. Every adjusted numerator is the literal
integer 120 (hex 78), with identical exact display encoding. It is an ordinary
controlled call, requiring seven passes and original-byte forwarding. This extends
R3D-23 evidence, not every row's boundary coverage.

## Validation and open work

Reproduce with the pinned dependencies and Python 3.12.14:

```sh
python -B development/r3-holm/numerics/replay_b2.py
python -B development/r3-holm/numerics/test_worker.py
python -B development/r3-holm/outer-supervisor.test.py
```

Use the README's six TypeScript suites and strict typecheck, npm test and package
check. The dedicated host workflow now runs 75 checks: 48 ordinary variants,
14 controlled fault entries and 13 lifecycle/enforcement controls. Exact-head CI
and immutable raw archive are recorded in Protocol after execution; this file's
case counts alone do not establish host success. Local cgroup enforcement remains
NOT_RUN on the read-only mount.

Author replay: C1 9600 level cases, C3 1200 closed-testing families, C4 20012 decode
checks, C5 102940 projection checks, C7 2000 tie/permutation families, plus C2/C6/C8/C9
boundary/refusal checks; all match the original expectations. Repair replay has
13088 checks and no divergences/refusals/bound violations. The additional bound
check covers 1024 sizes and 46233 small permutations. Saved author evidence is in
`evidence/B2-VALIDATION.json`, `b2-replay.json` and `b2-tests.tap`.

The [44-locator map](ACCEPTANCE-COVERAGE.json) remains partial. Outstanding work
includes complete input-limit/reason/rounding matrices, independent raw-projection
oracles, injected helper failures, actual failed-cleanup/supervisor-loss evidence,
and D2/D3. The previous expansion's independent review is still pending.

## Independent implementation review request

Review the fixed delivery head/tree against `3c51172`, using both
[EXPANSION-HANDOFF.md](EXPANSION-HANDOFF.md) and this delta. Reuse the unchanged
B-2 mathematics only within its fixed evidence scope. Check source custody and
unchanged function claims, stable-sort bound and actual worker wiring, replay
isolation, no changed refusal priority, maximum-family byte forwarding, and the
continued separation of probe receipts from normal calls. Do not count this author
rerun as independent clearance of the repair or host lifecycle.

Return GO_FOR_D1_CONTINUATION, REPAIR_REQUIRED or BLOCKED with findings/closure
conditions, exact target, continuity/model disclosure and NOT_RUN. Preserve the
original at Protocol `review-inputs/r3-holm-d1-b2-integration-20260918/REVIEW-RESULT.md`.
No publication, normative integration, gate reset, merge or RFC action is requested.

Prepared with OpenAI Codex assistance in the continuing author/coordinator context;
only public sources, licensed-source hash metadata and synthetic fixtures are used.
