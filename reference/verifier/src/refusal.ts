/**
 * Versioned verifier refusal artifact (NRS-CORE-0011, NRS-VERIFY-0018,
 * NRS-SEC-0004, NRS-SEC-0005). Emitted when a normal verification report
 * cannot honestly be produced. A refusal carries no verification outcome, no
 * overall status, and no scientific-validity evaluation; it is never a
 * partial success. Fields that could not be read from the input are omitted,
 * never fabricated.
 */

export const REFUSAL_SCHEMA_ID = "urn:nomue:schema:verifier-refusal:0.2.0-draft.3";

export type RefusalKind =
  | "parse_error"
  | "routing_error"
  | "unsupported_bundle"
  | "resource_limit"
  | "canonicalization_failure"
  | "internal_error";

export type LimitCategory =
  | "file_size"
  | "nesting_depth"
  | "observation_count"
  | "string_length"
  | "parser_exhaustion"
  | "processing_timeout"
  | "memory_limit";

export interface VerifierRefusal {
  $schema: typeof REFUSAL_SCHEMA_ID;
  output_type: "nomue-verifier-refusal";
  refusal_kind: RefusalKind;
  reason_codes: string[];
  message: string;
  declared_bundle_id?: string;
  limit_category?: LimitCategory;
  verifier: { name: string; version: string };
  input_evidence: { input_size_bytes: number };
  generated_at: string;
}

/** Exit code for each refusal kind (documented in the verifier README). */
export const REFUSAL_EXIT_CODES: Record<RefusalKind, 2 | 3 | 4 | 5> = {
  parse_error: 2,
  canonicalization_failure: 2,
  routing_error: 3,
  unsupported_bundle: 3,
  resource_limit: 4,
  internal_error: 5,
};

/**
 * Whether a declared bundle identifier can be carried in a refusal without
 * violating the refusal schema's uri constraints. Hostile or malformed
 * identifiers are omitted instead of echoed (fields that cannot be carried
 * faithfully are omitted, never fabricated or truncated).
 */
export function isDeclarableBundleId(value: string): boolean {
  return value.length >= 3 && value.length <= 2048 && /^[A-Za-z][A-Za-z0-9+.-]*:\S+$/.test(value);
}

export interface RefusalOptions {
  kind: RefusalKind;
  reasonCodes: string[];
  message: string;
  inputSizeBytes: number;
  verifierName: string;
  verifierVersion: string;
  declaredBundleId?: string;
  limitCategory?: LimitCategory;
}

export function buildRefusal(options: RefusalOptions): VerifierRefusal {
  return {
    $schema: REFUSAL_SCHEMA_ID,
    output_type: "nomue-verifier-refusal",
    refusal_kind: options.kind,
    reason_codes: options.reasonCodes,
    message: options.message,
    ...(options.declaredBundleId === undefined
      ? {}
      : { declared_bundle_id: options.declaredBundleId }),
    ...(options.limitCategory === undefined ? {} : { limit_category: options.limitCategory }),
    verifier: { name: options.verifierName, version: options.verifierVersion },
    input_evidence: { input_size_bytes: options.inputSizeBytes },
    generated_at: new Date().toISOString(),
  };
}
