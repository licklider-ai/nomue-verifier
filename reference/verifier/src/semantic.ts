/**
 * Semantic conformance: evaluates the registered state invariants
 * (registries/state-invariants.yaml) that schema validation cannot fully
 * express. Each violation carries the invariant's registered reason code.
 */

import type { Phase1Record } from "./record-types.js";
import { TWO_SIDED, WELCH_METHOD_ID } from "./record-types.js";

export interface InvariantViolation {
  invariant_id: string;
  reason_code: string;
  message: string;
}

export function checkStateInvariants(record: Phase1Record): InvariantViolation[] {
  const violations: InvariantViolation[] = [];
  const { dataset, design, analysis, result } = record.payload;
  const push = (invariantId: string, reasonCode: string, message: string): void => {
    violations.push({ invariant_id: invariantId, reason_code: reasonCode, message });
  };

  // Non-finite numbers can survive JSON parsing (overflow to infinity) and
  // are outside the Phase 1 numeric model.
  const nonFinite: string[] = [];
  dataset.observations.forEach((obs) => {
    if (!Number.isFinite(obs.outcome_value)) nonFinite.push(obs.observation_id);
  });
  const resultNumbers: Array<[string, number]> = [
    ["mean_difference", result.mean_difference],
    ["test_statistic", result.test_statistic],
    ["degrees_of_freedom", result.degrees_of_freedom],
    ["p_value", result.p_value],
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
    // The record is outside the numeric model; downstream invariants would
    // be meaningless, so this violation is reported alone.
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

  if (design.independence_declared !== true) {
    push(
      "independence-declared",
      "NRS-INDEPENDENCE-NOT-DECLARED",
      "the design does not declare independent groups",
    );
  }

  if (analysis.method_id !== WELCH_METHOD_ID) {
    push(
      "method-is-welch",
      "NRS-UNSUPPORTED-METHOD",
      `method ${analysis.method_id} is not supported by the Phase 1 profile`,
    );
  }
  if (analysis.alternative !== TWO_SIDED) {
    push(
      "alternative-two-sided",
      "NRS-UNSUPPORTED-ALTERNATIVE",
      `alternative ${analysis.alternative} is not supported by the Phase 1 profile`,
    );
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
