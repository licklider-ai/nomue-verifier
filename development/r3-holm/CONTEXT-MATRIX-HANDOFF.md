# D1 context and Record cross-product checkpoint

Date: 2026-09-18 UTC. Base: `d36852f92550a45e14b94cdda38ee3c45eb92531`.
Test-only continuation. No D1 completion, D2/D3, Research Gate closure, host
qualification, adoption or released support is claimed.

## Scope and predetermined expectations

The earlier [oracle checkpoint](ORACLES-HANDOFF.md) still awaits independent
changed-scope review. This increment tests existing D0 rules without changing any
runtime file, numerical method, schema, reason policy, runtime inventory, source
pin, package dependency or released CLI.

`context-matrix.ts` crosses seven Record conditions with fourteen caller context
conditions, yielding 98 new ordinary-call inputs:

| Axis             | Conditions                                                                                                                                                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Record           | valid; schema failure; trailing-newline storage failure; D0 relation failure; digest mismatch; D0 plus digest failure; storage plus D0 failure                                                                            |
| Expected context | match; absent; invalid syntax; duplicate key; unpaired surrogate; BOM; negative zero; array; missing field; extra field; different Record ID; different revision ID; different unselected declaration; reordered analyses |

Fourteen additional callback tests cross unreadable input and wrong return type
with all seven Record conditions. These are not ordinary file-input host cases.
Together the suite covers every C-owned reason, not every other stage's reasons.

All seven execution/outcome rows, versioned IDs, ordered reasons and direct
blockers are specified before candidate execution. The closed-form row builder
imports no candidate dependency graph, evaluator, output builder or validator.
The chosen D0 perturbation references a missing group for one unit: its explicit
reasons are `d0_unit_group_mismatch`, then `d0_unit_group_ref`.

Expected context starts with the separately stored expected fixture. A matching
invalid-D0 pair is deliberately edited on both sides during test authoring; the
verifier may never construct expected context from its submitted Record. Mismatch
cases alter only expected input. Existing JCS/digest helpers construct test inputs,
not expected report rows: this is not a new independent byte/digest oracle.

## Execution and evidence boundaries

Each of the 98 cases runs through both callback and bounded file adapters. Tests
check exact sections/schema, context-read and numerical-launch counts, input
immutability and proposed forwarding. Only the all-pass control can propose the
original bytes. S failure suppresses acquisition; K/D/I failure does not suppress
C. Error/not_run rows have no outcome and retain exact reasons/blockers.

The cross-product's single all-pass control uses the historical arithmetic reply
as a trusted test stub with launch counting. A separate pinned-child control runs
without a stub. The controlled-host lane runs all 98 cases through the actual
supervisor/worker path and checks full rows plus original-byte forwarding.

```sh
node --import tsx --test development/r3-holm/context-matrix.test.ts
npx tsc --project development/r3-holm/tsconfig.json
npm test
npm run test:package
```

Set `NOMUE_TEST_PYTHON` to an absolute Python 3.12.14 executable for the actual
child; otherwise that one test is skipped. The numerical CI lane pins Node
24.19.0 / Python 3.12.14. Other platform component tests do not qualify R3 hosts.

The host plan expands from 58 to 156 ordinary calls, retaining 14 trusted fault
entries and 13 host controls: 183 checks. Counts are a plan, not successful-host
evidence; use the PR's exact-head CI/archive record. Local cgroup enforcement is
NOT_RUN because the mount is read-only.

## Author validation and adversarial self-review

Linux x64 / Node 24.19.0 / Python 3.12.14: all 235 TypeScript tests pass with no
skips (114 new tests, 121 retained). Strict TypeScript, npm tests including the
96 Welch precision rows, and real package smoke pass. Every runtime inventory
entry and the inventory file itself are unchanged from the base.

`context-sensitivity.mjs` copies the source into disposable temporary directories
and runs the new matrix after each deliberate source mutation. It requires a full
114-test run and a nonzero failure count, not just a crashing test process:

| Mutation                             | Detected failing tests |
| ------------------------------------ | ---------------------- |
| Accept a mismatching valid context   | 24                     |
| Truncate propagated blocking reasons | 78                     |
| Read context despite S failure       | 16                     |
| Drop C from blocker identities       | 106                    |

Reproduce with the same explicit `NOMUE_TEST_PYTHON` and
`node development/r3-holm/context-sensitivity.mjs`. Logs and RESULTS.json remain
in the printed temporary directory; the source worktree is never modified.
These checks establish inner-test sensitivity, not R3D-43/44 controlled-path
canonicalizer/projection/digest corruption or independent review.

## Bounded review request

Pin head/tree/base; inspect this delta and the earlier oracle delta separately.
Challenge (1) loss of independent Record results on C mismatch/error, (2) oracle
dependence on candidate output, (3) lost/reordered reasons and blockers, (4) reads
after S failure or A launch despite blockers, (5) error/not_run outcomes and
incorrect forwarding, and (6) host evidence identities versus mocked paths.

Return GO_FOR_D1_CONTINUATION, REPAIR_REQUIRED or BLOCKED with fixed identities,
findings, independence and NOT_RUN. The earlier retained-result/oracle review
remains pending. All 44 locators remain partial. Numerical/narrower-bound matrices,
full-call helper corruption, actual setup/cleanup failure, supervisor loss and
external-owner cleanup evidence remain open. D2/D3 stay pending.

Prepared with OpenAI Codex assistance in the continuing author/coordinator context.
Author tests and self-review are not independent investigator or human expert
clearance. Only public sources and synthetic fixtures are used.
