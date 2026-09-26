# Numerical methods

This file lists how the verifier computes each numerical quantity it checks. The
meaning of each quantity, its check version and its tolerance are defined by the
nomue Protocol, not here. Update this file with every change to a numerical path
or numerical dependency.

Current scope: `urn:nomue:bundle:itgc-guarantee:0.2.1-draft.1`, two-sided Welch
two-sample t with the 0.2.1 numerical check versions. Source:
`reference/stats-kernel/src/` and `reference/verifier/src/numerical-comparison.ts`.

## Welch recomputation

| Quantity | Method | Implementation |
| --- | --- | --- |
| Group mean | Kahan-Neumaier compensated summation in binary64 | this repository |
| Sample variance (n - 1) | Two pass: mean first, then compensated sum of squared deviations | this repository |
| Standard error | `sqrt(s1^2/n1 + s2^2/n2)` | this repository |
| Degrees of freedom | Welch-Satterthwaite formula | this repository |
| Test statistic | `(mean1 - mean2) / SE`; refused when `t^2` overflows binary64 | this repository |
| Two-sided p-value | `2 * P(T <= -abs(t))`. For df = 1 and `abs(x) <= 1`, the Cauchy closed form `0.5 + atan(x)/pi`; otherwise the library CDF | `@stdlib/stats-base-dists-t-cdf` 0.2.3 |
| Critical value | Student t quantile at `1 - (1 - level)/2`; no normal approximation fallback | `@stdlib/stats-base-dists-t-quantile` 0.2.3 |
| 95% interval endpoints | `mean difference -/+ critical value * SE` in binary64 | this repository |

### Guard-digit path for interval cancellation

When either interval endpoint is smaller than 1e-4 of the larger operand, the
interval is recomputed with 80 significant decimal digits (`decimal.js` 10.6.0,
round half even):

- observations are decoded exactly from their binary64 bits;
- moments are centered before summation;
- the Student quantile uses a bounded incomplete-beta continued fraction, a
  shifted Stirling log-gamma and bracketed Newton iteration;
- the mean difference, standard error, degrees of freedom, test statistic and
  both endpoints come from this path, and the p-value is recomputed from the
  refined t and df by the routine above.

Nonconvergence fails the computability check with
`NRS-CRITICAL-VALUE-CALCULATION-FAILED`; it never falls back to the binary64
value. Details and limits are in [CI-ACCURACY-REPAIR.md](CI-ACCURACY-REPAIR.md).

## Comparison with declared values

- Fields use `abs(actual - expected) <= max(absolute, relative * max(abs(actual), abs(expected)))`
  with the registered tolerance of each field.
- The 0.2.1 p-value comparison is relative only; zero and positive values are
  never equivalent.
- A computed p-value of 0 with finite t and df is treated as numerical
  underflow, not as an exact zero.

## Method preference

Where the cost is justified, the verifier prefers high-precision generic
methods: arbitrary precision, exact arithmetic or guard digits. Otherwise it uses
a pinned library. Every library used for a checked quantity is listed above and
pinned exactly in `package.json` and `package-lock.json`.

Libraries are not independent oracles. Regression references for the guard-digit
path come from `tests/generate-ci-reference.py`, which uses exact rational
moments, 100-digit beta inversion and independent Student density quadrature
(mpmath 1.3.0). Neither these references nor this list is a global error bound.

## Domain

When the Protocol declares a public-check domain for a numerical check, the
verifier covers that domain and returns the unsupported outcome the Protocol
defines outside it. The current 0.2.1 checks declare no separate public-check
domain. Inside the current scope, a value the kernel
cannot compute fails the computability check with a registered reason code
(for example `NRS-ZERO-STANDARD-ERROR` or `NRS-P-VALUE-UNDERFLOW`); it is never
replaced by an approximation.
