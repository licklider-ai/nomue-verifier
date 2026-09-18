# D1 local evaluation checkpoint

Historical checkpoint at `77bb4eb`: independent review returned
GO_FOR_D1_CONTINUATION, 0 BLOCKER, 0 MAJOR, 1 MINOR. The current checkpoint,
order repair and review request are in [INNER-CALL-HANDOFF.md](INNER-CALL-HANDOFF.md).
The scope and evidence below describe that fixed historical target.

Date: 2026-09-18 UTC. Component continuation only; D1 remains open. Resolve the
delivery PR head, parent and tree before review. The delivery PR and Protocol
handoff pin this checkpoint; this file does not attempt a self-referential head.

## Prior independent review and MINOR disposition

The first checkpoint was independently reviewed at Verifier `a82997073b17277f85d524f61efb7bc9249192a5`,
tree `0695e9b67995710cd365fec944c0443c17b65107`. The reviewer returned
GO_FOR_D1_CONTINUATION, 0 BLOCKER, 0 MAJOR, 2 MINOR, not full D1 or adoption GO.
The original is [Protocol review commit 7b057d5](https://github.com/licklider-ai/nomue-protocol/blob/7b057d5/review-inputs/r3-holm-d1-component-20260918/REVIEW-RESULT.md),
blob `3cb3514573d15427c1d4b95a90c3a8d8aab2966c`, SHA-256
`86dcb30d32c7d16519d549bc23471693e29d6649ed6904282695e1a57e592d36`.
Protocol intake preserves it byte-for-byte. That reviewed head's hosted CI run
35309941826 completed successfully; this does not qualify an R3 execution host.

| Finding | Author repair                                                                                                                                                   | Closure boundary                                                                                                                        |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| m-1     | CI adds strict TypeScript checking beside component tests on all Node 20/22 OS matrix entries; README uses the same explicit filenames                          | Local strict command passes; hosted execution is separately recorded against the new head                                               |
| m-2     | All explicit graph invariant errors use `GraphInvariantError` with `kind=internal_error`; README requires every graph exception to become an invocation refusal | Both exported graph operations have typed-error assertions; the eventual full-call refusal adapter and its mapping test remain required |

These are author dispositions, not an independent close-only confirmation.

## Scope and preservation

`inspectLocalRecord` accepts raw Record bytes and an independently supplied
expected-text acquisition function. It performs the actual S/K/D/H/I/C checks;
the output is an internal evaluation preparation with inspected-input identity
and raw-projection digest. It accepts no trusted-pass flags from submitted input.
The private parsed Record is frozen before caller acquisition and no original or
projected buffer is returned. No function here launches a worker, supplies A,
produces a public report/refusal, forwards bytes or activates a dispatcher.
An all-six-pass preparation cannot pass `assembleResults` until an actual A
evaluation is supplied by a later trusted implementation. There is no invented
not_run reason for unfinished engineering.

Eight fixtures are exact byte copies from public Protocol commit
`b52389fd3efc6b8968613f59f147a578d5bbb55d`; paths, blobs and SHA-256 hashes are in
`PROVENANCE.json`. Tests check all copied hashes. They retain candidate.4 schema
identities solely as development input fixtures; candidate.4 reports and runtime
semantics are not reinterpreted. A successor wire identity remains to be designed
and tested together with its output schema before full-call use.

`d0-relations.ts` extracts the relation portion of
`governance/drafts/release-3-preparation/holm-declaration-binding-experiment-20260911/d0.mjs`
at that same Protocol commit. The relation algorithm and sorted reason sets are
preserved. Parser, JCS, schema checking and the old command-line harness are
removed from that module; the new caller performs strict parsing, closed Record
schema and bounds first. TypeScript annotations and relocated catalog loading
are the remaining adaptations. Generic legacy declaration types are confined to
schema-admitted code; they are not a claim of static structural proof.

The original `envelope.mjs` legacy declaration mapping is performed on a clone.
The original `bridge.mjs` admission predicates are split into H and resource
guards: bounded input/output encodings, origin uniqueness, selected IDs and
family/operation bindings, member ordering and result ownership. The bridge's
self-binding comparison is omitted because that was an internally constructed
carrier equality, not independent C. C instead compares separately supplied
Record/revision identities, declaration and inputs after strict/schema validation.
No call to the old equality-gated verifier, or generated expected-context default,
is used. Safe expected acquisition/parse/schema errors become C error; unknown
callback failures and resource exhaustion escape without an output preparation.

Candidate.4's raw/parsed limits are retained. Record and expected limits share
`stored-bytes.ts`; only the expected byte cap is added there. Existing Record
behavior is unchanged except that the parsed-bound helper is reusable with an
expected-input reason prefix. Legacy transformed-document byte/depth/node guards
and D0 array caps remain explicit before relational work. Checkpoints surround
bounded phases, but no-op test callbacks are not deadline or cgroup evidence.

## Evidence and acceptance accounting

The three component suites contain 55 top-level tests: the original 36 and 19 new
tests. The new tests include all 50 relation-stage vectors from the original
70-case D0 set; the other 20 historical parser/schema cases are not reclassified
as relation cases. Source vectors are reused regression evidence, not independent
review of this port. There are no new numerical expected-value claims.

| R3D cases               | New prerequisite evidence                                                                                                   | Still open                                                                                                          |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 01-06                   | Real S/D/H/I/C evaluations; D failure with C pass; C or I failure does not suppress D/H; fixed independent reference digest | Arithmetic, public sections, full-call result validation                                                            |
| 07-10                   | S fail with faithful references and no context acquisition; exact routing/reference rejection                               | Invocation refusal shape and precedence through final output                                                        |
| 11-15                   | Existing raw tests plus actual Record K-fail checks; I absent while D/H/C run                                               | Public report, preserved-byte lifecycle and no-forward evidence                                                     |
| 16-20, 40               | Independently acquired missing/unreadable/malformed/schema-invalid context; Record/revision/declaration/input mismatch      | Real bounded file acquisition and public context-error representation                                               |
| 21-23                   | Actual H p/output domain, selected binding/order/ownership checks                                                           | Numerical kernel, exact/display comparison and full-call oracle                                                     |
| 24-25, 37               | Resource limits supersede invalid schema/context; injected late callback failure returns no preparation                     | Shared budget owner, real exhaustion and supervisor refusal                                                         |
| 28-31, 38-39, 42        | Actual K/D/C crossed failures assembled with transitive blocker reasons; six passes cannot invent A                         | Versioned wire schema, reason mapping and inverse validation                                                        |
| 26-27, 32-36, 41, 43-44 | No additional full-call evidence; earlier foundation vectors retain their scope                                             | Host/lifecycle, legacy invocation, output/refusal protocol, original-byte forwarding and integrated fault injection |

**Every one of the 44 full-call cases remains open.** Local composition and
dependency rows are not a public invocation. No release or host is admitted.

Author validation: component suites, strict typecheck, existing `npm test`,
actual `npm run test:package`, and source-fixture byte/hash comparison on Linux
x64 / Node 24.19.0 using the existing lockfile. See delivery PR for final run
results and hosted CI status. NOT_RUN: full candidate.4 suites, Python numerical
kernel, actual-host/cgroup enforcement, full 44-case invocation matrix, primary
source re-review and external reviewer custody recreation. No source pin,
package version, public schema/registry, numerical source or released CLI changes.

## Author risk review and next independent checkpoint

The largest risk is changing D0/Holm admission while splitting the old linear
engine. Fifty unchanged relation vectors guard the relation port; hand-mutated
Record fixtures exercise real domain and identity failures. Another risk is
turning arbitrary callback failures into C error: only explicitly classified
expected access errors and strict input errors are mapped, and unexpected or
budget failures escape. Input mutation from an acquisition callback cannot rewrite
the private inspected bytes. Immutable fixtures are excluded from formatting;
their source hashes and the actual npm tarball boundary are tested.

Reviewer request: resolve exact new head/parent/tree and diff from `a829970`.
Check the original review's two MINOR repairs, eight source asset hashes, complete
D0 relation extraction and all bridge admission predicates. Try to make local
conformance depend on expected-context or digest agreement; try to pass p=-0,
nonfinite/out-of-domain input, mismatched ownership, or reordered members. Try to
make a resource/internal failure become C error or leak a partial preparation.
Assess the internal component boundary and the table's absence of full-call claims.
Run the README commands and record environment/NOT_RUN. Reuse unchanged first
component review only with disclosed continuity and a precise drift assessment.

Return GO_FOR_D1_CONTINUATION, REPAIR_REQUIRED or BLOCKED for this component
checkpoint only, with locations, minimal repair and closure checks. Preserve the
record in Protocol at
`review-inputs/r3-holm-d1-local-checks-20260918/REVIEW-RESULT.md` if the Verifier
repository is unavailable for review-record delivery. Do not infer D1 completion,
integration, adoption, RFC disposition or publication permission.

Next: define versioned unissued report/refusal and reference/reason ownership,
connect the unchanged numerical worker with independently retained evidence,
then complete bounded acquisition, shared budget/supervisor, inverse validation,
all 44 full-call cases and host evidence. D2 dispatch/conformance and D3 overlay
remain later checkpoints. Prepared with OpenAI Codex assistance in the continuing
author/coordinator context, not independent or human-expert review. Public sources
only; no private product material. No merge, publication or dispatch activation.
