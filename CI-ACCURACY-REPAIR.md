# Guard digits for Welch interval cancellation

Founder-authorized quality repair, 2026-09-18. When the mean difference nearly
equals the critical value times the standard error, rounding each operand to
binary64 before subtraction can dominate the much smaller endpoint. Compensating
only the final subtraction cannot recover errors already introduced in df and
the critical value.

The kernel uses an 80-digit private decimal context when either endpoint is less
than 1e-6 of the larger operand. This dimensionless implementation trigger is not
a comparison tolerance. Original binary64 observations are decoded by bits;
centered moments, Welch df, Student quantile and both endpoints retain guard digits
until final output conversion. The normal path remains unchanged. The refined
path uses a bounded incomplete-beta continued fraction, shifted Stirling log-gamma
and bracketed Newton iteration. Nonconvergence uses the existing
CRITICAL_VALUE_FAILED refusal; it never silently falls back to the inaccurate value.

The mathematical method, confidence level, registered tolerance tables, check
versions, public support, release pin and package version are unchanged. This is
not an interval-certified error enclosure, a general correctly-rounded guarantee,
an expanded input domain or comparative product-value evidence. The extra runtime
dependency is decimal.js 10.6.0 (MIT), pinned in the manifest and lockfile and
exercised through package installation tests. No network is used during verification.

Regression inputs are synthetic centered groups of four size pairs, shifted to
either side of the 95% endpoint and exactly rescaled by powers of two. The fixture
generator uses exact Fraction moments and mpmath 1.3.0 at 100 digits; beta-inverted
quantiles are independently checked by integrating the Student density. Neither
the product nor decimal.js supplies the expected values. Runtime tests also cover
group reversal, input ordering, malformed/undefined inputs and independence from
the consumer's Decimal settings. Run npm test and npm run test:package.

Prepared and self-reviewed with OpenAI Codex under the founder's explicit repair
and PR request. This is not independent scientific review. No merge or release is
authorized by this record. Protocol consumer copies need coordinated intake after
acceptance; published source pins and historical fixtures are not rewritten.

Local verification (Node 24.19.0): npm test and test:package pass. All 24 new
endpoint regressions fail against the previous kernel and pass after the repair.
The pinned Protocol C8 checkout (83d07d03f27cec0c245cf836c042e5378733b0a2)
with this kernel overlaid passes 132 conformance fixtures, the seven-dataset
captured-oracle replay and 45 kernel/numerical-contract tests. The historical
R1-08 evidence generator intentionally refuses execution at C8; its evidence
has not been regenerated or represented as validation of this patch. Tests run
via node --import tsx because the tsx CLI's IPC socket is unavailable locally.
The existing CI matrix still covers Node 20/22 on Linux, macOS and Windows.

Formula references: [DLMF 8.17](https://dlmf.nist.gov/8.17) (beta symmetry and
continued fraction) and [DLMF 5.11](https://dlmf.nist.gov/5.11) (log-gamma
expansion). These support the formula choice, not an implementation error bound.
The decimal.js arithmetic path differs from the stdlib special-function path;
both implement the same mathematical distribution. Numerical-path diversity is
not independent scientific or environmental review.
