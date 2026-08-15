/**
 * Ingress gate (Batch 5, E2', NRS-CANON-0016): the point at which a byte
 * sequence is FIRST accepted as a stored/exchanged Record. The storage and
 * exchange form of a Record is the canonical byte sequence itself; ingress
 * therefore performs canonicalize-then-compare plus the input-stage
 * constraints (duplicate members, invalid Unicode, negative zero - the Y1
 * MUSTs) and REJECTS non-canonical bytes explicitly. It never "helpfully"
 * re-canonicalizes and stores its own output: silently rewriting the bytes
 * at the trust boundary is exactly the pre-storage attack surface this
 * gate exists to close (see the Matrix Canonical JSON incident cited
 * informatively in canonicalization/record-canonicalization.md).
 *
 * On acceptance the ORIGINAL input string is returned - byte-identical to
 * what was verified - matching the DSSE discipline of NRS-VERIFY-0027:
 * the bytes that were verified are the bytes handed onward; nothing is
 * re-serialized after the check.
 */

import { jcsCanonicalize } from "./jcs.js";
import { checkRawSize } from "./limits.js";
import { parseStrictJson } from "./strict-json.js";

export type IngressRejectionReason =
  "size_limit" | "not_json" | "strict_json_violation" | "not_canonical_bytes";

export interface IngressResult {
  accepted: boolean;
  /** Present exactly when accepted: the ORIGINAL input, unmodified. */
  bytes?: string;
  reason?: IngressRejectionReason;
  detail?: string;
}

export function ingressAcceptCanonicalBytes(text: string): IngressResult {
  const sizeViolation = checkRawSize(Buffer.byteLength(text, "utf8"));
  if (sizeViolation !== null) {
    return { accepted: false, reason: "size_limit", detail: sizeViolation.message };
  }

  let parsed: unknown;
  try {
    parsed = parseStrictJson(text);
  } catch (err) {
    const isStrict = err instanceof Error && err.name === "StrictJsonError";
    return {
      accepted: false,
      reason: isStrict ? "strict_json_violation" : "not_json",
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  let canonical: string;
  try {
    canonical = jcsCanonicalize(parsed as Record<string, unknown>);
  } catch (err) {
    return {
      accepted: false,
      reason: "not_json",
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  if (canonical !== text) {
    return {
      accepted: false,
      reason: "not_canonical_bytes",
      detail:
        "input is valid JSON but is not the canonical byte sequence; ingress rejects instead of re-canonicalizing (the caller re-emits canonically, this gate never rewrites bytes)",
    };
  }

  return { accepted: true, bytes: text };
}
