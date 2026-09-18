/** Versioned unissued output; completion requires private evaluation evidence. */
import { readFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import { jcsCanonicalize } from "../../reference/verifier/src/jcs.ts";
import {
  assembleResults,
  validateResults,
  GraphInvariantError,
  STAGES,
  type Stage,
  type Evaluation,
} from "./dependencies.ts";
import { type LocalInspection } from "./local-checks.ts";

export const VERSION = "0.3.0-candidate.5";
export const PROTOCOL = `unissued-holm-output/${VERSION}`;
export const BUNDLE = `https://nomue.ai/id/bundle/holm-supplied-p-bundle/${VERSION}`;
export const OUTPUT_CAP = 262144;
const ajv = new Ajv2020({
  strict: true,
  allErrors: false,
  coerceTypes: false,
  removeAdditional: false,
  useDefaults: false,
});
const shape = ajv.compile(
  JSON.parse(
    readFileSync(
      new URL("./contracts/output.schema.json", import.meta.url),
      "utf8",
    ),
  ),
);
const owned: Record<Stage, string[]> = JSON.parse(
  readFileSync(
    new URL("./contracts/reason-policy.json", import.meta.url),
    "utf8",
  ),
);
const claims = [
  "scientific_validity",
  "declaration_truth",
  "distributional_model_validity",
  "causal_interpretation",
  "standardized_effect_size",
  "familywise_error_control",
  "source_authenticity",
  "p_generation",
];
const wireId = (s: Stage) => `candidate:holm:${VERSION}:${s}`;
const toWire = (id: string) =>
  id.replace("candidate:holm:d1:", `candidate:holm:${VERSION}:`);
const toInternal = (id: string) =>
  id.replace(`candidate:holm:${VERSION}:`, "candidate:holm:d1:");
export interface Evidence {
  local: LocalInspection;
  arithmetic?: Evaluation;
}

/** Reconstruct from actual private local evaluations, never submitted rows. */
export function makeReport(evidence: Evidence): any {
  const evaluations = {
    ...evidence.local.evaluations,
    ...(evidence.arithmetic ? { A: evidence.arithmetic } : {}),
  };
  const rows = assembleResults(evaluations);
  for (const row of rows)
    if (
      row.execution !== "not_run" &&
      row.reasons.some(
        (reason) =>
          !owned[row.stage].includes(reason.replace("candidate:holm:", "")),
      )
    )
      throw new GraphInvariantError("unowned stage reason");
  const wire = rows.map(({ checkId, blockers, ...row }) => ({
    ...row,
    check_id: toWire(checkId),
    blockers: blockers.map(toWire),
    scope:
      row.stage === "H" || row.stage === "A"
        ? {
            kind: "selected_holm",
            ...(evidence.local.selection ?? { selection: "unavailable" }),
          }
        : { kind: row.stage === "C" ? "expected_context" : "record" },
  }));
  const report = {
    protocol: PROTOCOL,
    kind: "report",
    interpretation_bundle_id: BUNDLE,
    record_reference: {
      record_id: evidence.local.reference.recordId,
      revision_id: evidence.local.reference.revisionId,
      stored_projection_digest: evidence.local.reference.storedProjectionDigest,
      meaning: "inspected_bytes_not_authenticated_identity",
    },
    conformance: wire.slice(0, 4),
    verification: wire.slice(4),
    guarantee_boundary: Object.fromEntries(
      claims.map((name) => [name, "not_asserted"]),
    ),
    input_evidence: { availability: "not_observed" },
  };
  if (!shape(report)) throw new GraphInvariantError("report shape");
  return report;
}

export type RefusalKind =
  | "parse_error"
  | "routing_error"
  | "unsupported_bundle"
  | "unrepresentable_input"
  | "canonicalization_failure"
  | "resource_limit"
  | "input_access_error"
  | "unsupported_execution"
  | "execution_cancelled"
  | "internal_error";
export function refusal(kind: RefusalKind): any {
  const value = {
    protocol: PROTOCOL,
    kind: "refusal",
    refusal_kind: kind,
    reason: `candidate:holm:invocation_${kind}`,
  };
  if (!shape(value)) throw new GraphInvariantError("refusal shape");
  return value;
}

/** Structural output/graph validation. Actual evaluations are checked separately. */
export function validateWire(output: unknown): void {
  if (!shape(output)) throw new GraphInvariantError("output schema");
  const v = output as any;
  if (v.kind === "refusal") return;
  const wire = [...v.conformance, ...v.verification];
  const rows = wire.map(({ check_id, scope: _scope, ...r }: any, i: number) => {
    if (r.stage !== STAGES[i] || check_id !== wireId(STAGES[i]))
      throw new GraphInvariantError("section or identity");
    return {
      ...r,
      checkId: toInternal(check_id),
      blockers: r.blockers.map(toInternal),
    };
  });
  validateResults(rows);
  for (const row of wire) {
    if (
      row.execution !== "not_run" &&
      row.reasons.some(
        (r: string) =>
          !owned[row.stage as Stage].includes(r.replace("candidate:holm:", "")),
      )
    )
      throw new GraphInvariantError("unowned wire reason");
    const expectedKind = ["H", "A"].includes(row.stage)
      ? "selected_holm"
      : row.stage === "C"
        ? "expected_context"
        : "record";
    if (row.scope.kind !== expectedKind)
      throw new GraphInvariantError("wire scope");
  }
  if (jcsCanonicalize(wire[3].scope) !== jcsCanonicalize(wire[6].scope))
    throw new GraphInvariantError("selected scopes differ");
  if (
    (wire[0].outcome !== "pass") !==
    (wire[3].scope.selection === "unavailable")
  )
    throw new GraphInvariantError("selection availability");
}

/** Structural validation alone does not establish that the checks were run. */
export function allPass(output: any): boolean {
  validateWire(output);
  return (
    output.kind === "report" &&
    [...output.conformance, ...output.verification].every(
      (r: any) => r.execution === "completed" && r.outcome === "pass",
    )
  );
}

export function validateCompletion(output: unknown, evidence: Evidence): void {
  validateWire(output);
  if ((output as any).kind !== "report")
    throw new GraphInvariantError("report expected");
  if (jcsCanonicalize(output) !== jcsCanonicalize(makeReport(evidence)))
    throw new GraphInvariantError("output differs from private evidence");
}

export function encodeOutput(output: unknown): Buffer {
  if (!shape(output)) throw new GraphInvariantError("output schema");
  const bytes = Buffer.from(jcsCanonicalize(output));
  if (bytes.length > OUTPUT_CAP) throw new GraphInvariantError("output limit");
  return bytes;
}
