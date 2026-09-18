/** Test-only expectations authored from D0; no candidate evaluator/graph imports. */
import { baseRecord, seal, context } from "./outer-fixtures.ts";
import { jcsCanonicalize } from "../../reference/verifier/src/jcs.ts";

export const recordColumns = [
  "valid",
  "schema",
  "storage",
  "relations",
  "digest",
  "relations-digest",
  "storage-relations",
] as const;
export const contextColumns = [
  "match",
  "missing",
  "syntax",
  "duplicate",
  "surrogate",
  "bom",
  "negative-zero",
  "array",
  "missing-field",
  "extra-field",
  "record-id",
  "revision-id",
  "unselected",
  "order",
] as const;
export type RecordColumn = (typeof recordColumns)[number];
type ContextColumn = (typeof contextColumns)[number];
type Stage = "S" | "K" | "D" | "H" | "I" | "C" | "A";
export interface ExpectedRow {
  stage: Stage;
  check_id: string;
  execution: "completed" | "error" | "not_run";
  outcome?: "pass" | "fail";
  reasons: string[];
  blockers: string[];
}
const reason = (s: string) => `candidate:holm:${s}`;
const id = (s: Stage) => `candidate:holm:0.3.0-candidate.5:${s}`;
function row(
  stage: Stage,
  state: "pass" | "fail" | "error" | "not_run",
  reasons: string[] = [],
  blockers: Stage[] = [],
): ExpectedRow {
  return {
    stage,
    check_id: id(stage),
    execution: state === "pass" || state === "fail" ? "completed" : state,
    ...(state === "pass" || state === "fail" ? { outcome: state } : {}),
    reasons: reasons.map(reason),
    blockers: blockers.map(id),
  };
}

// Closed-form expected rows, not DEPENDS/assembleResults or observed output.
// The chosen D0 perturbation has exactly two independently specified reasons.
export function expectedRows(
  column: RecordColumn,
  c: "pass" | "fail" | "error",
  cReason?: string,
): ExpectedRow[] {
  if (column === "schema") {
    const r = ["record_schema"];
    return [
      row("S", "fail", r),
      row("K", "not_run", r, ["S"]),
      row("D", "not_run", r, ["S"]),
      row("H", "not_run", r, ["D"]),
      row("I", "not_run", r, ["S", "K"]),
      row("C", "not_run", r, ["S"]),
      row("A", "not_run", r, ["K", "D", "H", "I", "C"]),
    ];
  }
  const k = column === "storage" || column === "storage-relations";
  const d = ["relations", "relations-digest", "storage-relations"].includes(
    column,
  );
  const i = column === "digest" || column === "relations-digest";
  const kr = k ? ["stored_bytes_noncanonical"] : [];
  const dr = d ? ["d0_unit_group_mismatch", "d0_unit_group_ref"] : [];
  const ir = i ? ["digest_mismatch"] : [];
  const cr = cReason ? [cReason] : [];
  const blockers: Stage[] = [];
  if (k) blockers.push("K");
  if (d) blockers.push("D", "H");
  if (k || i) blockers.push("I");
  if (c !== "pass") blockers.push("C");
  return [
    row("S", "pass"),
    row("K", k ? "fail" : "pass", kr),
    row("D", d ? "fail" : "pass", dr),
    d ? row("H", "not_run", dr, ["D"]) : row("H", "pass"),
    k ? row("I", "not_run", kr, ["K"]) : row("I", i ? "fail" : "pass", ir),
    row("C", c, cr),
    row(
      "A",
      blockers.length ? "not_run" : "pass",
      [...kr, ...dr, ...ir, ...cr],
      blockers,
    ),
  ];
}

export interface ContextCase {
  id: string;
  column: RecordColumn;
  contextColumn: ContextColumn;
  bytes: Buffer;
  expected: string | undefined;
  rows: ExpectedRow[];
  forward: boolean;
}
export function contextMatrix(): ContextCase[] {
  const cases: ContextCase[] = [];
  for (const column of recordColumns) {
    const r = baseRecord();
    // Expected input is independently supplied fixture material. The matching
    // invalid-D0 fixture is deliberately edited on both sides during authoring;
    // no verifier may construct its expected context from submitted Record bytes.
    const target = JSON.parse(context());
    if (
      ["relations", "relations-digest", "storage-relations"].includes(column)
    ) {
      r.payload.declaration.design.units[0].group_id = "missing";
      target.declaration.design.units[0].group_id = "missing";
    }
    if (column === "schema") r.payload = {};
    let bytes = seal(r);
    if (column === "digest" || column === "relations-digest") {
      r.integrity.content_digest = "sha256:" + "0".repeat(64);
      bytes = Buffer.from(jcsCanonicalize(r));
    }
    if (column === "storage" || column === "storage-relations")
      bytes = Buffer.concat([bytes, Buffer.from("\n")]);
    for (const contextColumn of contextColumns) {
      const e = structuredClone(target);
      let expected: string | undefined = JSON.stringify(e);
      let state: "pass" | "fail" | "error" = "pass";
      let code: string | undefined;
      switch (contextColumn) {
        case "missing":
          expected = undefined;
          code = "expected_missing";
          break;
        case "syntax":
          expected = "{";
          code = "expected_parse";
          break;
        case "duplicate":
          expected = '{"x":1,"x":2}';
          code = "expected_parse";
          break;
        case "surrogate":
          expected = '{"x":"\\ud800"}';
          code = "expected_parse";
          break;
        case "bom":
          expected = "\ufeff" + expected;
          code = "expected_parse";
          break;
        case "negative-zero":
          expected = '{"x":-0.0}';
          code = "expected_parse";
          break;
        case "array":
          expected = "[]";
          code = "expected_schema";
          break;
        case "missing-field":
          delete e.inputs;
          expected = JSON.stringify(e);
          code = "expected_schema";
          break;
        case "extra-field":
          e.extra = true;
          expected = JSON.stringify(e);
          code = "expected_schema";
          break;
        case "record-id":
          e.record_id = "urn:independent-other-record";
          break;
        case "revision-id":
          e.revision_id = "urn:independent-other-revision";
          break;
        case "unselected":
          e.declaration.analyses[1].population.definition =
            "Different unselected declaration";
          break;
        case "order":
          e.declaration.analyses.reverse();
          break;
      }
      if (
        ["record-id", "revision-id", "unselected", "order"].includes(
          contextColumn,
        )
      ) {
        expected = JSON.stringify(e);
        state = "fail";
        code = "context_mismatch";
      } else if (code) state = "error";
      cases.push({
        id: `CTX-${column}-${contextColumn}`,
        column,
        contextColumn,
        bytes: Buffer.from(bytes),
        expected,
        rows: expectedRows(column, state, code),
        forward: column === "valid" && contextColumn === "match",
      });
    }
  }
  return cases;
}
