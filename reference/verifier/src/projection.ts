/**
 * Verification semantic projection: the report without generated_at and
 * verifier, used for cross-environment agreement
 * (spec/verification/verification-report.md).
 */

import { sha256HexOfUtf8 } from "./digest.js";
import { jcsCanonicalize } from "./jcs.js";
import type { VerificationReport } from "./verify.js";

export type SemanticProjection = Omit<VerificationReport, "generated_at" | "verifier">;

export function semanticProjection(report: VerificationReport): SemanticProjection {
  const { generated_at: _generatedAt, verifier: _verifier, ...rest } = report;
  return rest;
}

/** sha256: digest of the JCS canonical form of the semantic projection. */
export function semanticProjectionHash(report: VerificationReport): string {
  return `sha256:${sha256HexOfUtf8(jcsCanonicalize(JSON.parse(JSON.stringify(semanticProjection(report)))))}`;
}
