/**
 * Strict JCS input eligibility (NRS-CANON-0007, NRS-CANON-0008).
 *
 * RFC 8785 JCS presumes I-JSON-shaped input: object member names are unique
 * and every JSON string is a valid Unicode scalar-value sequence. Plain
 * `JSON.parse` silently collapses duplicate member names (last member wins)
 * BEFORE anything downstream can see them, which would let the same raw
 * bytes route, validate, canonicalize, and hash differently across verifier
 * implementations. This module therefore scans the RAW JSON text - after
 * syntax has been established by `JSON.parse`, before any value is used -
 * and rejects:
 *
 *  - duplicate object member names at ANY depth (including objects inside
 *    arrays), compared AFTER escape decoding, even when the values are
 *    identical (no first-wins, no last-wins);
 *  - JSON strings (member names and values alike) whose escape-decoded
 *    code-unit sequence contains an unpaired surrogate (not representable
 *    as Unicode scalar values).
 *
 * The scanner is NOT a JSON parser: syntax authority stays with
 * `JSON.parse` (which runs first, so malformed input is a plain parse
 * failure). The scanner only tokenizes strings and tracks the container
 * stack over input that is already known to be valid JSON. It is fully
 * iterative (no recursion), performs no Unicode normalization, and treats
 * NFC/NFD sequences as the distinct code-point sequences they are.
 */

export type StrictJsonErrorCode =
  "DUPLICATE_JSON_MEMBER" | "INVALID_UNICODE_STRING" | "NEGATIVE_ZERO_NUMBER";

export class StrictJsonError extends Error {
  readonly code: StrictJsonErrorCode;
  /** UTF-16 code-unit offset of the offending string opening quote. */
  readonly position: number;
  constructor(code: StrictJsonErrorCode, position: number, message: string) {
    super(message);
    this.name = "StrictJsonError";
    this.code = code;
    this.position = position;
  }
}

interface ScanIssue {
  code: StrictJsonErrorCode;
  position: number;
}

const SINGLE_ESCAPES: Record<string, number> = {
  '"': 0x22,
  "\\": 0x5c,
  "/": 0x2f,
  b: 0x08,
  f: 0x0c,
  n: 0x0a,
  r: 0x0d,
  t: 0x09,
};

const isHighSurrogate = (unit: number): boolean => unit >= 0xd800 && unit <= 0xdbff;
const isLowSurrogate = (unit: number): boolean => unit >= 0xdc00 && unit <= 0xdfff;

interface ObjectFrame {
  kind: "object";
  names: Set<string>;
}
interface ArrayFrame {
  kind: "array";
}
type Frame = ObjectFrame | ArrayFrame;

/**
 * Scan syntactically valid JSON text and collect every eligibility issue.
 * Exposed for the differential cross-check; callers wanting fail-closed
 * behavior use `assertStrictJsonEligible`.
 */
export function scanStrictJsonIssues(text: string): ScanIssue[] {
  const issues: ScanIssue[] = [];
  const n = text.length;
  let i = 0;

  const skipWs = (): void => {
    while (i < n) {
      const c = text.charCodeAt(i);
      if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d) i += 1;
      else break;
    }
  };

  /**
   * Read the string whose opening quote is at `i`; returns the
   * escape-decoded code units when `wantDecoded` (member names need the
   * decoded value for duplicate comparison; plain values only need
   * surrogate validation). Records unicode issues as it decodes.
   */
  const readString = (wantDecoded: boolean): string | null => {
    const start = i;
    i += 1; // opening quote
    const units: number[] = [];
    let pendingHigh = false;
    const emit = (unit: number): void => {
      if (pendingHigh) {
        if (isLowSurrogate(unit)) {
          pendingHigh = false;
        } else {
          // The pending high surrogate is unpaired; the current unit may
          // itself be a high surrogate that starts a new (possibly valid)
          // pair, so it is not consumed by the failure.
          issues.push({ code: "INVALID_UNICODE_STRING", position: start });
          pendingHigh = isHighSurrogate(unit);
        }
      } else if (isHighSurrogate(unit)) {
        pendingHigh = true;
      } else if (isLowSurrogate(unit)) {
        issues.push({ code: "INVALID_UNICODE_STRING", position: start });
      }
      if (wantDecoded) units.push(unit);
    };
    while (i < n && text[i] !== '"') {
      if (text[i] === "\\") {
        const esc = text[i + 1] as string;
        if (esc === "u") {
          emit(Number.parseInt(text.slice(i + 2, i + 6), 16));
          i += 6;
        } else {
          emit(SINGLE_ESCAPES[esc] as number);
          i += 2;
        }
      } else {
        emit(text.charCodeAt(i));
        i += 1;
      }
    }
    if (pendingHigh) {
      issues.push({ code: "INVALID_UNICODE_STRING", position: start });
    }
    i += 1; // closing quote
    if (!wantDecoded) return null;
    let decoded = "";
    for (let j = 0; j < units.length; j += 1024) {
      decoded += String.fromCharCode(...units.slice(j, j + 1024));
    }
    return decoded;
  };

  /** Read a member name into the frame, then position after the colon. */
  const readMemberName = (frame: ObjectFrame): void => {
    skipWs();
    const position = i;
    const name = readString(true) as string;
    if (frame.names.has(name)) {
      issues.push({ code: "DUPLICATE_JSON_MEMBER", position });
    }
    frame.names.add(name);
    skipWs();
    i += 1; // colon
  };

  const stack: Frame[] = [];
  let mode: "value" | "after" = "value";

  for (;;) {
    if (mode === "value") {
      skipWs();
      const ch = text[i];
      if (ch === "{") {
        i += 1;
        skipWs();
        if (text[i] === "}") {
          i += 1;
          mode = "after";
        } else {
          const frame: ObjectFrame = { kind: "object", names: new Set() };
          stack.push(frame);
          readMemberName(frame);
          mode = "value";
        }
      } else if (ch === "[") {
        i += 1;
        skipWs();
        if (text[i] === "]") {
          i += 1;
          mode = "after";
        } else {
          stack.push({ kind: "array" });
          mode = "value";
        }
      } else if (ch === '"') {
        readString(false);
        mode = "after";
      } else {
        // Scalar (number, true, false, null): none may contain structural
        // characters, so consume to the next delimiter or whitespace.
        const scalarStart = i;
        while (i < n) {
          const c = text[i] as string;
          if (c === "," || c === "}" || c === "]") break;
          const code = text.charCodeAt(i);
          if (code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0d) break;
          i += 1;
        }
        // Negative zero rejection (NRS-CANON-0015, Batch 5): a number token
        // whose numeric value is negative zero (-0, -0.0, -0e5, ...) is
        // rejected at this lexical stage - RFC 8785 Erratum 7920's SHOULD,
        // raised to a MUST by this specification. Detected on the raw token
        // (a leading minus with numeric value zero), never on the parsed
        // value, where JSON.parse has already produced -0 silently.
        if (text[scalarStart] === "-") {
          const token = text.slice(scalarStart, i);
          if (Number(token) === 0) {
            issues.push({ code: "NEGATIVE_ZERO_NUMBER", position: scalarStart });
          }
        }
        mode = "after";
      }
    } else {
      skipWs();
      const frame = stack[stack.length - 1];
      if (frame === undefined) break; // top-level value complete
      if (frame.kind === "object") {
        if (text[i] === ",") {
          i += 1;
          readMemberName(frame);
          mode = "value";
        } else {
          i += 1; // closing brace
          stack.pop();
          mode = "after";
        }
      } else {
        if (text[i] === ",") {
          i += 1;
          mode = "value";
        } else {
          i += 1; // closing bracket
          stack.pop();
          mode = "after";
        }
      }
    }
  }

  return issues;
}

/**
 * Reject JCS-ineligible input, duplicates first (the fixed pre-routing
 * priority: malformed syntax, then duplicate members, then invalid Unicode;
 * syntax is enforced by the caller running JSON.parse beforehand).
 */
export function assertStrictJsonEligible(text: string): void {
  const issues = scanStrictJsonIssues(text);
  const duplicate = issues.find((issue) => issue.code === "DUPLICATE_JSON_MEMBER");
  if (duplicate !== undefined) {
    throw new StrictJsonError(
      "DUPLICATE_JSON_MEMBER",
      duplicate.position,
      `duplicate object member name at character offset ${duplicate.position} (member names are compared after escape decoding); the input is rejected without selecting first-wins or last-wins semantics`,
    );
  }
  const unicode = issues.find((issue) => issue.code === "INVALID_UNICODE_STRING");
  if (unicode !== undefined) {
    throw new StrictJsonError(
      "INVALID_UNICODE_STRING",
      unicode.position,
      `JSON string starting at character offset ${unicode.position} contains an unpaired surrogate and is not a valid Unicode scalar-value sequence; nothing is replaced, normalized, or discarded`,
    );
  }
  const negativeZero = issues.find((issue) => issue.code === "NEGATIVE_ZERO_NUMBER");
  if (negativeZero !== undefined) {
    throw new StrictJsonError(
      "NEGATIVE_ZERO_NUMBER",
      negativeZero.position,
      `number token at character offset ${negativeZero.position} is negative zero; this specification rejects -0 input as a MUST (raised from RFC 8785 Erratum 7920's SHOULD) instead of silently normalizing it to 0`,
    );
  }
}

/**
 * The single strict input path shared by every CLI entry point: syntax via
 * JSON.parse (malformed input and parser exhaustion surface here first),
 * then JCS eligibility on the raw text, then the parsed value is released
 * to the caller. No raw verifier input may be parsed anywhere else.
 */
export function parseStrictJson(text: string): unknown {
  const parsed: unknown = JSON.parse(text);
  assertStrictJsonEligible(text);
  return parsed;
}
