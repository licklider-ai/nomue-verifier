/**
 * Phase 2A bundle pipeline (urn:nomue:bundle:itgc-guarantee:0.2.0-draft.1).
 *
 * Checks: record conformance (schema + semantic), record integrity, ITGC
 * profile admissibility, Welch computability, and Welch recomputation with
 * the mean-difference effect estimate and 95% confidence interval
 * (NRS-VERIFY-0013..0017). Admissibility failure gates computability and
 * recomputation to not_run with the blocking reason codes (NRS-VERIFY-0017);
 * a pass never asserts that any declaration is true (NRS-CORE-0009).
 */

import {
  StatsKernelError,
  welchTwoSampleTTestWithCi,
  type WelchResultWithCi,
} from "../../stats-kernel/src/kernel.js";
import { CanonicalizationError, recomputeContentDigest } from "./digest.js";
import {
  SUPPORTED_CI_METHOD_ID,
  SUPPORTED_CONFIDENCE_LEVEL,
  type Phase2aRecord,
} from "./record-types-2a.js";
import type {
  CheckResult,
  ConformanceResult,
  Evidence,
  Mismatch,
  Scope,
  VerificationReport,
} from "./report-types.js";
import {
  CHECK_IDS_2A,
  REPORT_2A_SCHEMA_ID,
  VERIFIER_NAME,
  VERIFIER_VERSION,
  type ToleranceSpec,
  type VerifierResources,
} from "./resources.js";
import { checkAdmissibility, checkStateInvariants2a } from "./semantic-2a.js";
import type { BundleRunOutcome } from "./verify-phase1.js";

const CHECK_VERSION = "0.2.0-draft.1";

function withinTolerance(actual: number, expected: number, tol: ToleranceSpec): boolean {
  return (
    Math.abs(actual - expected) <=
    Math.max(tol.absolute, tol.relative * Math.max(Math.abs(actual), Math.abs(expected)))
  );
}

function mapSchemaErrorReasonCodes(
  errors: Array<{ instancePath?: string; keyword?: string }>,
): string[] {
  const codes = new Set<string>(["NRS-SCHEMA-INVALID"]);
  for (const error of errors) {
    const path = error.instancePath ?? "";
    if (
      path.startsWith("/payload/design/groups") &&
      (error.keyword === "minItems" || error.keyword === "maxItems")
    ) {
      codes.add("NRS-GROUP-COUNT-NOT-TWO");
    }
  }
  return [...codes];
}

export function runPhase2aBundle(parsed: unknown, resources: VerifierResources): BundleRunOutcome {
  const schemaValid = resources.validateRecord2a(parsed) === true;
  const schemaErrors = resources.validateRecord2a.errors ?? [];

  const rec = parsed as Partial<Phase2aRecord>;
  const recordId =
    typeof rec.record_id === "string" && rec.record_id.includes(":")
      ? rec.record_id
      : "urn:nomue:unidentified:record";
  const revisionId =
    typeof rec.revision_id === "string" && rec.revision_id.includes(":")
      ? rec.revision_id
      : "urn:nomue:unidentified:revision";
  // Routing (NRS-VERSION-0008) guarantees a string bundle identifier before
  // any pipeline runs; a non-string here is a verifier defect, and nothing
  // is fabricated in its place (the thrown error surfaces as internal_error).
  if (typeof rec.interpretation_bundle_id !== "string") {
    throw new Error("phase-2a pipeline invoked without a routed bundle identifier");
  }
  const bundleId = rec.interpretation_bundle_id;

  let recomputedDigest: string;
  try {
    recomputedDigest = recomputeContentDigest(parsed as Record<string, unknown>);
  } catch (err) {
    if (err instanceof CanonicalizationError) {
      return { exitCode: 2, canonicalizationFailure: { message: err.message } };
    }
    throw err;
  }

  const conformanceScope: Scope = { kind: "record", id: recordId };
  let conformance: ConformanceResult;
  let conformanceFailureCodes: string[] = [];

  if (!schemaValid) {
    conformanceFailureCodes = mapSchemaErrorReasonCodes(schemaErrors);
    conformance = {
      check_id: CHECK_IDS_2A.conformance,
      execution: "completed",
      outcome: "fail",
      scope: conformanceScope,
      reason_codes: conformanceFailureCodes,
    };
  } else {
    const violations = checkStateInvariants2a(parsed as Phase2aRecord);
    if (violations.length > 0) {
      const codes = new Set<string>(["NRS-SEMANTIC-CONFORMANCE-FAILED"]);
      for (const violation of violations) codes.add(violation.reason_code);
      conformanceFailureCodes = [...codes];
      conformance = {
        check_id: CHECK_IDS_2A.conformance,
        execution: "completed",
        outcome: "fail",
        scope: conformanceScope,
        reason_codes: conformanceFailureCodes,
      };
    } else {
      conformance = {
        check_id: CHECK_IDS_2A.conformance,
        execution: "completed",
        outcome: "pass",
        scope: conformanceScope,
        reason_codes: [],
      };
    }
  }

  const results: CheckResult[] = [];
  const notRun = (checkId: string, scope: Scope, codes: string[]): CheckResult => ({
    check_id: checkId,
    check_version: CHECK_VERSION,
    execution: "not_run",
    scope,
    reason_codes: codes,
  });

  if (conformance.outcome !== "pass") {
    const codes =
      conformanceFailureCodes.length > 0 ? conformanceFailureCodes : ["NRS-SCHEMA-INVALID"];
    const scope: Scope = { kind: "record_revision", id: revisionId };
    results.push(
      notRun(CHECK_IDS_2A.integrity, scope, codes),
      notRun(CHECK_IDS_2A.admissibility, scope, codes),
      notRun(CHECK_IDS_2A.computability, scope, codes),
      notRun(CHECK_IDS_2A.welch, scope, codes),
    );
  } else {
    const record = parsed as Phase2aRecord;
    const revisionScope: Scope = { kind: "record_revision", id: record.revision_id };
    const analysisScope: Scope = {
      kind: "analysis",
      id: `${record.revision_id}#${record.payload.analysis.analysis_id}`,
    };
    const resultScope: Scope = {
      kind: "result",
      id: `${record.revision_id}#${record.payload.result.result_id}`,
    };

    // Record integrity (independent of the profile checks).
    const declaredDigest = record.integrity.content_digest;
    results.push({
      check_id: CHECK_IDS_2A.integrity,
      check_version: CHECK_VERSION,
      execution: "completed",
      outcome: declaredDigest === recomputedDigest ? "pass" : "fail",
      scope: revisionScope,
      reason_codes: declaredDigest === recomputedDigest ? [] : ["NRS-DIGEST-MISMATCH"],
      evidence: {
        declared_content_digest: declaredDigest,
        recomputed_content_digest: recomputedDigest,
      },
    });

    // ITGC profile admissibility (declared structure only, NRS-CORE-0009).
    const admissibilityViolations = checkAdmissibility(record);
    const admissibilityCodes = [...new Set(admissibilityViolations.map((v) => v.reason_code))];
    const admissibilityResult: CheckResult = {
      check_id: CHECK_IDS_2A.admissibility,
      check_version: CHECK_VERSION,
      execution: "completed",
      outcome: admissibilityViolations.length === 0 ? "pass" : "fail",
      scope: { kind: "record", id: record.record_id },
      reason_codes: admissibilityCodes,
    };
    if (admissibilityViolations.length > 0) {
      admissibilityResult.evidence = {
        unsupported_declarations: admissibilityViolations.map((v) => v.declaration),
      };
    }
    results.push(admissibilityResult);

    if (admissibilityResult.outcome !== "pass") {
      // NRS-VERIFY-0017: dependent checks do not run; the blocking reasons
      // propagate.
      results.push(
        notRun(CHECK_IDS_2A.computability, analysisScope, admissibilityCodes),
        notRun(CHECK_IDS_2A.welch, resultScope, admissibilityCodes),
      );
    } else {
      // Welch computability: can the supported quantities be computed from
      // the observations (finite, variance computable, SE > 0, finite df,
      // finite critical value, finite p, finite CI endpoints)?
      const order = record.payload.design.group_order;
      const valuesFor = (groupId: string): number[] =>
        record.payload.dataset.observations
          .filter((o) => o.group_id === groupId)
          .map((o) => o.outcome_value);
      const g1 = { group_id: order[0] as string, values: valuesFor(order[0] as string) };
      const g2 = { group_id: order[1] as string, values: valuesFor(order[1] as string) };

      let welch: WelchResultWithCi | null = null;
      let computabilityResult: CheckResult;
      try {
        welch = welchTwoSampleTTestWithCi(g1, g2, SUPPORTED_CONFIDENCE_LEVEL);
        computabilityResult = {
          check_id: CHECK_IDS_2A.computability,
          check_version: CHECK_VERSION,
          execution: "completed",
          outcome: "pass",
          scope: analysisScope,
          reason_codes: [],
          evidence: { standard_error: welch.standard_error },
        };
      } catch (err) {
        if (err instanceof StatsKernelError) {
          const code =
            err.code === "ZERO_STANDARD_ERROR"
              ? "NRS-ZERO-STANDARD-ERROR"
              : err.code === "CRITICAL_VALUE_FAILED"
                ? "NRS-CRITICAL-VALUE-CALCULATION-FAILED"
                : err.code === "NON_FINITE_INPUT"
                  ? "NRS-NON-FINITE-NUMERIC-VALUE"
                  : err.code === "INSUFFICIENT_OBSERVATIONS"
                    ? "NRS-GROUP-SIZE-BELOW-TWO"
                    : err.code === "T_SQUARED_OVERFLOW"
                      ? "NRS-T-SQUARED-OVERFLOW"
                      : "NRS-NUMERICAL-COMPUTABILITY-FAILED";
          const codes = [...new Set([code, "NRS-NUMERICAL-COMPUTABILITY-FAILED"])];
          computabilityResult = {
            check_id: CHECK_IDS_2A.computability,
            check_version: CHECK_VERSION,
            execution: "completed",
            outcome: "fail",
            scope: analysisScope,
            reason_codes: codes,
            ...(err.code === "ZERO_STANDARD_ERROR" ? { evidence: { standard_error: 0 } } : {}),
          };
        } else {
          throw err;
        }
      }
      results.push(computabilityResult);

      if (computabilityResult.outcome !== "pass" || welch === null) {
        results.push(notRun(CHECK_IDS_2A.welch, resultScope, computabilityResult.reason_codes));
      } else {
        const welchCheck = resources.checks.get(CHECK_IDS_2A.welch);
        const tolerances = welchCheck?.tolerance_policy.numeric_tolerances;
        if (tolerances === undefined) {
          throw new Error(
            "phase-2a welch-recompute tolerance policy is missing from the check registry",
          );
        }
        // The supported level, CI method, and estimand are owned by the
        // check version; the registry's machine-readable constants must
        // agree with the implemented profile constants, or this is a
        // cross-artifact conflict (fail loud, never prefer one silently).
        const constants = welchCheck?.comparison_constants;
        if (
          constants === undefined ||
          constants.supported_confidence_level !== SUPPORTED_CONFIDENCE_LEVEL ||
          constants.supported_ci_method_id !== SUPPORTED_CI_METHOD_ID ||
          constants.supported_estimand_kind !== "unstandardized_arithmetic_mean_difference"
        ) {
          throw new Error(
            "phase-2a welch-recompute comparison constants are missing from the check registry or disagree with the implemented profile constants",
          );
        }
        const tol = (name: string): ToleranceSpec => {
          const spec = tolerances[name];
          if (spec === undefined) {
            throw new Error(`tolerance for ${name} is missing from the check registry`);
          }
          return spec;
        };

        const declared = record.payload.result;
        const declaredCi = declared.effect_estimate.confidence_interval;
        const mismatches: Mismatch[] = [];
        const codes = new Set<string>();

        welch.group_summaries.forEach((summary, index) => {
          const declaredSummary = declared.group_summaries[index];
          if (declaredSummary === undefined) return;
          if (declaredSummary.group_id !== summary.group_id) {
            mismatches.push({
              quantity: "group_id",
              group_id: summary.group_id,
              declared: declaredSummary.group_id,
              recomputed: summary.group_id,
            });
          }
          if (declaredSummary.n !== summary.n) {
            mismatches.push({
              quantity: "n",
              group_id: summary.group_id,
              declared: declaredSummary.n,
              recomputed: summary.n,
            });
          }
          if (!withinTolerance(summary.mean, declaredSummary.mean, tol("mean"))) {
            mismatches.push({
              quantity: "mean",
              group_id: summary.group_id,
              declared: declaredSummary.mean,
              recomputed: summary.mean,
            });
          }
          if (
            !withinTolerance(
              summary.sample_variance,
              declaredSummary.sample_variance,
              tol("sample_variance"),
            )
          ) {
            mismatches.push({
              quantity: "sample_variance",
              group_id: summary.group_id,
              declared: declaredSummary.sample_variance,
              recomputed: summary.sample_variance,
            });
          }
        });

        // Declared-CI structural sanity precedes numeric comparison.
        if (!(declaredCi.lower <= declaredCi.upper)) {
          codes.add("NRS-CONFIDENCE-INTERVAL-ORDER-INVALID");
          mismatches.push({
            quantity: "confidence_interval_order",
            declared: `[${declaredCi.lower}, ${declaredCi.upper}]`,
            recomputed: `[${welch.confidence_interval.lower}, ${welch.confidence_interval.upper}]`,
          });
        }
        if (declaredCi.method_id !== SUPPORTED_CI_METHOD_ID) {
          codes.add("NRS-CONFIDENCE-INTERVAL-MISMATCH");
          mismatches.push({
            quantity: "ci_method_id",
            declared: declaredCi.method_id,
            recomputed: SUPPORTED_CI_METHOD_ID,
          });
        }
        if (declaredCi.confidence_level !== SUPPORTED_CONFIDENCE_LEVEL) {
          codes.add("NRS-CONFIDENCE-LEVEL-MISMATCH");
          mismatches.push({
            quantity: "confidence_level",
            declared: declaredCi.confidence_level,
            recomputed: SUPPORTED_CONFIDENCE_LEVEL,
          });
        }

        const scalarComparisons: Array<[string, number, number, string | null]> = [
          ["estimate", declared.effect_estimate.estimate, welch.mean_difference, null],
          [
            "standard_error",
            declared.effect_estimate.standard_error,
            welch.standard_error,
            "NRS-STANDARD-ERROR-MISMATCH",
          ],
          [
            "ci_lower",
            declaredCi.lower,
            welch.confidence_interval.lower,
            "NRS-CONFIDENCE-INTERVAL-MISMATCH",
          ],
          [
            "ci_upper",
            declaredCi.upper,
            welch.confidence_interval.upper,
            "NRS-CONFIDENCE-INTERVAL-MISMATCH",
          ],
          ["test_statistic", declared.test.test_statistic, welch.test_statistic, null],
          ["degrees_of_freedom", declared.test.degrees_of_freedom, welch.degrees_of_freedom, null],
          ["p_value", declared.test.p_value, welch.p_value, null],
        ];
        for (const [name, declaredValue, recomputedValue, specificCode] of scalarComparisons) {
          if (!withinTolerance(recomputedValue, declaredValue, tol(name))) {
            mismatches.push({
              quantity: name,
              declared: declaredValue,
              recomputed: recomputedValue,
            });
            if (specificCode !== null) codes.add(specificCode);
          }
        }

        if (mismatches.length > 0) codes.add("NRS-DECLARED-RESULT-MISMATCH");

        const evidence: Evidence = {
          recomputed: {
            group_summaries: welch.group_summaries.map((s) => ({
              group_id: s.group_id,
              n: s.n,
              mean: s.mean,
              sample_variance: s.sample_variance,
            })),
            effect_estimate: {
              estimate: welch.mean_difference,
              standard_error: welch.standard_error,
              confidence_interval: {
                confidence_level: welch.confidence_interval.confidence_level,
                critical_value: welch.confidence_interval.critical_value,
                lower: welch.confidence_interval.lower,
                upper: welch.confidence_interval.upper,
              },
            },
            test: {
              test_statistic: welch.test_statistic,
              degrees_of_freedom: welch.degrees_of_freedom,
              p_value: welch.p_value,
            },
          },
          p_value_clamped: welch.p_value_clamped,
        };
        if (mismatches.length > 0) evidence.mismatches = mismatches;

        results.push({
          check_id: CHECK_IDS_2A.welch,
          check_version: CHECK_VERSION,
          execution: "completed",
          outcome: mismatches.length === 0 ? "pass" : "fail",
          scope: resultScope,
          reason_codes: [...codes],
          evidence,
        });
      }
    }
  }

  const report: VerificationReport = {
    $schema: REPORT_2A_SCHEMA_ID,
    report_type: "nomue-verification-report",
    record_reference: {
      record_id: recordId,
      revision_id: revisionId,
      content_digest: recomputedDigest,
    },
    interpretation_bundle_id: bundleId,
    verifier: {
      name: VERIFIER_NAME,
      version: VERIFIER_VERSION,
      source_commit: resources.sourceCommit,
    },
    generated_at: new Date().toISOString(),
    conformance,
    verification_results: results,
    guarantee_boundary: {
      scientific_validity: "not_asserted",
      declaration_truth: "not_asserted",
      distributional_model_validity: "not_asserted",
      causal_interpretation: "not_asserted",
      standardized_effect_size: "not_asserted",
    },
  };

  if (resources.validateReport2a(report) !== true) {
    return {
      exitCode: 5,
      internalFailure: {
        message: `the produced report does not validate against the 0.2 report schema: ${JSON.stringify(
          resources.validateReport2a.errors,
        )}`,
      },
    };
  }

  const anyFail = conformance.outcome !== "pass" || results.some((r) => r.outcome === "fail");
  return { exitCode: anyFail ? 2 : 0, report };
}
