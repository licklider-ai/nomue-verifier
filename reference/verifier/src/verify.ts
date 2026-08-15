/**
 * Reference verifier entry point (non-normative implementation of the
 * normative behavior in spec/verification/ and spec/versioning/).
 *
 * Shared front: raw resource limits -> parse -> parsed resource limits ->
 * bundle-independent routing-envelope validation -> exact registry lookup
 * (NRS-VERSION-0005, NRS-VERSION-0007, NRS-VERSION-0008) -> the selected
 * bundle's own pipeline. No bundle-specific Record schema runs before a
 * bundle is selected, and no default bundle exists: a missing or non-string
 * declaration is a routing refusal, an unknown identifier an
 * unsupported-bundle refusal. When no verification report can honestly be
 * produced, a versioned refusal artifact is emitted instead (NRS-CORE-0011,
 * NRS-SEC-0004); nothing is fabricated and nothing is a partial success.
 *
 * The verifier never fetches URIs, never executes Record-supplied code, and
 * never mutates the Record (NRS-CORE-0004, NRS-SEC-0002, NRS-CORE-0008).
 */

import {
  checkParsedLimits,
  checkProcessingBudget,
  checkRawSize,
  startProcessingBudget,
  type ProcessingBudget,
} from "./limits.js";
import {
  buildRefusal,
  isDeclarableBundleId,
  REFUSAL_EXIT_CODES,
  type LimitCategory,
  type RefusalKind,
  type VerifierRefusal,
} from "./refusal.js";
import { parseStrictJson, StrictJsonError } from "./strict-json.js";
import type { VerificationReport } from "./report-types.js";
import {
  loadVerifierResources,
  PHASE1_BUNDLE_ID,
  PHASE2A_BUNDLE_ID,
  PHASE2A_021_BUNDLE_ID,
  VERIFIER_NAME,
  VERIFIER_VERSION,
  type VerifierResources,
} from "./resources.js";
import { runPhase1Bundle, type BundleRunOutcome } from "./verify-phase1.js";
import { runPhase2aBundle } from "./verify-phase2a.js";
import { runPhase2a021Bundle } from "./verify-phase2a-021.js";

export type {
  CheckResult,
  ConformanceResult,
  Evidence,
  Execution,
  Mismatch,
  Outcome,
  Scope,
  VerificationReport,
} from "./report-types.js";
export type { RefusalKind, VerifierRefusal } from "./refusal.js";

export interface VerifyOutcome {
  exitCode: 0 | 2 | 3 | 4 | 5;
  report?: VerificationReport;
  refusal?: VerifierRefusal;
}

/**
 * Implemented bundle pipelines, keyed by EXACT registered bundle identifier.
 * This table is the only place a bundle id maps to behavior; there is no
 * positional access, no "first" entry, and no fallback member.
 */
const BUNDLE_RUNNERS: Record<
  string,
  (parsed: unknown, resources: VerifierResources) => BundleRunOutcome
> = {
  [PHASE1_BUNDLE_ID]: runPhase1Bundle,
  [PHASE2A_BUNDLE_ID]: runPhase2aBundle,
  [PHASE2A_021_BUNDLE_ID]: runPhase2a021Bundle,
};

export type RoutingDecision =
  | { decision: "selected"; bundleId: string }
  | {
      decision: "refused";
      kind: "routing_error" | "unsupported_bundle";
      reasonCodes: string[];
      message: string;
      declaredBundleId?: string;
    };

/**
 * Bundle-independent routing (NRS-VERSION-0007, NRS-VERSION-0008): validate
 * only the routing envelope, then select a bundle solely by exact registered
 * identifier equality. Never consults registry order, never applies a
 * bundle-specific Record schema, never guesses from version proximity.
 */
export function routeParsedInput(parsed: unknown, resources: VerifierResources): RoutingDecision {
  if (resources.validateRoutingEnvelope(parsed) !== true) {
    const isPlainObject = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed);
    const declared = isPlainObject
      ? Object.prototype.hasOwnProperty.call(parsed, "interpretation_bundle_id")
      : false;
    if (!declared) {
      return {
        decision: "refused",
        kind: "routing_error",
        reasonCodes: ["NRS-BUNDLE-ID-MISSING"],
        message:
          "no interpretation_bundle_id could be read from the input; no bundle is selected and the Record is not interpreted",
      };
    }
    return {
      decision: "refused",
      kind: "routing_error",
      reasonCodes: ["NRS-BUNDLE-ID-INVALID"],
      message:
        "interpretation_bundle_id is not a string; no bundle is selected and the Record is not interpreted",
    };
  }
  const declaredBundle = (parsed as Record<string, unknown>)["interpretation_bundle_id"] as string;
  if (
    resources.bundles.has(declaredBundle) &&
    Object.prototype.hasOwnProperty.call(BUNDLE_RUNNERS, declaredBundle)
  ) {
    return { decision: "selected", bundleId: declaredBundle };
  }
  // A hostile or malformed identifier is omitted from the refusal rather
  // than echoed, so the refusal always conforms to its schema
  // (NRS-VERIFY-0018); nothing is fabricated or truncated.
  return {
    decision: "refused",
    kind: "unsupported_bundle",
    reasonCodes: ["NRS-UNSUPPORTED-BUNDLE"],
    message: "the declared interpretation bundle is not supported; the Record is not interpreted",
    ...(isDeclarableBundleId(declaredBundle) ? { declaredBundleId: declaredBundle } : {}),
  };
}

const LIMIT_CODES: Record<string, { code: string; category: LimitCategory }> = {
  maxRecordBytes: { code: "NRS-FILE-SIZE-LIMIT-EXCEEDED", category: "file_size" },
  maxNestingDepth: { code: "NRS-NESTING-LIMIT-EXCEEDED", category: "nesting_depth" },
  maxObservations: { code: "NRS-OBSERVATION-LIMIT-EXCEEDED", category: "observation_count" },
  maxStringLength: { code: "NRS-STRING-LIMIT-EXCEEDED", category: "string_length" },
  maxProcessingMs: { code: "NRS-TIMEOUT-LIMIT-EXCEEDED", category: "processing_timeout" },
  maxHeapBytes: { code: "NRS-MEMORY-LIMIT-EXCEEDED", category: "memory_limit" },
};

export function verifyRecordText(text: string): VerifyOutcome {
  return verifyRecordTextWithResources(text, loadVerifierResources());
}

/**
 * Refusal for input whose raw bytes are not valid UTF-8 (strict decoding,
 * no U+FFFD substitution). Used by the CLI, which owns byte-level input;
 * no JSON value was interpreted, so this is a parse-level refusal.
 */
export function refuseNonUtf8Input(inputSizeBytes: number): VerifyOutcome {
  const refusal = buildRefusal({
    kind: "parse_error",
    reasonCodes: ["NRS-PARSE-FAILED"],
    message: "input is not valid UTF-8 text; no JSON value was interpreted",
    inputSizeBytes,
    verifierName: VERIFIER_NAME,
    verifierVersion: VERIFIER_VERSION,
  });
  return { exitCode: REFUSAL_EXIT_CODES.parse_error, refusal };
}

/**
 * Same pipeline against explicitly supplied resources. Used by the
 * conformance suite's registry-order-invariance fixtures (ROUTE-007,
 * ROUTE-008) to demonstrate that permuting the bundle registry entries
 * changes nothing.
 *
 * `budget` defaults to a real wall-clock/heap budget (NRS-SEC-0006); tests
 * inject a budget whose `now`/`heapUsedBytes` report an already-exceeded
 * state so the refusal path is proven without waiting maxProcessingMs or
 * allocating maxHeapBytes.
 */
export function verifyRecordTextWithResources(
  text: string,
  resources: VerifierResources,
  budget: ProcessingBudget = startProcessingBudget(),
): VerifyOutcome {
  const inputSizeBytes = Buffer.byteLength(text, "utf8");
  const refuse = (
    kind: RefusalKind,
    reasonCodes: string[],
    message: string,
    extra?: { declaredBundleId?: string; limitCategory?: LimitCategory },
  ): VerifyOutcome => {
    const refusal = buildRefusal({
      kind,
      reasonCodes,
      message,
      inputSizeBytes,
      verifierName: VERIFIER_NAME,
      verifierVersion: VERIFIER_VERSION,
      ...(extra?.declaredBundleId === undefined
        ? {}
        : { declaredBundleId: extra.declaredBundleId }),
      ...(extra?.limitCategory === undefined ? {} : { limitCategory: extra.limitCategory }),
    });
    return { exitCode: REFUSAL_EXIT_CODES[kind], refusal };
  };

  try {
    return verifyInner(text, inputSizeBytes, refuse, resources, budget);
  } catch (err) {
    return refuse(
      "internal_error",
      ["NRS-INTERNAL-VERIFIER-ERROR"],
      `unexpected verifier failure: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Checked between pipeline phases (NRS-SEC-0006): returns a refusal outcome
 * if the processing-time or heap budget has been exceeded, otherwise null.
 * A single shared checkpoint helper so every call site maps a budget
 * violation to the same refusal shape.
 */
function checkBudgetOrNull(
  budget: ProcessingBudget,
  refuse: (
    kind: RefusalKind,
    reasonCodes: string[],
    message: string,
    extra?: { declaredBundleId?: string; limitCategory?: LimitCategory },
  ) => VerifyOutcome,
): VerifyOutcome | null {
  const violation = checkProcessingBudget(budget);
  if (violation === null) return null;
  const mapped = LIMIT_CODES[violation.limit];
  return refuse(
    "resource_limit",
    mapped === undefined
      ? ["NRS-RESOURCE-LIMIT-EXCEEDED"]
      : ["NRS-RESOURCE-LIMIT-EXCEEDED", mapped.code],
    violation.message,
    mapped === undefined ? {} : { limitCategory: mapped.category },
  );
}

function verifyInner(
  text: string,
  inputSizeBytes: number,
  refuse: (
    kind: RefusalKind,
    reasonCodes: string[],
    message: string,
    extra?: { declaredBundleId?: string; limitCategory?: LimitCategory },
  ) => VerifyOutcome,
  resources: VerifierResources,
  budget: ProcessingBudget,
): VerifyOutcome {
  const sizeViolation = checkRawSize(inputSizeBytes);
  if (sizeViolation !== null) {
    return refuse(
      "resource_limit",
      ["NRS-RESOURCE-LIMIT-EXCEEDED", "NRS-FILE-SIZE-LIMIT-EXCEEDED"],
      sizeViolation.message,
      { limitCategory: "file_size" },
    );
  }

  // Strict JCS input eligibility (NRS-CANON-0007, NRS-CANON-0008): syntax
  // first (JSON.parse), then duplicate member names, then Unicode scalar
  // validity - all before resource inspection of the parsed value, routing,
  // any bundle-specific schema, canonicalization, or digest computation.
  let parsed: unknown;
  try {
    parsed = parseStrictJson(text);
  } catch (err) {
    if (err instanceof RangeError) {
      return refuse(
        "resource_limit",
        ["NRS-RESOURCE-LIMIT-EXCEEDED", "NRS-NESTING-LIMIT-EXCEEDED"],
        "input exhausted the JSON parser",
        { limitCategory: "parser_exhaustion" },
      );
    }
    if (err instanceof StrictJsonError) {
      return refuse(
        "parse_error",
        [
          err.code === "DUPLICATE_JSON_MEMBER"
            ? "NRS-DUPLICATE-JSON-MEMBER"
            : err.code === "NEGATIVE_ZERO_NUMBER"
              ? "NRS-NEGATIVE-ZERO-NUMBER"
              : "NRS-INVALID-UNICODE-STRING",
        ],
        err.message,
      );
    }
    return refuse(
      "parse_error",
      ["NRS-PARSE-FAILED"],
      `input is not JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const limitViolations = checkParsedLimits(parsed);
  if (limitViolations.length > 0) {
    const first = limitViolations[0];
    const mapped = first === undefined ? undefined : LIMIT_CODES[first.limit];
    const codes = new Set<string>(["NRS-RESOURCE-LIMIT-EXCEEDED"]);
    for (const violation of limitViolations) {
      const entry = LIMIT_CODES[violation.limit];
      if (entry !== undefined) codes.add(entry.code);
    }
    return refuse(
      "resource_limit",
      [...codes],
      limitViolations.map((v) => v.message).join("; "),
      mapped === undefined ? {} : { limitCategory: mapped.category },
    );
  }

  const budgetAfterParse = checkBudgetOrNull(budget, refuse);
  if (budgetAfterParse !== null) return budgetAfterParse;

  // Bundle-independent routing, then exact dispatch (NRS-VERSION-0005,
  // NRS-VERSION-0007, NRS-VERSION-0008): the routing envelope is validated
  // before any bundle-specific Record schema runs, the bundle is selected
  // solely by exact registered identifier equality, and there is no default
  // bundle - a missing or non-string declaration is refused, never routed.
  const routing = routeParsedInput(parsed, resources);
  if (routing.decision === "refused") {
    return refuse(
      routing.kind,
      routing.reasonCodes,
      routing.message,
      routing.declaredBundleId === undefined ? {} : { declaredBundleId: routing.declaredBundleId },
    );
  }
  const runner = BUNDLE_RUNNERS[routing.bundleId];
  if (runner === undefined) {
    return refuse(
      "internal_error",
      ["NRS-INTERNAL-VERIFIER-ERROR"],
      "routing selected a bundle with no implemented pipeline",
    );
  }

  const budgetBeforeRun = checkBudgetOrNull(budget, refuse);
  if (budgetBeforeRun !== null) return budgetBeforeRun;

  const run = runner(parsed, resources);

  const budgetAfterRun = checkBudgetOrNull(budget, refuse);
  if (budgetAfterRun !== null) return budgetAfterRun;

  if (run.canonicalizationFailure !== undefined) {
    return refuse(
      "canonicalization_failure",
      ["NRS-NON-FINITE-NUMERIC-VALUE", "NRS-CANONICALIZATION-FAILED"],
      `the Record cannot be canonicalized: ${run.canonicalizationFailure.message}`,
    );
  }
  if (run.internalFailure !== undefined) {
    return refuse("internal_error", ["NRS-INTERNAL-VERIFIER-ERROR"], run.internalFailure.message);
  }
  if (run.report === undefined) {
    return refuse(
      "internal_error",
      ["NRS-INTERNAL-VERIFIER-ERROR"],
      "bundle run produced no report",
    );
  }
  return { exitCode: run.exitCode, report: run.report };
}
