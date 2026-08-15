/**
 * RFC 8785 JSON Canonicalization Scheme (JCS) serializer.
 *
 * Reference implementation, non-normative. Correctness is cross-checked
 * differentially against an independent existing JCS implementation and the
 * pinned test vectors in canonicalization/test-vectors/.
 *
 * Notes:
 * - Member names sort by UTF-16 code units (the default JavaScript string
 *   ordering).
 * - Numbers serialize in the shortest ECMAScript round-trip form, which is
 *   exactly what JSON.stringify produces for a finite number; negative zero
 *   serializes as 0.
 * - Strings serialize with JSON.stringify, whose escaping rules match
 *   RFC 8785 (two-character escapes for the mandated control characters,
 *   lowercase \u00xx for the rest, no other escaping).
 * - NaN and infinities are outside the Phase 1 numeric model and fail closed
 *   (NRS-CANON-0005).
 */

export class CanonicalizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CanonicalizationError";
  }
}

function canonicalizeValue(value: unknown, parts: string[]): void {
  if (value === null) {
    parts.push("null");
    return;
  }
  switch (typeof value) {
    case "boolean":
      parts.push(value ? "true" : "false");
      return;
    case "number":
      if (!Number.isFinite(value)) {
        throw new CanonicalizationError("non-finite number is outside the Phase 1 numeric model");
      }
      parts.push(JSON.stringify(value));
      return;
    case "string":
      parts.push(JSON.stringify(value));
      return;
    case "object":
      break;
    default:
      throw new CanonicalizationError(`unsupported value type: ${typeof value}`);
  }
  if (Array.isArray(value)) {
    parts.push("[");
    value.forEach((item, index) => {
      if (index > 0) parts.push(",");
      canonicalizeValue(item, parts);
    });
    parts.push("]");
    return;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new CanonicalizationError("only plain JSON objects can be canonicalized");
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  parts.push("{");
  keys.forEach((key, index) => {
    if (record[key] === undefined) {
      throw new CanonicalizationError(`member ${key} has an undefined value`);
    }
    if (index > 0) parts.push(",");
    parts.push(JSON.stringify(key), ":");
    canonicalizeValue(record[key], parts);
  });
  parts.push("}");
}

/** Serialize a parsed JSON value into its RFC 8785 canonical form. */
export function jcsCanonicalize(value: unknown): string {
  if (value === undefined) {
    throw new CanonicalizationError("undefined is not a JSON value");
  }
  const parts: string[] = [];
  canonicalizeValue(value, parts);
  return parts.join("");
}
