/** Unissued D1 component. No bundle dispatch, public report or forwarding API. */
import { createHash } from "node:crypto";
import { parseStrictJson } from "../../reference/verifier/src/strict-json.ts";
import { jcsCanonicalize } from "../../reference/verifier/src/jcs.ts";

export type Checkpoint = () => void;
export const LIMITS = Object.freeze({
  bytes: 2359296,
  expectedBytes: 1572864,
  depth: 36,
  nodes: 28736,
  entries: 1024,
  string: 4096,
});

export class StoredInputError extends Error {
  constructor(
    readonly kind:
      | "resource_limit"
      | "parse_error"
      | "unrepresentable_input"
      | "canonicalization_failure",
    readonly reason: string,
  ) {
    super(reason);
    this.name = "StoredInputError";
  }
}

export function parsedBounds(
  root: unknown,
  checkpoint: Checkpoint,
  target: "record" | "expected" = "record",
): void {
  const stack: { value: unknown; depth: number }[] = [
    { value: root, depth: 0 },
  ];
  let nodes = 0;
  while (stack.length) {
    checkpoint();
    const { value, depth } = stack.pop()!;
    if (++nodes > LIMITS.nodes)
      throw new StoredInputError("resource_limit", `${target}_nodes`);
    if (typeof value === "string" && value.length > LIMITS.string)
      throw new StoredInputError("resource_limit", `${target}_string`);
    if (value !== null && typeof value === "object") {
      if (depth + 1 > LIMITS.depth)
        throw new StoredInputError("resource_limit", `${target}_depth`);
      const entries = Object.entries(value);
      if (entries.length > LIMITS.entries)
        throw new StoredInputError("resource_limit", `${target}_container`);
      for (const [key, child] of entries) {
        if (key.length > LIMITS.string)
          throw new StoredInputError("resource_limit", `${target}_key`);
        stack.push({ value: child, depth: depth + 1 });
      }
    }
  }
}

/** Scan UTF-8 byte offsets, only after strict syntax/eligibility and bounds. */
function projection(bytes: Buffer, checkpoint: Checkpoint): Buffer {
  const ws = (n: number) => n === 32 || n === 9 || n === 10 || n === 13;
  const tick = (i: number) => {
    if ((i & 255) === 0) checkpoint();
  };
  const skip = (i: number) => {
    while (i < bytes.length && ws(bytes[i]!)) {
      tick(i);
      i++;
    }
    return i;
  };
  const quote = (i: number): number => {
    for (i++; i < bytes.length; i++) {
      tick(i);
      if (bytes[i] === 92) i++;
      else if (bytes[i] === 34) return i + 1;
    }
    throw new StoredInputError("canonicalization_failure", "string_span");
  };
  const valueEnd = (start: number): number => {
    if (bytes[start] === 34) return quote(start);
    if (bytes[start] === 123 || bytes[start] === 91) {
      let depth = 0;
      for (let i = start; i < bytes.length; i++) {
        tick(i);
        if (bytes[i] === 34) {
          i = quote(i) - 1;
          continue;
        }
        if (bytes[i] === 123 || bytes[i] === 91) depth++;
        else if (bytes[i] === 125 || bytes[i] === 93) {
          if (--depth === 0) return i + 1;
        }
      }
      throw new StoredInputError("canonicalization_failure", "container_span");
    }
    let i = start;
    while (
      i < bytes.length &&
      !ws(bytes[i]!) &&
      bytes[i] !== 44 &&
      bytes[i] !== 125
    ) {
      tick(i);
      i++;
    }
    return i;
  };
  let i = skip(0) + 1;
  let precedingComma: number | undefined;
  while (bytes[(i = skip(i))] !== 125) {
    checkpoint();
    const start = i;
    const keyEnd = quote(start);
    // Only this already validated string token is decoded; no raw Record bypass.
    const key = parseStrictJson(bytes.subarray(start, keyEnd).toString("utf8"));
    const end = valueEnd(skip(skip(keyEnd) + 1));
    const next = skip(end);
    if (key === "integrity") {
      const from =
        bytes[next] === 44 || precedingComma === undefined
          ? start
          : precedingComma;
      const to = bytes[next] === 44 ? next + 1 : end;
      return Buffer.concat([bytes.subarray(0, from), bytes.subarray(to)]);
    }
    if (bytes[next] === 125) break;
    precedingComma = next;
    i = next + 1;
  }
  return Buffer.from(bytes);
}

export interface StoredInspection {
  original: Buffer;
  projected: Buffer;
  value: Record<string, unknown>;
  referenceDigest: string;
  canonicalStorage: boolean;
}

/**
 * Local component inspection; caller supplies trusted shared-budget checkpoints.
 * The full invocation must still perform exact routing/schema/reference admission.
 * No result here is permission to emit a report or accept/forward bytes.
 */
export function parseStoredBytes(
  input: Uint8Array,
  checkpoint: Checkpoint,
): { original: Buffer; value: Record<string, unknown> } {
  if (
    !(input instanceof Uint8Array) ||
    input.buffer instanceof SharedArrayBuffer
  )
    throw new StoredInputError("unrepresentable_input", "record_bytes_type");
  if (input.byteLength > LIMITS.bytes)
    throw new StoredInputError("resource_limit", "record_bytes");
  checkpoint();
  const original = Buffer.from(input);
  let text: string;
  try {
    // Preserve a BOM as U+FEFF so the strict parser rejects it instead of stripping it.
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      original,
    );
  } catch {
    throw new StoredInputError("parse_error", "record_utf8");
  }
  const value = parseStrictJson(text);
  checkpoint();
  parsedBounds(value, checkpoint);
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new StoredInputError("unrepresentable_input", "record_object");
  return { original, value: value as Record<string, unknown> };
}

/** Trusted parsed snapshot only. Caller selects exact bundle before this phase. */
export function inspectParsedBytes(
  parsed: ReturnType<typeof parseStoredBytes>,
  checkpoint: Checkpoint,
): StoredInspection {
  const { original, value } = parsed;
  let canonical: Buffer;
  let canonicalProjection: Buffer;
  try {
    canonical = Buffer.from(jcsCanonicalize(value));
    const { integrity: _excluded, ...rest } = value as Record<string, unknown>;
    canonicalProjection = Buffer.from(jcsCanonicalize(rest));
  } catch {
    throw new StoredInputError(
      "canonicalization_failure",
      "record_canonicalization",
    );
  }
  checkpoint();
  let projected: Buffer;
  let checkpointFailed = false;
  try {
    projected = projection(original, () => {
      try {
        checkpoint();
      } catch (error) {
        checkpointFailed = true;
        throw error;
      }
    });
  } catch (error) {
    // Budget/cancellation failures retain their original owner and precedence.
    if (checkpointFailed || error instanceof StoredInputError) throw error;
    throw new StoredInputError("canonicalization_failure", "record_projection");
  }
  const canonicalStorage = original.equals(canonical);
  if (canonicalStorage && !projected.equals(canonicalProjection))
    throw new StoredInputError(
      "canonicalization_failure",
      "projection_disagreement",
    );
  let referenceDigest: string;
  try {
    referenceDigest =
      "sha256:" +
      createHash("sha256")
        .update("nomue/record-content/v1\n")
        .update(projected)
        .digest("hex");
  } catch {
    throw new StoredInputError("canonicalization_failure", "record_digest");
  }
  checkpoint();
  return {
    original,
    projected,
    value: value as Record<string, unknown>,
    referenceDigest,
    canonicalStorage,
  };
}

/** Byte-component convenience wrapper, without invocation routing semantics. */
export function inspectStoredBytes(
  input: Uint8Array,
  checkpoint: Checkpoint,
): StoredInspection {
  return inspectParsedBytes(parseStoredBytes(input, checkpoint), checkpoint);
}
