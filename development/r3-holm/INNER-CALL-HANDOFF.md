# D1 successor output and numerical inner-call checkpoint

Date: 2026-09-18 UTC. Unissued engineering checkpoint, not D1 completion,
integration, adoption, publication or execution-host qualification. Resolve the
delivery PR's exact head, parent, tree and delta before review. All files remain
outside the npm package, released CLI and supported dispatcher.

## Review receipt and order repair

The prior local-check checkpoint `77bb4ebaac5eca37390b8b23aede90f3d25702c0`, tree
`b16cb336d83454adb0d0360de3ee8308c7e53f26`, received independent
GO_FOR_D1_CONTINUATION: 0 BLOCKER, 0 MAJOR, 1 MINOR. The previous two MINOR findings
were independently closed. The current receipt is preserved in Protocol from
reviewer commit `9d69da5`, at
`review-inputs/r3-holm-d1-local-checks-20260918/REVIEW-RESULT.md`, blob
`11039218c1167e4e8632f45fa68f908eee794407`, SHA-256
`453c40ddf25a5684ff525a9450dd00135faca9fc236fa570cdd892cc8d5bee29`.
That receipt covers the parent, not this new implementation.

m-1 author repair: split strict parse/bounds from canonicalization/projection.
The local caller now checks exact bundle and both supplied reference identities
between those phases. Unsupported bundle plus nonfinite data gives
unsupported_bundle; missing bundle plus nonfinite data gives routing_error.
Valid routing with invalid references refuses before canonicalization. With
valid routing/references, unavailable canonicalization still always refuses,
including schema-invalid data. Raw strict eligibility and parsed bounds retain
priority over routing. Tests fix each crossed outcome. Record and revision
identities now compile their own schema fragments. No DESIGN change is needed.

## Concrete implementation and output contract

- `contracts/record.schema.json` and `expected.schema.json` derive from the fixed
  candidate.4 input schemas with only candidate.5 identity changes. Original
  fixtures remain byte-identical. The historical component helper defaults to
  candidate.4; the new inner call explicitly selects candidate.5 and rejects old
  bundles. It never guesses compatibility or changes the released dispatcher.
- `contracts/output.schema.json` defines mutually exclusive report/refusal
  shapes under `unissued-holm-output/0.3.0-candidate.5`. Reports contain four
  conformance rows S/K/D/H and three verification rows I/C/A, each with a versioned
  check identity, scope, execution state and owned reasons. H/A scope identifies
  the selected analysis/family/result when S passes; otherwise selection is
  explicitly unavailable. Error/not_run rows carry no outcome. There is no
  overall verdict. Eight guarantee exclusions remain not_asserted and input
  evidence remains not_observed.
- References use valid supplied Record/revision IDs and the independently
  calculated stored-projection digest. Their explicit meaning is inspected bytes,
  not authenticated identity. K failure never permits I or byte forwarding.
- `contracts/reason-policy.json` owns the finite local S/K/D/H/I/C/A reason sets.
  Failed/error evaluated reasons are checked against their stage owner; not_run
  rows inherit actual reasons and exact direct blocking identities transitively.
  Refusals have no bundle or Record reference. Each refusal kind has one fixed
  invocation-level candidate reason, selected by the verifier, not the input.
  These are unissued labels; permanent registry/schema/check allocation, detailed
  public diagnostic policy and RFC impact disposition remain Protocol D3 work.
- `output.ts` rebuilds rows from actual private evaluations, validates the output
  schema and graph, then compares the whole report against private evaluation
  evidence. A structurally valid fabricated S pass cannot pass that comparison.
  Serialization is bounded and the decoded output is validated again.
- `inner-call.ts` composes actual local checks with A. Only a genuine six-pass
  inspection has a private arithmetic request; a copied/forged preparation does
  not. Exact adjusted numerators and display bits are compared independently.
  Invalid worker output, graph invariant violations and unexpected exceptions
  become whole-invocation internal_error refusals, never error rows or reports.
  Trusted test hooks are outside the Record and output protocols.

## Numerical source and independent expected values

`numerics/candidate.py`, `worker.py` and `oracle.py` are byte-identical to their
declaration-binding sources in Protocol
`b52389fd3efc6b8968613f59f147a578d5bbb55d`. Paths, blobs and SHA-256 hashes are in
`numerics/PROVENANCE.json`; `INPUTS.json` is a new minimal loader manifest matching
the unchanged worker's candidate hash lookup. The worker executes those checked
candidate bytes with isolated Python and its existing 256 MiB address-space cap.
No numerical method, rounding, tolerance, supported family or p-generation claim
changes. Existing numerical/source reviews retain only their original scope;
source relocation and these author tests create no new independent clearance.

`test_worker.py` checks the copied source hashes, then compares 86 actual isolated
worker runs against the retained independent closed-testing Fraction oracle.
Cases include zeros, ones, subnormals, exact display midpoints and seeded
three-/six-member inputs. The oracle imports no candidate. These are migration
regressions, not a rerun of every historical numerical suite. TypeScript's fixed
result expectations come from the retained original example, not the new worker.
An exact numerator changed by one lattice unit with unchanged displayed bits is
rejected by A.

## Execution controls and remaining outer boundary

`execution.ts` adds one monotonic 5,000 ms / sampled 512 MiB Node heap budget
across file acquisition, local checks, child execution and output validation.
Only regular files are read; reads retain at most cap+1 bytes and detect growth.
Expected files are not opened when S fails. The Python child receives bounded
generated input under `-I`, a fixed environment and no shell; stdout/stderr are
capped. An absolute trusted interpreter must report Python 3.12.14 on Linux x64.
Deadline/cancellation kills the direct child, and the promise waits for stream
closure/process completion before returning. No OOM cause is inferred from an
unexplained child exit. Unknown errors remain internal refusals.

This is **inner execution control only**. It does not replace candidate.4's outer
cgroup supervisor or admit a host. Whole-process-tree memory/tasks/CPU,
startup deadlines, descendant cleanup, supervisor finalization and authenticated
completion still need connection and real-host evidence. The new API never
returns forwarded Record bytes, even with seven passes. Original-byte forwarding
belongs after that final lifecycle join. No all-pass inner report can stand in for
the missing outer receipt. Broader Linux/Windows/macOS goals remain unchanged;
matrix tests are regression coverage, not support declarations.

## Evidence, self-review and acceptance accounting

Local commands and raw test output are retained under `evidence/`; environment is
Linux x64 / Node 24.19.0 / Python 3.12.14 with the existing lockfile. The combined
TypeScript suites have 66 top-level tests, including one explicit actual-child
test; that test is skipped unless an absolute NOMUE_TEST_PYTHON is supplied.
The dedicated CI job supplies the interpreter. Strict typechecking uses the same
project file in local and all OS matrix jobs. Packaging retains an exact file
inventory and excludes every development file from the actual npm tarball.

Author adversarial review addressed three risks: budget sampling after spawning
could leak a child if it throws, so the remaining-time check precedes spawn;
arbitrary callback SyntaxError must not masquerade as malformed Record JSON, so
only the Record ingress phase translates parse failures; fabricated report rows
must not validate merely by matching their own graph, so validation compares
against private evaluations after serialization. Source schemas and numerical
copies were compared before testing; copied sources are not formatter targets.

| R3D cases            | Evidence in this checkpoint                                                                                                                             | Remaining completion evidence                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 01-06, 21-23         | A on actual six-pass input; real child; fixed arithmetic and 86 independent oracle comparisons; crossed D/I/C failures; separate exact/display mismatch | Full outer lifecycle and complete boundary matrix                                                                              |
| 07-20, 24, 37-40, 42 | Candidate.5 report/refusal, strict-before-routing order, S no-read, K/I gating, reference/context failures, bounded files and propagated reasons        | Complete parameterized below/equal/above cases and supervisor priority                                                         |
| 25, 28-31, 36        | Late budget refusal; schema/graph/private-evidence validation; wire mutations; worker malformed output                                                  | Outer-corrupted output transport and trusted supervisor completion                                                             |
| 26-27                | Actual direct-child deadline/cancellation, process-close wait; sampled heap and Python address-space limits                                             | Cgroup enforcement, whole-tree cleanup, unsupported full-host and cleanup-failure evidence                                     |
| 32, 34               | Exact candidate.5 input/output dispatch; old candidate refusal; pre-routing invocation-selected refusal                                                 | Final multi-bundle dispatcher and integrated legacy calls                                                                      |
| 33, 35, 41, 43-44    | Existing component evidence remains scoped; no new full-path completion claim                                                                           | Release 1 dispatcher regressions, independent context acquisition contract, original-byte forwarding and final fault injection |

No row is marked full-call complete by this inner checkpoint. D1 and all 44
full-call acceptance obligations remain open until the outer join and required
evidence are assessed. NOT_RUN: real cgroup/whole-host suites, full candidate.4
suite, final dispatcher/conformance suite, primary-source re-review and external
custody recreation. Actual commands/results are author evidence, not review GO.

## Independent review request and next unit

Resolve the new Verifier head, parent, tree, changed files and fixed Protocol
handoff. Review the m-1 order repair against DESIGN and candidate.4, and compare
the new input schemas with their exact originals. Check numerical byte identity
and oracle independence. Try to launch A with a failed/error prerequisite, hide
an exact mismatch behind display equality, pass malformed worker output, mutate
scopes/sections/blockers or fabricate a graph-consistent S pass. Try to make
unexpected, late-budget, cancellation or child-close failures leak a report.
Inspect the real bounded file reader and the absence of forwarding. Verify that
the evidence table does not claim full-call, legacy or host completion.

Run README commands, including the actual Python lane where available. Disclose
author/repair involvement, continuity from prior reviews, model/environment and
NOT_RUN. Return GO_FOR_D1_CONTINUATION, REPAIR_REQUIRED or BLOCKED for this
checkpoint only, with exact locations, minimal repairs and closure checks.
Preserve the record in Protocol at
`review-inputs/r3-holm-d1-inner-call-20260918/REVIEW-RESULT.md` if Verifier review
delivery is unavailable. No adoption, merge, publication or RFC action is requested.

Next dependent unit: connect the outer supervisor and trusted completion to the
versioned output, prove original-byte forwarding and all 44 expanded cases, then
perform D2 dispatcher/conformance and D3 authoritative integration. Prepared with
OpenAI Codex assistance in the continuing author/coordinator context; public
sources only. Self-review is not independent or human-expert review.

## Subsequent checkpoint

This historical handoff received independent GO_FOR_D1_CONTINUATION with one
expected-file access MINOR. See [controlled-call handoff](OUTER-CALL-HANDOFF.md)
for original receipt provenance, repair, new lifecycle implementation and current
review scope. The earlier verdict does not clear the new runtime.
