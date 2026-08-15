/**
 * Numeric comparison helpers for versioned public-check tolerance policies.
 * Normative formulas live in canonicalization/numerical-comparison.md.
 */

import type { ToleranceSpec } from "./resources.js";

/** Standard field comparator: max(absolute, relative * max(|actual|, |expected|)). */
export function withinNumericTolerance(
  actual: number,
  expected: number,
  tol: ToleranceSpec,
): boolean {
  return (
    Math.abs(actual - expected) <=
    Math.max(tol.absolute, tol.relative * Math.max(Math.abs(actual), Math.abs(expected)))
  );
}

/**
 * Phase 2A 0.2.1 p-value comparator (NRS-VERIFY-0020): positive and zero are
 * never equivalent; absolute tolerance is zero; relative tolerance only.
 */
export function withinPValueTolerance021(
  actual: number,
  expected: number,
  relativeTolerance: number,
): boolean {
  if (expected > 0 && actual === 0) return false;
  if (expected === 0 && actual > 0) return false;
  if (expected === 0 && actual === 0) return false;
  return (
    Math.abs(actual - expected) <=
    relativeTolerance * Math.max(Math.abs(actual), Math.abs(expected))
  );
}

/** Finite Welch outputs with p=0 are numerical underflow, not exact zero (NRS-VERIFY-0021). */
export function isNumericalPUnderflow(
  pValue: number,
  testStatistic: number,
  degreesOfFreedom: number,
): boolean {
  return (
    pValue === 0 &&
    Number.isFinite(testStatistic) &&
    Number.isFinite(degreesOfFreedom) &&
    degreesOfFreedom > 0
  );
}
