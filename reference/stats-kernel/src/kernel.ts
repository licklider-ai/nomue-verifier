/**
 * Minimal public statistics kernel (reference implementation, non-normative).
 *
 * Pure functions only: no file I/O, no network, no environment-dependent
 * defaults, no locale dependence. Group order is an explicit input. The
 * normative definitions live in
 * spec/profiles/independent-two-group-continuous/welch-calculation.md; this
 * kernel's summation strategy is an implementation choice, not authority.
 *
 * Numerical notes (informative): means use compensated (Kahan-Neumaier)
 * summation; variances use a two-pass algorithm (mean first, then compensated
 * summation of squared deviations) rather than a single-pass reduce.
 */

import { studentTQuantile, twoSidedPValue } from "./t-distribution.js";

export type StatsKernelErrorCode =
  | "NON_FINITE_INPUT"
  | "INSUFFICIENT_OBSERVATIONS"
  | "ZERO_STANDARD_ERROR"
  | "CRITICAL_VALUE_FAILED"
  | "NON_FINITE_RESULT"
  | "T_SQUARED_OVERFLOW";

export class StatsKernelError extends Error {
  readonly code: StatsKernelErrorCode;
  constructor(code: StatsKernelErrorCode, message: string) {
    super(message);
    this.name = "StatsKernelError";
    this.code = code;
  }
}

export interface GroupData {
  group_id: string;
  values: readonly number[];
}

export interface GroupSummary {
  group_id: string;
  n: number;
  mean: number;
  sample_variance: number;
}

export interface WelchResult {
  group_summaries: [GroupSummary, GroupSummary];
  mean_difference: number;
  standard_error: number;
  test_statistic: number;
  degrees_of_freedom: number;
  p_value: number;
  p_value_clamped: boolean;
}

/** Compensated (Kahan-Neumaier) summation. */
function compensatedSum(values: readonly number[]): number {
  let sum = 0;
  let compensation = 0;
  for (const value of values) {
    const t = sum + value;
    if (Math.abs(sum) >= Math.abs(value)) {
      compensation += sum - t + value;
    } else {
      compensation += value - t + sum;
    }
    sum = t;
  }
  return sum + compensation;
}

function assertFinite(values: readonly number[], groupId: string): void {
  for (const value of values) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new StatsKernelError(
        "NON_FINITE_INPUT",
        `group ${groupId} contains a missing or non-finite outcome value`,
      );
    }
  }
}

/** Arithmetic mean via compensated summation. */
export function sampleMean(values: readonly number[]): number {
  return compensatedSum(values) / values.length;
}

/**
 * Sample variance with the n-1 denominator, two-pass: mean first, then
 * compensated summation of squared deviations.
 */
export function sampleVariance(values: readonly number[], mean: number): number {
  const squaredDeviations = values.map((v) => (v - mean) * (v - mean));
  return compensatedSum(squaredDeviations) / (values.length - 1);
}

export function summarizeGroup(group: GroupData): GroupSummary {
  assertFinite(group.values, group.group_id);
  if (group.values.length < 2) {
    throw new StatsKernelError(
      "INSUFFICIENT_OBSERVATIONS",
      `group ${group.group_id} has fewer than two observations`,
    );
  }
  const mean = sampleMean(group.values);
  const variance = sampleVariance(group.values, mean);
  return {
    group_id: group.group_id,
    n: group.values.length,
    mean,
    sample_variance: variance,
  };
}

/**
 * Two-sided Welch two-sample t-test in declared group order: group1 is the
 * first entry of group_order, group2 the second; mean_difference is
 * mean_1 - mean_2.
 */
export function welchTwoSampleTTest(group1: GroupData, group2: GroupData): WelchResult {
  const s1 = summarizeGroup(group1);
  const s2 = summarizeGroup(group2);

  // Finite-but-extreme inputs can overflow intermediate quantities even
  // though every observation is a finite binary64 value; such data is a
  // computability failure, never a verifier defect (fail closed with an
  // explicit error, not an escape into internal errors).
  if (!Number.isFinite(s1.mean) || !Number.isFinite(s2.mean)) {
    throw new StatsKernelError("NON_FINITE_RESULT", "a group mean is not finite");
  }
  if (!Number.isFinite(s1.sample_variance) || !Number.isFinite(s2.sample_variance)) {
    throw new StatsKernelError("NON_FINITE_RESULT", "a group sample variance is not finite");
  }

  const a = s1.sample_variance / s1.n;
  const b = s2.sample_variance / s2.n;
  const standardError = Math.sqrt(a + b);
  if (standardError === 0) {
    throw new StatsKernelError(
      "ZERO_STANDARD_ERROR",
      "the unpooled standard error is zero; the Welch statistic is undefined",
    );
  }
  if (!Number.isFinite(standardError)) {
    throw new StatsKernelError("NON_FINITE_RESULT", "the standard error is not finite");
  }

  const meanDifference = s1.mean - s2.mean;
  const t = meanDifference / standardError;
  const df = ((a + b) * (a + b)) / ((a * a) / (s1.n - 1) + (b * b) / (s2.n - 1));
  if (!Number.isFinite(meanDifference) || !Number.isFinite(t) || !Number.isFinite(df) || df <= 0) {
    throw new StatsKernelError(
      "NON_FINITE_RESULT",
      "the mean difference, test statistic, or degrees of freedom is not finite",
    );
  }
  // Safety guard (Batch 3 V3, NRS-VERIFY-0026): the adopted tail-evaluation
  // path forms t^2 as an intermediate (x = df / (df + t^2)); when t^2
  // overflows binary64 the evaluation would silently collapse to an
  // endpoint (x -> 0, p -> 0) instead of failing. Refuse explicitly. This
  // is a safety fix, not a precision improvement - no log-domain fallback
  // is applied (rejected under S1; see the S1-close ADR).
  if (!Number.isFinite(t * t)) {
    throw new StatsKernelError(
      "T_SQUARED_OVERFLOW",
      "the squared test statistic overflows binary64; the tail evaluation would silently return an endpoint instead of a probability",
    );
  }
  const p = twoSidedPValue(t, df);

  return {
    group_summaries: [s1, s2],
    mean_difference: meanDifference,
    standard_error: standardError,
    test_statistic: t,
    degrees_of_freedom: df,
    p_value: p.p_value,
    p_value_clamped: p.clamped,
  };
}

export interface ConfidenceInterval {
  confidence_level: number;
  critical_value: number;
  lower: number;
  upper: number;
}

export interface WelchResultWithCi extends WelchResult {
  confidence_interval: ConfidenceInterval;
}

/**
 * Two-sided Welch two-sample t-test with the mean-difference confidence
 * interval at the given two-sided confidence level (Phase 2A fixes 0.95 via
 * the check version; the level is an explicit input, never an environment
 * default). The interval uses the same unpooled standard error and
 * Welch-Satterthwaite degrees of freedom as the test:
 *   lower = mean_difference - critical_value * standard_error
 *   upper = mean_difference + critical_value * standard_error
 * with critical_value = t_quantile(1 - (1 - level) / 2, df). Critical-value
 * failure is an explicit error; there is no silent fallback to a normal
 * approximation.
 */
export function welchTwoSampleTTestWithCi(
  group1: GroupData,
  group2: GroupData,
  confidenceLevel: number,
): WelchResultWithCi {
  if (!Number.isFinite(confidenceLevel) || confidenceLevel <= 0 || confidenceLevel >= 1) {
    throw new StatsKernelError(
      "CRITICAL_VALUE_FAILED",
      `confidence level ${confidenceLevel} is outside (0, 1)`,
    );
  }
  const base = welchTwoSampleTTest(group1, group2);
  let criticalValue: number;
  try {
    criticalValue = studentTQuantile(1 - (1 - confidenceLevel) / 2, base.degrees_of_freedom);
  } catch (err) {
    throw new StatsKernelError(
      "CRITICAL_VALUE_FAILED",
      `critical value computation failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const lower = base.mean_difference - criticalValue * base.standard_error;
  const upper = base.mean_difference + criticalValue * base.standard_error;
  if (!Number.isFinite(lower) || !Number.isFinite(upper)) {
    throw new StatsKernelError("NON_FINITE_RESULT", "confidence-interval endpoints are not finite");
  }
  return {
    ...base,
    confidence_interval: {
      confidence_level: confidenceLevel,
      critical_value: criticalValue,
      lower,
      upper,
    },
  };
}
