/**
 * Phase 2A semantic conformance and profile admissibility.
 *
 * Semantic conformance covers structural coherence (references, uniqueness,
 * group order, summary order, numeric domain). Profile admissibility
 * (NRS-VERIFY-0013) evaluates whether the DECLARED Record structure lies
 * inside the ITGC guarantee boundary; it never asserts that any declaration
 * is true in the real world (NRS-CORE-0009).
 */

import type { InvariantViolation } from "./semantic.js";
import {
  SUPPORTED_CI_METHOD_ID,
  SUPPORTED_CONFIDENCE_LEVEL,
  SUPPORTED_ESTIMAND_DIRECTION,
  SUPPORTED_ESTIMAND_KIND,
  type Phase2aRecord,
} from "./record-types-2a.js";
import type { UnsupportedDeclaration } from "./report-types.js";
import { TWO_SIDED, WELCH_METHOD_ID } from "./record-types.js";

export function checkStateInvariants2a(record: Phase2aRecord): InvariantViolation[] {
  const violations: InvariantViolation[] = [];
  const { dataset, design, analysis, result } = record.payload;
  const push = (invariantId: string, reasonCode: string, message: string): void => {
    violations.push({ invariant_id: invariantId, reason_code: reasonCode, message });
  };

  const nonFinite: string[] = [];
  dataset.observations.forEach((obs) => {
    if (!Number.isFinite(obs.outcome_value)) nonFinite.push(obs.observation_id);
  });
  const resultNumbers: Array<[string, number]> = [
    ["effect_estimate.estimate", result.effect_estimate.estimate],
    ["effect_estimate.standard_error", result.effect_estimate.standard_error],
    ["confidence_interval.lower", result.effect_estimate.confidence_interval.lower],
    ["confidence_interval.upper", result.effect_estimate.confidence_interval.upper],
    ["test.test_statistic", result.test.test_statistic],
    ["test.degrees_of_freedom", result.test.degrees_of_freedom],
    ["test.p_value", result.test.p_value],
  ];
  result.group_summaries.forEach((s) => {
    resultNumbers.push(
      [`mean(${s.group_id})`, s.mean],
      [`sample_variance(${s.group_id})`, s.sample_variance],
    );
  });
  for (const [name, value] of resultNumbers) {
    if (!Number.isFinite(value)) nonFinite.push(name);
  }
  if (nonFinite.length > 0) {
    push(
      "numeric-domain-finite",
      "NRS-NON-FINITE-NUMERIC-VALUE",
      `non-finite numeric value(s): ${nonFinite.join(", ")}`,
    );
    return violations;
  }

  if (design.dataset_id !== dataset.dataset_id) {
    push(
      "dataset-ref-resolves",
      "NRS-SEMANTIC-CONFORMANCE-FAILED",
      `design.dataset_id ${design.dataset_id} does not resolve to the declared dataset`,
    );
  }
  if (analysis.design_id !== design.design_id) {
    push(
      "design-ref-resolves",
      "NRS-SEMANTIC-CONFORMANCE-FAILED",
      `analysis.design_id ${analysis.design_id} does not resolve to the declared design`,
    );
  }
  if (result.analysis_id !== analysis.analysis_id) {
    push(
      "result-references-analysis",
      "NRS-SEMANTIC-CONFORMANCE-FAILED",
      `result.analysis_id ${result.analysis_id} does not resolve to the declared analysis`,
    );
  }

  const declaredGroupIds = design.groups.map((g) => g.group_id);
  if (declaredGroupIds.length !== 2 || new Set(declaredGroupIds).size !== 2) {
    push(
      "exactly-two-groups",
      "NRS-GROUP-COUNT-NOT-TWO",
      `the profile requires exactly two distinct groups, found ${declaredGroupIds.length}`,
    );
  }

  const orderSet = new Set(design.group_order);
  const groupSet = new Set(declaredGroupIds);
  const isPermutation =
    design.group_order.length === declaredGroupIds.length &&
    orderSet.size === design.group_order.length &&
    [...orderSet].every((id) => groupSet.has(id));
  if (!isPermutation) {
    push(
      "group-order-permutation",
      "NRS-SEMANTIC-CONFORMANCE-FAILED",
      "group_order is not a permutation of the declared group_ids",
    );
  }

  const seenObservations = new Set<string>();
  const seenUnits = new Set<string>();
  for (const obs of dataset.observations) {
    if (seenObservations.has(obs.observation_id)) {
      push(
        "observation-ids-unique",
        "NRS-DUPLICATE-OBSERVATION-ID",
        `duplicate observation_id ${obs.observation_id}`,
      );
    }
    seenObservations.add(obs.observation_id);
    if (seenUnits.has(obs.experimental_unit_id)) {
      push(
        "experimental-unit-ids-unique",
        "NRS-DUPLICATE-EXPERIMENTAL-UNIT",
        `experimental_unit_id ${obs.experimental_unit_id} occurs in more than one observation`,
      );
    }
    seenUnits.add(obs.experimental_unit_id);
    if (!groupSet.has(obs.group_id)) {
      push(
        "observation-group-resolves",
        "NRS-UNKNOWN-GROUP",
        `observation ${obs.observation_id} references undeclared group ${obs.group_id}`,
      );
    }
  }

  for (const groupId of declaredGroupIds) {
    const size = dataset.observations.filter((o) => o.group_id === groupId).length;
    if (size < 2) {
      push(
        "group-min-size",
        "NRS-GROUP-SIZE-BELOW-TWO",
        `group ${groupId} has ${size} observation(s); at least two are required`,
      );
    }
  }

  const summariesMatchOrder =
    result.group_summaries.length === design.group_order.length &&
    result.group_summaries.every((s, i) => s.group_id === design.group_order[i]);
  if (!summariesMatchOrder) {
    push(
      "result-summaries-match-group-order",
      "NRS-SEMANTIC-CONFORMANCE-FAILED",
      "result.group_summaries do not follow design.group_order",
    );
  }

  return violations;
}

export interface AdmissibilityViolation {
  reason_code: string;
  declaration: UnsupportedDeclaration;
}

/**
 * Evaluate the declared ITGC guarantee boundary. Judgment basis:
 * declared_record_structure only.
 */
export function checkAdmissibility(record: Phase2aRecord): AdmissibilityViolation[] {
  const violations: AdmissibilityViolation[] = [];
  const { design, analysis } = record.payload;
  const declare = (
    reasonCode: string,
    declaration: string,
    declared: string | number,
    supported: string,
  ): void => {
    violations.push({
      reason_code: reasonCode,
      declaration: { declaration, declared, supported },
    });
  };

  if (design.declarations.pairing !== "none") {
    declare(
      "NRS-PAIRING-NOT-SUPPORTED",
      "design.declarations.pairing",
      design.declarations.pairing,
      "none",
    );
  }
  if (design.declarations.repeated_measurements !== "none") {
    declare(
      "NRS-REPEATED-MEASURES-NOT-SUPPORTED",
      "design.declarations.repeated_measurements",
      design.declarations.repeated_measurements,
      "none",
    );
  }
  if (design.declarations.clustering !== "none_declared") {
    declare(
      "NRS-CLUSTERING-NOT-SUPPORTED",
      "design.declarations.clustering",
      design.declarations.clustering,
      "none_declared",
    );
  }
  if (design.data_handling.analysis_population !== "all_record_observations") {
    declare(
      "NRS-SUBSET-ANALYSIS-NOT-SUPPORTED",
      "design.data_handling.analysis_population",
      design.data_handling.analysis_population,
      "all_record_observations",
    );
  }
  if (design.data_handling.missing_outcomes !== "none") {
    declare(
      "NRS-MISSING-OUTCOMES-NOT-SUPPORTED",
      "design.data_handling.missing_outcomes",
      design.data_handling.missing_outcomes,
      "none",
    );
  }
  if (design.data_handling.transformation !== "none") {
    declare(
      "NRS-TRANSFORMATION-NOT-SUPPORTED",
      "design.data_handling.transformation",
      design.data_handling.transformation,
      "none",
    );
  }
  if (design.data_handling.weighting !== "none") {
    declare(
      "NRS-WEIGHTING-NOT-SUPPORTED",
      "design.data_handling.weighting",
      design.data_handling.weighting,
      "none",
    );
  }
  if (analysis.method_id !== WELCH_METHOD_ID) {
    declare("NRS-UNSUPPORTED-METHOD", "analysis.method_id", analysis.method_id, WELCH_METHOD_ID);
  }
  if (analysis.alternative !== TWO_SIDED) {
    declare("NRS-UNSUPPORTED-ALTERNATIVE", "analysis.alternative", analysis.alternative, TWO_SIDED);
  }
  if (
    analysis.estimand.kind !== SUPPORTED_ESTIMAND_KIND ||
    analysis.estimand.direction !== SUPPORTED_ESTIMAND_DIRECTION
  ) {
    declare(
      "NRS-UNSUPPORTED-ESTIMAND",
      "analysis.estimand",
      `${analysis.estimand.kind}/${analysis.estimand.direction}`,
      `${SUPPORTED_ESTIMAND_KIND}/${SUPPORTED_ESTIMAND_DIRECTION}`,
    );
  }
  if (analysis.confidence_level !== SUPPORTED_CONFIDENCE_LEVEL) {
    declare(
      "NRS-CONFIDENCE-LEVEL-MISMATCH",
      "analysis.confidence_level",
      analysis.confidence_level,
      String(SUPPORTED_CONFIDENCE_LEVEL),
    );
  }
  return violations;
}

export { SUPPORTED_CI_METHOD_ID };
