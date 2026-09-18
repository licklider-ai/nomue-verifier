# D1 successor controlled-call checkpoint

Date: 2026-09-18 UTC. Unissued development checkpoint. Resolve the delivery PR's
head, parent, tree and changed paths before review. Parent is reviewed inner-call
head `f4b07868db999b282126b3a1c5620ee01a5252a4`. No D1 completion, supported host,
integration, adoption, RFC action or publication is asserted.

## Receipt and repairs

The independent inner-call review returned GO_FOR_D1_CONTINUATION, zero BLOCKER,
zero MAJOR and one MINOR. It independently closed the prior routing-order MINOR.
Its original is preserved in Protocol from reviewer commit `bcb723b`, at
`review-inputs/r3-holm-d1-inner-call-20260918/REVIEW-RESULT.md`, blob
`dfc1d31a17ce46654f966862ecf7187625649341`, SHA-256
`13500839415e60825cfd499dbec3b5ba91daef1050ea2dee3cf8a4311917d4d0`.
The reviewer ran 65 tests with one environment-related actual-child skip,
86 worker vectors under Python 3.11.15, typechecking and package checks. This does
not establish the pinned Python 3.12.14 full-call tuple. The original disclosure
and NOT_RUN list are retained; no verdict is transferred to this new code.

m-1 author repair: expected-only regular-file violations and ENOENT, EACCES,
EPERM, ENOTDIR, EISDIR, ELOOP and ENAMETOOLONG now become C error
`expected_unreadable`, without an outcome. S/K/D/H/I remain evaluated. Record
access failure stays an invocation refusal; expected byte/structural limits and
unexpected host failures remain whole-call refusals. Tests cover a directory,
symlink loop, overlong path, retained rows, S-failure no-read and size refusal.
The directory test is the reviewer's exact close condition. Independent closure
is still requested for this repair.

Two nonblocking choices are explicit: file paths follow symlinks and require the
opened target to be a regular file; the path is caller input, never read from a
Record URI. Reads retain one bounded byte snapshot and forwarding never reopens
that path. Candidate.5's `p_generation: not_asserted` intentionally uses the common
non-claim vocabulary instead of candidate.4's `outside_scope`. P generation is
still outside the checked operation. D3 needs to record this versioned vocabulary
change with report-schema/public-surface impacts; no old schema is reinterpreted.

## Lifecycle implementation

`controlled-call.ts` launches a fresh fixed Python supervisor directly for each
call, with a random per-call nonce, fixed policy and sanitized environment. Its
API accepts absolute Record/expected paths, a trusted Python executable and an
explicit cgroup delegation. No saved receipt, supplied result, executable command,
probe selector or Record-controlled option can replace that launch. The optional
evidence sink receives a copy of the directly observed receipt only.

`outer-supervisor.py` is an adapted port of the fixed candidate.4 supervisor;
`OUTER-PROVENANCE.json` records its source blob/hash and adaptation. It retains:

- Linux x64 and Python 3.12.14, writable actual cgroup2 mount, explicit domain
  delegation, enabled cpu/memory/pids controllers and empty distribution nodes;
- supervisor sibling, new per-call leaf, limits written and read back, 512 MiB
  memory, zero swap, group OOM, 64 tasks and one CPU;
- bootstrap attachment before Node startup or any Record/expected I/O;
- 30-second outer deadline starting before preflight, bounded stdout/stderr,
  cancellation, memory/pids event deltas and fixed failure precedence;
- cgroup kill, direct-child kill, subreaper collection to ECHILD, empty cgroup,
  closed streams, leaf removal and temporary-file cleanup before completion;
- a separate three-second cleanup budget; no OOM attribution from an unknown exit.

`outer-runtime.json` pins the explicit source closure and package/lockfile bytes.
Run `pin-outer.py` only after reviewing actual source changes. Dependencies are
installed from the existing lockfile. Neither the inventory nor nonce is a
signature or defense against hostile same-UID code replacing trusted programs.
The source inventory does not claim hashes for every installed dependency byte.

The native `outer-entry.mjs` checks Node 24.19.0 before loading TypeScript. It uses
`prepareInnerFiles` to retain the original bounded snapshot and privately checked
output. Seven actual passes permit only a _proposed_ base64 snapshot. The original
inner APIs still return output alone. Child transport includes the per-call nonce
and a SHA-256 of its serialized payload to detect mismatch/corruption; this is
local completion framing, not a new authentication scheme or Protocol identifier.
A final inner budget check follows serialization and precedes writing. Failure
there emits a refusal proposal or no valid completion, never successful bytes.

After the supervisor has completed cleanup and closed its pipe, the caller checks
cause/category consistency, the fresh nonce, source-manifest hash, non-probe
provenance, exact controls, successful leader exit, all cleanup observations and
zero enforcement counters. The output is checked again against the schema,
stage ownership, graph, scope consistency and size cap. All-pass forwarding also
requires canonical original bytes, matching supplied identities, selected scope,
stored-projection digest and declared digest. The byte string is passed through;
there is no serialization or resealing of a Record.

`projectTrustedReceipt` is a structural projection helper exported for negative
unit tests. It does not authenticate arbitrary receipts or prove that supplied
rows were evaluated. Calling that helper directly is not a controlled invocation.
Only `controlledCall` connects a direct trusted process completion to output.
Truth of the evaluated rows comes from the pinned entry's private-evidence check;
structural validation is not represented as a second evaluation.

Supervisor SIGKILL or host loss may prevent cleanup or output. A 40-second caller
watchdog discards output and terminates the supervisor; it does not claim to have
recovered all descendants after supervisor loss. The external delegation owner
is still responsible for tearing down that subtree. No output means no success.
Supervisor allocations and final caller presentation are outside the call-leaf
512 MiB limit, as in the source candidate. Final snapshot validation has its own
sampled budget; this is not an aggregate process-memory certificate.

## Verification and actual-host evidence

Local author environment: Linux x64 / Node 24.19.0 / Python 3.12.14, pinned npm
lockfile. Retained local commands/hashes/results are in `evidence/OUTER-VALIDATION.json`
and `evidence/outer-tests.tap`. The combined TypeScript suites pass 75/75 with no
skips, including actual numeric child, native transport, unavailable-delegation
refusal, m-1 repair and output/receipt/byte mutations. Five Python tests check
strict transport, corruption/identity, failure priority, counter regression and
source hashes. The 26 predetermined case variants also pass through the inner
file adapter, explicitly without claiming full lifecycle execution.

The local cgroup mount is read-only. Actual enforcement is NOT_RUN locally, with
no filesystem mock substituted as passing evidence. The new dedicated CI job
runs `outer-host.py --provision-ci` on a disposable Linux host; it requires root
controllers to have already been delegated and does not enable root controllers.
It provisions and finally tears down only its own new subtree. A preflight failure
fails the job instead of skipping or claiming success. Exact-head job status and
artifact links belong in the PR; do not infer successful execution from this file.

The actual-host runner saves the 26 inputs and predetermined expectations before
executing any candidate, plus each supervisor receipt and result. Its thirteen
fault controls cover Node/worker memory, CPU throttling, task count, surviving
setsid descendant, stdout/stderr overflow, deadline, provisional output followed
by a hang, wrong nonce, corrupted completion, invalid JSON and cancellation.
Every negative control asserts no result and successful cleanup. CPU checks
require observed throttling; memory/tasks use the actual event deltas. These are
new successor executions, never renamed candidate.4 receipts.

Author self-review also checked the complete imported source closure, adding the
D0 fixture-contract mapping to the explicit pin inventory. Late serialization
budget failures preserve their typed refusal instead of becoming a generic child
exit. Final wire validation checks stage reason ownership and matching H/A scopes;
forwarded snapshots additionally bind the selected IDs and declared digest. Negative
tests exercise incomplete cleanup, observed counter increases and changed bytes.
These are author repairs, not an independent review of the supervisor adaptation.

## Acceptance accounting and remaining work

The host lane exercises one specified variant each of R3D-01 through 18,
20, 22, 24, 32, 34, 38, 39 and 40. This is 26 variants, not 26 fully closed rows.
For example R3D-09 still needs every invalid identifier variant, R3D-24 needs all
below/equal/above structural limits, and R3D-40 currently has the revision variant.

| Cases                            | Current evidence / remaining condition                                                                                                        |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 01-18, 20, 22, 24, 32, 34, 38-40 | Predetermined first-pass variants; exact-head real-host outcome is separate; wider parameter expansion remains                                |
| 19, 21, 23, 37, 42               | Existing local/numerical component evidence; expanded successor full-call variants remain                                                     |
| 25-27, 36                        | Local budget/receipt mutations and dedicated real-host fault lane; cleanup failure and external owner/supervisor-loss evidence remain         |
| 28-31                            | Structural/private-evidence graph tests; broader complete-path fault injection remains                                                        |
| 33, 41                           | Final dispatcher and legacy expected-argument compatibility remain D2 work                                                                    |
| 35                               | Original-byte retention across path overwrite and output mutation tests; external expected-context authenticity remains caller responsibility |
| 43-44                            | Existing raw-projection/helper evidence; full-path injected canonicalizer/projection failures remain                                          |

D1 is not complete. Next expand the missing variants and close the changed-scope
review; D2 then connects the shared dispatcher, versioned caller API, legacy
regressions and conformance manifest/runner. D3 still owns requirements, schemas,
reasons, authorities, public surfaces and generated views. SOURCE-PIN is unchanged.

## Independent review request

Confirm parent/head/tree, original receipt custody, changed paths and current CI
artifacts. Independently close m-1. Try to retain a report after expected resource
failure, late budget exhaustion, output corruption, wrong completion identity,
nonzero leader exit, observed enforcement, incomplete cleanup or supervisor loss.
Check cgroup attachment before startup, child/descendant reaping, bounded pipe
handling, fixed precedence and the absence of a saved-receipt invocation API.
Try forwarding changed bytes, a changed declared digest, wrong selected scope,
noncanonical bytes or a safe failure report. Inspect all fixture expectations and
separate pure projection tests from actual controlled-call evidence. Confirm that
the 26 variants and host faults do not overclaim the full 44-case expansion.

Run README commands and the explicitly delegated host suite where available.
Review is bounded to this implementation checkpoint. Return GO_FOR_D1_CONTINUATION,
REPAIR_REQUIRED or BLOCKED, with exact target, findings, minimal repairs, closure
checks, continuity/independence/model disclosure and NOT_RUN. Preserve the original
at Protocol `review-inputs/r3-holm-d1-controlled-call-20260918/REVIEW-RESULT.md`.
No merge, publication, adoption, identifier issuance or RFC-window action is requested.

Prepared with OpenAI Codex assistance in the continuing author/coordinator context,
using public source candidates and synthetic fixtures only. New runtime code is
maintained in Verifier; Protocol receives documentation/receipts only. Self-review
and author CI are not independent or human-expert clearance.
