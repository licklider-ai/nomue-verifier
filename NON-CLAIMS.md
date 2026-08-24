# Non-Claims — nomue Protocol Release 1 verifier

This verifier checks **scoped, machine-checkable properties** of a Record under the
included interpretation bundles. It does **not** verify scientific truth.

## What verification does not mean

- A passing outcome is **not** proof that the research is correct.
- A passing outcome is **not** scientific validity.
- A failing outcome on the example invalid Record shows a **declared result
  mismatch** only within the supported Welch recomputation check — not that the
  underlying science is "wrong" in a general sense.
- This verifier does **not** assert that exported figures, legends, Methods or Results
  text, Word/LaTeX manuscripts, or publisher-formatted artifacts remain bound to the
  verified Record after downstream editing or transformation.

## Guarantee boundary

The verifier report fixes `scientific_validity` (and related guarantee-boundary fields
where present) to `not_asserted`. That state means the verification procedure did not
evaluate scientific validity — not that validity was assessed and passed.

## Scope

Checks are limited to the exact bundles and public checks shipped in this verifier
repository. For nomue Protocol Release 1, the public support target is
`urn:nomue:bundle:itgc-guarantee:0.2.1-draft.1`. Unsupported claims, methods, and
profiles are outside scope. The Release 1 Protocol and this verifier package remain
experimental; Release 1 is a Public Draft, not a Stable 1.0 compatibility promise.
