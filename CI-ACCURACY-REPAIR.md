# Guard digits for Welch interval cancellation

Founder-authorized quality repair, 2026-09-18. When the mean difference nearly
equals the critical value times the standard error, rounding each operand to
binary64 before subtraction can dominate the much smaller endpoint. Compensating
only the final subtraction cannot recover errors already introduced in df and
the critical value.

The kernel uses an 80-digit private decimal context when either endpoint is less
than 1e-4 of the larger operand. This dimensionless implementation trigger is not
a comparison tolerance. Original binary64 observations are decoded by bits;
centered moments, Welch df, Student quantile and both endpoints retain guard digits
until final output conversion. The normal path remains unchanged. The refined
path uses a bounded incomplete-beta continued fraction, shifted Stirling log-gamma
and bracketed Newton iteration. Nonconvergence uses the existing
CRITICAL_VALUE_FAILED refusal; it never silently falls back to the inaccurate value.
The refined path also replaces group summaries, mean difference, standard error,
degrees of freedom and test statistic; p-value and its clamping flag are recomputed
by the existing Student-tail routine using the refined t and df. It does not only
replace interval endpoints.

PR #21 review follow-up: the previous 1e-6 trigger left a band where the binary64
path could exceed the registered endpoint tolerance (absolute 1e-12, relative
1e-10). The 1e-4 trigger adds margin above that observed band, without changing
the tolerance. Synthetic references now cover endpoint ratios near 2e-6, 9e-5
and 1.1e-4, both signs and scales 2^-20, 1 and 2^20. The first two bands must
meet the refined-path accuracy check; the last must retain the normal path and
meet the registered tolerance. This finite regression set is not a global bound.

The mathematical method, confidence level, registered tolerance tables, check
versions, public support, release pin and package version are unchanged. This is
not an interval-certified error enclosure, a general correctly-rounded guarantee,
an expanded input domain or comparative product-value evidence. The extra runtime
dependency is decimal.js 10.6.0 (MIT), pinned in the manifest and lockfile and
exercised through package installation tests. No network is used during verification.
NOTICE includes the decimal.js MIT attribution and is explicitly included in the
npm package, with its presence checked by package smoke tests. The development manifest still
reads 0.2.1-rc.1; this modified runtime is not the already-published rc.1 tarball.
The next publication needs a new version (rc.2 or later), updated release evidence
and explicit release authorization. The publish workflow rejects an already
published version; merging this repair does not publish a package.

Regression inputs are synthetic centered groups of four size pairs, shifted to
either side of the 95% endpoint and exactly rescaled by powers of two. The fixture
generator uses exact Fraction moments and mpmath 1.3.0 at 100 digits; beta-inverted
quantiles are independently checked by integrating the Student density. Neither
the product nor decimal.js supplies the expected values. Runtime tests also cover
group reversal, input ordering, malformed/undefined inputs and independence from
the consumer's Decimal settings. Run npm test and npm run test:package.

Prepared and self-reviewed with OpenAI Codex under the founder's explicit repair
and PR request. This is not independent scientific review. The founder subsequently
supplied the PR #21 review and explicitly authorized its correction and merge on
2026-09-18; package publication was not requested. Protocol consumer copies need
coordinated intake after acceptance; published source pins and historical fixtures
are not rewritten.

Original verification (Node 24.19.0): npm test and test:package pass. All 24 original
endpoint regressions fail against the pre-repair kernel and pass after the repair.
The pinned Protocol C8 checkout (83d07d03f27cec0c245cf836c042e5378733b0a2)
with this kernel overlaid passes 132 conformance fixtures, the seven-dataset
captured-oracle replay and 45 kernel/numerical-contract tests. The historical
R1-08 evidence generator intentionally refuses execution at C8; its evidence
has not been regenerated or represented as validation of this patch. Tests run
via node --import tsx because the tsx CLI's IPC socket is unavailable locally.
The existing CI matrix still covers Node 20/22 on Linux, macOS and Windows.

Review-follow-up verification (Node 24.19.0): the regenerated fixture has 96 rows
(the original 24 are unchanged), with 72 refined-path and 24 normal-path cases.
All pass npm test, including reversal and permutation checks; test:package also
passes. Replacing only the trigger with its previous 1e-6 value makes all 48
new refined-band rows fail the strict accuracy check, including four rows that
exceed the registered endpoint tolerance. The corrected trigger passes all 96.
The same pinned Protocol overlay again passes 132 conformance fixtures, seven
captured-oracle datasets and 45 kernel/numerical-contract tests. A targeted
TypeScript check passes with --noEmit --target es2022 --module nodenext
--moduleResolution nodenext --types node on kernel.ts, precise-ci.ts and
tests/ci-precision.ts; decimal.js now uses its named Decimal export.

Formula references: [DLMF 8.17](https://dlmf.nist.gov/8.17) (beta symmetry and
continued fraction) and [DLMF 5.11](https://dlmf.nist.gov/5.11) (log-gamma
expansion). These support the formula choice, not an implementation error bound.
The decimal.js arithmetic path differs from the stdlib special-function path;
both implement the same mathematical distribution. Numerical-path diversity is
not independent scientific or environmental review.
