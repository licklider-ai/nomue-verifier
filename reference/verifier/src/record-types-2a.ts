/** Structural types for a schema-validated Phase 2A Record (non-normative). */

import type { Group, Observation } from "./record-types.js";

export interface AdmissibilityDeclarations {
  grouping_structure: string;
  pairing: string;
  repeated_measurements: string;
  clustering: string;
}

export interface DataHandlingDeclarations {
  analysis_population: string;
  missing_outcomes: string;
  transformation: string;
  weighting: string;
}

export interface EffectEstimate {
  kind: string;
  estimate: number;
  standard_error: number;
  confidence_interval: {
    method_id: string;
    confidence_level: number;
    lower: number;
    upper: number;
  };
}

export interface Phase2aPayload {
  dataset: {
    dataset_id: string;
    observations: Observation[];
  };
  design: {
    design_id: string;
    dataset_id: string;
    experimental_unit_type: string;
    groups: Group[];
    group_order: string[];
    outcome: { outcome_id: string; label: string; scale: string };
    declarations: AdmissibilityDeclarations;
    data_handling: DataHandlingDeclarations;
  };
  analysis: {
    analysis_id: string;
    design_id: string;
    method_id: string;
    alternative: string;
    estimand: { kind: string; direction: string };
    confidence_level: number;
  };
  result: {
    result_id: string;
    analysis_id: string;
    group_summaries: Array<{
      group_id: string;
      n: number;
      mean: number;
      sample_variance: number;
    }>;
    effect_estimate: EffectEstimate;
    test: {
      test_statistic: number;
      degrees_of_freedom: number;
      p_value: number;
    };
  };
}

export interface Phase2aRecord {
  $schema: string;
  record_type: string;
  record_id: string;
  revision_id: string;
  created_at: string;
  interpretation_bundle_id: string;
  profile_id: string;
  payload: Phase2aPayload;
  integrity: {
    canonicalization_id: string;
    digest_algorithm: string;
    digest_scope: string;
    content_digest: string;
  };
}

export const SUPPORTED_ESTIMAND_KIND = "unstandardized_arithmetic_mean_difference";
export const SUPPORTED_ESTIMAND_DIRECTION = "group_order_first_minus_second";
export const SUPPORTED_CI_METHOD_ID = "urn:nomue:method:welch-satterthwaite-mean-difference-ci:1";
export const SUPPORTED_CONFIDENCE_LEVEL = 0.95;
