/**
 * Phase 1 bundle pipeline (urn:nomue:bundle:itgc-minimal:0.1.0-draft.1).
 *
 * This module preserves the pinned Phase 1 behavior unchanged
 * (NRS-VERSION-0006): schema validation against the 0.1 Record schema,
 * Phase 1 semantic conformance, integrity recomputation, the ITGC
 * precondition check, Welch recomputation, and the 0.1 verification report.
 */

import { StatsKernelError, welchTwoSampleTTest } from "../../stats-kernel/src/kernel.js";
import { CanonicalizationError, recomputeContentDigest } from "./digest.js";
import type { Phase1Record } from "./record-types.js";
import type {
  CheckResult,
  ConformanceResult,
  Evidence,
  Mismatch,
  Scope,
  VerificationReport,
} from "./report-types.js";
import {
  CHECK_IDS,
  REPORT_SCHEMA_ID,
  VERIFIER_NAME,
  VERIFIER_VERSION,
  type ToleranceSpec,
  type VerifierResources,
} from "./resources.js";
import { checkStateInvariants } from "./semantic.js";

const CHECK_VERSION = "0.1.0-draft.1";

export interface BundleRunOutcome {
  exitCode: 0 | 2 | 5;
  report?: VerificationReport;
  /** Set when no report can be produced; the caller emits a refusal. */
  canonicalizationFailure?: { message: string };
  internalFailure?: { message: string };
}

function withinTolerance(actual: number, expected: number, tol: ToleranceSpec): boolean {
  return (
    Math.abs(actual - expected) <=
    Math.max(tol.absolute, tol.relative * Math.max(Math.abs(actual), Math.abs(expected)))
  );
}

/** Map schema-validation errors to specific registered reason codes where unambiguous. */
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

export function runPhase1Bundle(parsed: unknown, resources: VerifierResources): BundleRunOutcome {
  const schemaValid = resources.validateRecord(parsed) === true;
  const schemaErrors = resources.validateRecord.errors ?? [];

  const rec = parsed as Partial<Phase1Record>;
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
    throw new Error("phase-1 pipeline invoked without a routed bundle identifier");
  }
  const bundleId = rec.interpretation_bundle_id;

  // The content digest is always recomputed, never copied from the Record.
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
      check_id: CHECK_IDS.conformance,
      execution: "completed",
      outcome: "fail",
      scope: conformanceScope,
      reason_codes: conformanceFailureCodes,
    };
  } else {
    const violations = checkStateInvariants(parsed as Phase1Record);
    if (violations.length > 0) {
      const codes = new Set<string>(["NRS-SEMANTIC-CONFORMANCE-FAILED"]);
      for (const violation of violations) codes.add(violation.reason_code);
      conformanceFailureCodes = [...codes];
      conformance = {
        check_id: CHECK_IDS.conformance,
        execution: "completed",
        outcome: "fail",
        scope: conformanceScope,
        reason_codes: conformanceFailureCodes,
      };
    } else {
      conformance = {
        check_id: CHECK_IDS.conformance,
        execution: "completed",
        outcome: "pass",
        scope: conformanceScope,
        reason_codes: [],
      };
    }
  }

  const results: CheckResult[] = [];
  const conformancePassed = conformance.outcome === "pass";

  if (!conformancePassed) {
    const notRunCodes =
      conformanceFailureCodes.length > 0 ? conformanceFailureCodes : ["NRS-SCHEMA-INVALID"];
    for (const checkId of [CHECK_IDS.integrity, CHECK_IDS.preconditions, CHECK_IDS.welch]) {
      results.push({
        check_id: checkId,
        check_version: CHECK_VERSION,
        execution: "not_run",
        scope: { kind: "record_revision", id: revisionId },
        reason_codes: notRunCodes,
      });
    }
  } else {
    const record = parsed as Phase1Record;
    const analysisScope: Scope = {
      kind: "analysis",
      id: `${record.revision_id}#${record.payload.analysis.analysis_id}`,
    };
    const resultScope: Scope = {
      kind: "result",
      id: `${record.revision_id}#${record.payload.result.result_id}`,
    };

    // Integrity: independent digest recomputation (NRS-VERIFY-0006).
    const declaredDigest = record.integrity.content_digest;
    results.push({
      check_id: CHECK_IDS.integrity,
      check_version: CHECK_VERSION,
      execution: "completed",
      outcome: declaredDigest === recomputedDigest ? "pass" : "fail",
      scope: { kind: "record_revision", id: record.revision_id },
      reason_codes: declaredDigest === recomputedDigest ? [] : ["NRS-DIGEST-MISMATCH"],
      evidence: {
        declared_content_digest: declaredDigest,
        recomputed_content_digest: recomputedDigest,
      },
    });

    // Profile preconditions, including the data-dependent zero standard
    // error (NRS-VERIFY-0007, NRS-PROFILE-ITGC-0014).
    const order = record.payload.design.group_order;
    const valuesFor = (groupId: string): number[] =>
      record.payload.dataset.observations
        .filter((o) => o.group_id === groupId)
        .map((o) => o.outcome_value);
    const g1 = { group_id: order[0] as string, values: valuesFor(order[0] as string) };
    const g2 = { group_id: order[1] as string, values: valuesFor(order[1] as string) };

    let welchOutcome: ReturnType<typeof welchTwoSampleTTest> | null = null;
    let preconditionResult: CheckResult;
    try {
      welchOutcome = welchTwoSampleTTest(g1, g2);
      preconditionResult = {
        check_id: CHECK_IDS.preconditions,
        check_version: CHECK_VERSION,
        execution: "completed",
        outcome: "pass",
        scope: analysisScope,
        reason_codes: [],
        evidence: { standard_error: welchOutcome.standard_error },
      };
    } catch (err) {
      if (err instanceof StatsKernelError && err.code === "ZERO_STANDARD_ERROR") {
        preconditionResult = {
          check_id: CHECK_IDS.preconditions,
          check_version: CHECK_VERSION,
          execution: "completed",
          outcome: "fail",
          scope: analysisScope,
          reason_codes: ["NRS-ZERO-STANDARD-ERROR"],
          evidence: { standard_error: 0 },
        };
      } else if (err instanceof StatsKernelError) {
        preconditionResult = {
          check_id: CHECK_IDS.preconditions,
          check_version: CHECK_VERSION,
          execution: "completed",
          outcome: "fail",
          scope: analysisScope,
          reason_codes: [
            err.code === "NON_FINITE_INPUT" || err.code === "NON_FINITE_RESULT"
              ? "NRS-NON-FINITE-NUMERIC-VALUE"
              : err.code === "T_SQUARED_OVERFLOW"
                ? "NRS-T-SQUARED-OVERFLOW"
                : "NRS-GROUP-SIZE-BELOW-TWO",
          ],
        };
      } else {
        throw err;
      }
    }
    results.push(preconditionResult);

    // Welch recomputation and declared-result comparison
    // (NRS-VERIFY-0008, NRS-VERIFY-0009).
    if (preconditionResult.outcome !== "pass" || welchOutcome === null) {
      results.push({
        check_id: CHECK_IDS.welch,
        check_version: CHECK_VERSION,
        execution: "not_run",
        scope: resultScope,
        reason_codes:
          preconditionResult.reason_codes.length > 0
            ? preconditionResult.reason_codes
            : ["NRS-ZERO-STANDARD-ERROR"],
      });
    } else {
      const welchCheck = resources.checks.get(CHECK_IDS.welch);
      const tolerances = welchCheck?.tolerance_policy.numeric_tolerances;
      if (tolerances === undefined) {
        throw new Error("welch-recompute tolerance policy is missing from the check registry");
      }
      const tol = (name: string): ToleranceSpec => {
        const spec = tolerances[name];
        if (spec === undefined) {
          throw new Error(`tolerance for ${name} is missing from the check registry`);
        }
        return spec;
      };

      const declared = record.payload.result;
      const mismatches: Mismatch[] = [];
      welchOutcome.group_summaries.forEach((summary, index) => {
        const declaredSummary = declared.group_summaries[index];
        if (declaredSummary === undefined) return;
        // Defense in depth: group binding is already a gating semantic
        // invariant, but group_id is a declared exact field of this check.
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
      const scalarComparisons: Array<[string, number, number]> = [
        ["mean_difference", declared.mean_difference, welchOutcome.mean_difference],
        ["test_statistic", declared.test_statistic, welchOutcome.test_statistic],
        ["degrees_of_freedom", declared.degrees_of_freedom, welchOutcome.degrees_of_freedom],
        ["p_value", declared.p_value, welchOutcome.p_value],
      ];
      for (const [name, declaredValue, recomputedValue] of scalarComparisons) {
        if (!withinTolerance(recomputedValue, declaredValue, tol(name))) {
          mismatches.push({ quantity: name, declared: declaredValue, recomputed: recomputedValue });
        }
      }

      const evidence: Evidence = {
        recomputed: {
          group_summaries: welchOutcome.group_summaries.map((s) => ({
            group_id: s.group_id,
            n: s.n,
            mean: s.mean,
            sample_variance: s.sample_variance,
          })),
          mean_difference: welchOutcome.mean_difference,
          test_statistic: welchOutcome.test_statistic,
          degrees_of_freedom: welchOutcome.degrees_of_freedom,
          p_value: welchOutcome.p_value,
        },
        p_value_clamped: welchOutcome.p_value_clamped,
      };
      if (mismatches.length > 0) evidence.mismatches = mismatches;

      results.push({
        check_id: CHECK_IDS.welch,
        check_version: CHECK_VERSION,
        execution: "completed",
        outcome: mismatches.length === 0 ? "pass" : "fail",
        scope: resultScope,
        reason_codes: mismatches.length === 0 ? [] : ["NRS-DECLARED-RESULT-MISMATCH"],
        evidence,
      });
    }
  }

  const report: VerificationReport = {
    $schema: REPORT_SCHEMA_ID,
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
    guarantee_boundary: { scientific_validity: "not_asserted" },
  };

  if (resources.validateReport(report) !== true) {
    return {
      exitCode: 5,
      internalFailure: {
        message: `the produced report does not validate against the report schema: ${JSON.stringify(
          resources.validateReport.errors,
        )}`,
      },
    };
  }

  const anyFail = conformance.outcome !== "pass" || results.some((r) => r.outcome === "fail");
  return { exitCode: anyFail ? 2 : 0, report };
}
