/** Structural types for a schema-validated Phase 1 Record (non-normative). */

export interface Observation {
  observation_id: string;
  experimental_unit_id: string;
  group_id: string;
  outcome_value: number;
}

export interface Group {
  group_id: string;
  label: string;
}

export interface ResultGroupSummary {
  group_id: string;
  n: number;
  mean: number;
  sample_variance: number;
}

export interface RecordPayload {
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
    independence_declared: boolean;
  };
  analysis: {
    analysis_id: string;
    design_id: string;
    method_id: string;
    alternative: string;
  };
  result: {
    result_id: string;
    analysis_id: string;
    group_summaries: ResultGroupSummary[];
    mean_difference: number;
    test_statistic: number;
    degrees_of_freedom: number;
    p_value: number;
  };
}

export interface Phase1Record {
  $schema: string;
  record_type: string;
  record_id: string;
  revision_id: string;
  created_at: string;
  interpretation_bundle_id: string;
  profile_id: string;
  payload: RecordPayload;
  integrity: {
    canonicalization_id: string;
    digest_algorithm: string;
    digest_scope: string;
    content_digest: string;
  };
}

export const WELCH_METHOD_ID = "urn:nomue:method:welch-two-sample-t:1";
export const TWO_SIDED = "two_sided";
