/**
 * Record lifecycle state projection and precondition evaluation
 * (NRS-CORE-0013..0019, spec/core/record-lifecycle.md; ADR-0028).
 *
 * State is a DERIVED PROJECTION over the artifact graph - never a stored
 * field. `projectState` is pure: same inputs (including the EXPLICIT
 * evaluation time) produce the same view, and every axis value cites the
 * truth-carriers it was computed from. `evaluateOperation` decides a
 * declarative precondition conjunction from the state tuple alone
 * (NRS-CORE-0014); a violated predicate yields a refusal-style result
 * carrying NRS-LIFECYCLE-PRECONDITION-NOT-MET, and a not-evaluable
 * predicate (information missing) yields a structured needs_clarification
 * (NRS-CORE-0015). No predicate aggregates check OUTCOMES - the closed
 * vocabulary is execution/existence-level only (NRS-VERIFY-0001 guard).
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { parse as parseYaml } from "yaml";
import type { Attestation, TrustRoot } from "./attestation.js";
import { verifyAssertionAsNomueAttested } from "./attestation.js";
import type { Approval } from "./approval.js";
import { checkApprovalScope } from "./approval.js";
import { recomputeContentDigest } from "./digest.js";
import { verifierRepoRoot } from "./resources.js";
import type { VerificationReport } from "./report-types.js";

export type ProfileEligibilityValue = "eligible" | "ineligible" | "not_evaluated";
export type CheckAxisValue = "all_completed" | "some_not_run" | "some_error" | "not_evaluated";
export type FreshnessValue = "current" | "stale" | "not_evaluable";
export type ApprovalAxisValue = "scope_consistent" | "scope_mismatch" | "absent";
export type VerificationAxisValue = "none" | "report_exists" | "nomue_attested";
export type DisclosureValue = "active" | "withdrawn" | "superseded";

export interface AxisState<V extends string> {
  value: V;
  carriers: string[];
}

export interface StateView {
  $schema: "urn:nomue:schema:state-view:0.1.0-draft.1";
  view_type: "nomue-state-view";
  record_reference: { record_id: string; revision_id: string; content_digest: string };
  evaluated_at: string;
  axes: {
    profile_eligibility: AxisState<ProfileEligibilityValue>;
    check: AxisState<CheckAxisValue>;
    freshness: AxisState<FreshnessValue>;
    approval: AxisState<ApprovalAxisValue>;
    verification: AxisState<VerificationAxisValue>;
    disclosure: AxisState<DisclosureValue>;
  };
}

export interface DisclosureNotice {
  notice_kind: "withdrawal" | "supersession";
  subject: { record_id: string; revision_id: string; content_digest: string };
  superseded_by?: string;
  issued_at: string;
}

export interface ProjectionInputs {
  record: Record<string, unknown>;
  report?: VerificationReport;
  attestations?: Attestation[];
  approval?: Approval | null;
  notices?: DisclosureNotice[];
  trustRoot?: TrustRoot;
  registeredBundleIds: string[];
  evaluationTimeIso: string;
}

const ADMISSIBILITY_MARKERS = ["itgc-profile-admissibility", "itgc-preconditions"];

export function projectState(inputs: ProjectionInputs): StateView {
  const record = inputs.record;
  const integrity = record["integrity"] as { content_digest?: string } | undefined;
  const reference = {
    record_id: String(record["record_id"] ?? ""),
    revision_id: String(record["revision_id"] ?? ""),
    content_digest: String(integrity?.content_digest ?? ""),
  };
  const report = inputs.report;

  // profile_eligibility: derived from the admissibility/preconditions check.
  let profileEligibility: AxisState<ProfileEligibilityValue> = {
    value: "not_evaluated",
    carriers: [],
  };
  if (report !== undefined) {
    const admissibility = report.verification_results.find((r) =>
      ADMISSIBILITY_MARKERS.some((marker) => r.check_id.includes(marker)),
    );
    if (admissibility !== undefined && admissibility.execution === "completed") {
      profileEligibility = {
        value: admissibility.outcome === "pass" ? "eligible" : "ineligible",
        carriers: [admissibility.check_id],
      };
    }
  }

  // check: EXECUTION-level summary only; outcomes stay per-check in the
  // report (NRS-VERIFY-0001 - no aggregate verdict lives here).
  let check: AxisState<CheckAxisValue> = { value: "not_evaluated", carriers: [] };
  if (report !== undefined) {
    const results = report.verification_results;
    const carriers = results.map((r) => r.check_id);
    const hasError = results.some((r) => r.execution === "error");
    const hasNotRun = results.some((r) => r.execution === "not_run");
    check = {
      value: hasError ? "some_error" : hasNotRun ? "some_not_run" : "all_completed",
      carriers,
    };
  }

  // freshness: does the report still speak about THIS record content under
  // a still-registered bundle? Recomputed digest vs report reference.
  let freshness: AxisState<FreshnessValue> = { value: "not_evaluable", carriers: [] };
  if (report !== undefined) {
    const recomputed = recomputeContentDigest(record);
    const sameContent = report.record_reference.content_digest === recomputed;
    const sameRevision = report.record_reference.revision_id === reference.revision_id;
    const bundleRegistered = inputs.registeredBundleIds.includes(report.interpretation_bundle_id);
    freshness = {
      value: sameContent && sameRevision && bundleRegistered ? "current" : "stale",
      carriers: ["report.record_reference", report.interpretation_bundle_id],
    };
  }

  // approval: checkApprovalScope stays the single evaluator.
  const approvalInput = inputs.approval ?? null;
  const approvalResult = checkApprovalScope({
    approval: approvalInput,
    record_reference: reference,
  });
  const approval: AxisState<ApprovalAxisValue> = {
    value:
      approvalResult.execution === "not_run"
        ? "absent"
        : approvalResult.outcome === "pass"
          ? "scope_consistent"
          : "scope_mismatch",
    carriers: approvalInput === null ? [] : [approvalInput.approval_id, approvalResult.check_id],
  };

  // verification: artifact existence and trust-root linkage ONLY.
  let verification: AxisState<VerificationAxisValue> = { value: "none", carriers: [] };
  if (report !== undefined) {
    verification = { value: "report_exists", carriers: ["verification-report"] };
    const attestations = inputs.attestations ?? [];
    if (inputs.trustRoot !== undefined) {
      for (const attestation of attestations) {
        for (const assertion of attestation.assertions) {
          const result = verifyAssertionAsNomueAttested(
            assertion,
            inputs.trustRoot,
            inputs.evaluationTimeIso,
          );
          if (result.execution === "completed" && result.outcome === "pass") {
            verification = {
              value: "nomue_attested",
              carriers: ["verification-report", assertion.assertion_id],
            };
          }
        }
      }
    }
  }

  // disclosure: derived from notices about THIS revision; a supersession
  // outranks nothing - withdrawal and supersession are both terminal for
  // the revision, withdrawal reported first when both exist.
  const notices = (inputs.notices ?? []).filter(
    (n) => n.subject.revision_id === reference.revision_id,
  );
  const withdrawal = notices.find((n) => n.notice_kind === "withdrawal");
  const supersession = notices.find((n) => n.notice_kind === "supersession");
  const disclosure: AxisState<DisclosureValue> = withdrawal
    ? { value: "withdrawn", carriers: [`withdrawal@${withdrawal.issued_at}`] }
    : supersession
      ? { value: "superseded", carriers: [`supersession@${supersession.issued_at}`] }
      : { value: "active", carriers: [] };

  return {
    $schema: "urn:nomue:schema:state-view:0.1.0-draft.1",
    view_type: "nomue-state-view",
    record_reference: reference,
    evaluated_at: inputs.evaluationTimeIso,
    axes: {
      profile_eligibility: profileEligibility,
      check,
      freshness,
      approval,
      verification,
      disclosure,
    },
  };
}

// ---------------------------------------------------------------------------
// Precondition evaluation (NRS-CORE-0014/0017, NRS-CORE-0015)
// ---------------------------------------------------------------------------

export interface LifecycleOperation {
  operation: string;
  preconditions: Array<{ axis: keyof StateView["axes"]; predicate: string }>;
}

export interface LifecycleOperationsRegistry {
  registry: string;
  registry_version: string;
  operations: LifecycleOperation[];
}

export function loadLifecycleOperations(): LifecycleOperationsRegistry {
  const text = fs.readFileSync(
    path.join(verifierRepoRoot, "registries", "lifecycle-operations.yaml"),
    "utf8",
  );
  return parseYaml(text) as LifecycleOperationsRegistry;
}

type PredicateOutcome =
  | { kind: "satisfied" }
  | { kind: "violated" }
  | { kind: "not_evaluable"; what: string; expectedForm: { kind: string; ref?: string } };

/**
 * The CLOSED predicate table (NRS-VERIFY-0001 guard): execution/existence
 * level only. An unknown predicate throws - it is a registry defect, never
 * a silent pass or fail.
 */
function evaluatePredicate(
  view: StateView,
  axis: keyof StateView["axes"],
  predicate: string,
): PredicateOutcome {
  const value = view.axes[axis].value;
  switch (predicate) {
    case "eligible":
      if (value === "not_evaluated") {
        return {
          kind: "not_evaluable",
          what: "verification report (admissibility check)",
          expectedForm: {
            kind: "schema_ref",
            ref: "urn:nomue:schema:verification-report:0.2.0-draft.1",
          },
        };
      }
      return value === "eligible" ? { kind: "satisfied" } : { kind: "violated" };
    case "all_completed":
      if (value === "not_evaluated") {
        return {
          kind: "not_evaluable",
          what: "verification report",
          expectedForm: {
            kind: "schema_ref",
            ref: "urn:nomue:schema:verification-report:0.2.0-draft.1",
          },
        };
      }
      return value === "all_completed" ? { kind: "satisfied" } : { kind: "violated" };
    case "current":
      if (value === "not_evaluable") {
        return {
          kind: "not_evaluable",
          what: "verification report (freshness inputs)",
          expectedForm: {
            kind: "schema_ref",
            ref: "urn:nomue:schema:verification-report:0.2.0-draft.1",
          },
        };
      }
      return value === "current" ? { kind: "satisfied" } : { kind: "violated" };
    case "scope_consistent":
      if (value === "absent") {
        return {
          kind: "not_evaluable",
          what: "approval element",
          expectedForm: {
            kind: "schema_ref",
            ref: "urn:nomue:approval-statement:content-reviewed-responsibility-accepted:1",
          },
        };
      }
      return value === "scope_consistent" ? { kind: "satisfied" } : { kind: "violated" };
    case "report_exists":
      return view.axes.verification.value !== "none" ? { kind: "satisfied" } : { kind: "violated" };
    case "nomue_attested":
      return view.axes.verification.value === "nomue_attested"
        ? { kind: "satisfied" }
        : { kind: "violated" };
    case "not_withdrawn":
      return view.axes.disclosure.value !== "withdrawn"
        ? { kind: "satisfied" }
        : { kind: "violated" };
    case "active":
      return view.axes.disclosure.value === "active" ? { kind: "satisfied" } : { kind: "violated" };
    default:
      throw new Error(
        `unknown lifecycle predicate ${predicate}: the vocabulary is closed (NRS-CORE-0017); outcome-aggregating predicates do not exist (NRS-VERIFY-0001)`,
      );
  }
}

export interface OperationAllowed {
  result: "allowed";
  operation: string;
}

export interface OperationRefused {
  result: "refused";
  operation: string;
  reason_codes: ["NRS-LIFECYCLE-PRECONDITION-NOT-MET"];
  violated: Array<{ axis: string; predicate: string; actual: string }>;
}

export interface OperationNeedsClarification {
  result: "needs_clarification";
  clarification: {
    $schema: "urn:nomue:schema:clarification:0.1.0-draft.1";
    clarification_type: "needs_clarification";
    operation: string;
    missing: Array<{ what: string; why: string; expected_form: { kind: string; ref?: string } }>;
  };
}

export type OperationDecision = OperationAllowed | OperationRefused | OperationNeedsClarification;

/**
 * Decide an operation from the state tuple alone. Precedence: missing
 * information first (needs_clarification lists EVERYTHING missing), then
 * refusal (every violated predicate named), then allowed.
 */
export function evaluateOperation(
  operationName: string,
  view: StateView,
  registry: LifecycleOperationsRegistry,
): OperationDecision {
  const operation = registry.operations.find((o) => o.operation === operationName);
  if (operation === undefined) {
    throw new Error(`unknown lifecycle operation ${operationName}`);
  }
  const missing: OperationNeedsClarification["clarification"]["missing"] = [];
  const violated: OperationRefused["violated"] = [];
  for (const pre of operation.preconditions) {
    const outcome = evaluatePredicate(view, pre.axis, pre.predicate);
    if (outcome.kind === "not_evaluable") {
      missing.push({
        what: outcome.what,
        why: `precondition ${pre.axis}=${pre.predicate} not evaluable`,
        expected_form: outcome.expectedForm,
      });
    } else if (outcome.kind === "violated") {
      violated.push({
        axis: pre.axis,
        predicate: pre.predicate,
        actual: view.axes[pre.axis].value,
      });
    }
  }
  if (missing.length > 0) {
    return {
      result: "needs_clarification",
      clarification: {
        $schema: "urn:nomue:schema:clarification:0.1.0-draft.1",
        clarification_type: "needs_clarification",
        operation: operationName,
        missing,
      },
    };
  }
  if (violated.length > 0) {
    return {
      result: "refused",
      operation: operationName,
      reason_codes: ["NRS-LIFECYCLE-PRECONDITION-NOT-MET"],
      violated,
    };
  }
  return { result: "allowed", operation: operationName };
}
