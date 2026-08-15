/** Shared report/check-result types for both bundle pipelines (non-normative). */

export type Execution = "completed" | "not_run" | "error";
export type Outcome = "pass" | "fail" | "indeterminate";

export interface Scope {
  kind: "record" | "record_revision" | "analysis" | "result";
  id: string;
}

export interface Mismatch {
  quantity: string;
  group_id?: string;
  declared: number | string;
  recomputed: number | string;
}

export interface RecomputedWelchFlat {
  group_summaries: Array<{
    group_id: string;
    n: number;
    mean: number;
    sample_variance: number;
  }>;
  mean_difference: number;
  test_statistic: number;
  degrees_of_freedom: number;
  p_value: number;
}

export interface RecomputedWelchGuarantee {
  group_summaries: Array<{
    group_id: string;
    n: number;
    mean: number;
    sample_variance: number;
  }>;
  effect_estimate: {
    estimate: number;
    standard_error: number;
    confidence_interval: {
      confidence_level: number;
      critical_value: number;
      lower: number;
      upper: number;
    };
  };
  test: {
    test_statistic: number;
    degrees_of_freedom: number;
    p_value: number;
  };
}

export interface UnsupportedDeclaration {
  declaration: string;
  declared: string | number;
  supported: string;
}

export interface Evidence {
  declared_content_digest?: string;
  recomputed_content_digest?: string;
  standard_error?: number;
  p_value_clamped?: boolean;
  recomputed?: RecomputedWelchFlat | RecomputedWelchGuarantee;
  mismatches?: Mismatch[];
  unsupported_declarations?: UnsupportedDeclaration[];
}

export interface CheckResult {
  check_id: string;
  check_version: string;
  execution: Execution;
  outcome?: Outcome;
  scope: Scope;
  reason_codes: string[];
  evidence?: Evidence;
  error?: { error_type: string; message: string };
}

export interface ConformanceResult {
  check_id: string;
  execution: Execution;
  outcome?: Outcome;
  scope: Scope;
  reason_codes: string[];
  error?: { error_type: string; message: string };
}

export interface GuaranteeBoundaryPhase1 {
  scientific_validity: "not_asserted";
}

export interface GuaranteeBoundaryPhase2a {
  scientific_validity: "not_asserted";
  declaration_truth: "not_asserted";
  distributional_model_validity: "not_asserted";
  causal_interpretation: "not_asserted";
  standardized_effect_size: "not_asserted";
}

export interface VerificationReport {
  $schema: string;
  report_type: "nomue-verification-report";
  record_reference: {
    record_id: string;
    revision_id: string;
    content_digest: string;
  };
  interpretation_bundle_id: string;
  verifier: { name: string; version: string; source_commit: string };
  generated_at: string;
  conformance: ConformanceResult;
  verification_results: CheckResult[];
  guarantee_boundary: GuaranteeBoundaryPhase1 | GuaranteeBoundaryPhase2a;
}
