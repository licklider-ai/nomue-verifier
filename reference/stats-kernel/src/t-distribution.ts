/**
 * Wrapper boundary around the external Student t-distribution dependency.
 *
 * The dependency is @stdlib/stats-base-dists-t-cdf (Apache-2.0), pinned in
 * pnpm-lock.yaml. It is a reference-implementation dependency only: the
 * normative definition of the p-value is the mathematical statement in
 * spec/profiles/independent-two-group-continuous/welch-calculation.md, and
 * this dependency is NOT counted as an independent oracle (see ADR-0010),
 * because anything using it shares its potential defects.
 */

import tCdf from "@stdlib/stats-base-dists-t-cdf";
import tQuantile from "@stdlib/stats-base-dists-t-quantile";

/** Student t cumulative distribution function P(T <= x) with df degrees of freedom. */
export function studentTCdf(x: number, df: number): number {
  if (!Number.isFinite(x) || !Number.isFinite(df) || df <= 0) {
    throw new RangeError(`studentTCdf: invalid input x=${x}, df=${df}`);
  }
  return tCdf(x, df);
}

/**
 * Student t quantile (inverse CDF) at probability p with df degrees of
 * freedom, from @stdlib/stats-base-dists-t-quantile (Apache-2.0, pinned in
 * pnpm-lock.yaml; same wrapper-boundary and not-an-oracle rules as the CDF,
 * see ADR-0010 and ADR-0013). There is no fallback to a normal
 * approximation: a non-finite result is an explicit error (fail closed).
 */
export function studentTQuantile(p: number, df: number): number {
  if (!Number.isFinite(p) || p <= 0 || p >= 1 || !Number.isFinite(df) || df <= 0) {
    throw new RangeError(`studentTQuantile: invalid input p=${p}, df=${df}`);
  }
  const value = tQuantile(p, df);
  if (!Number.isFinite(value)) {
    throw new RangeError(`studentTQuantile: non-finite quantile for p=${p}, df=${df}`);
  }
  return value;
}

export interface TwoSidedPValue {
  p_value: number;
  clamped: boolean;
}

/**
 * Two-sided p-value: p = 2 * P(T <= -|t|), mathematically equal to
 * 2 * survival_function(|t|), evaluated in the lower tail for numerical
 * stability. The result is clamped into [0, 1] only as far as numerical
 * stability requires; a clamp is reported so callers can detect it.
 */
export function twoSidedPValue(t: number, df: number): TwoSidedPValue {
  const raw = 2 * studentTCdf(-Math.abs(t), df);
  const clampedValue = Math.min(1, Math.max(0, raw));
  return { p_value: clampedValue, clamped: clampedValue !== raw };
}
