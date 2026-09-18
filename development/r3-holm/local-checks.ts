/** Unissued pre-arithmetic component. No public report, dispatch or forwarding. */
import { readFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import {
  parseStrictJson,
  StrictJsonError,
} from "../../reference/verifier/src/strict-json.ts";
import { jcsCanonicalize } from "../../reference/verifier/src/jcs.ts";
import { checkD0Relations } from "./d0-relations.ts";
import {
  inspectStoredBytes,
  parsedBounds,
  LIMITS,
  StoredInputError,
  type Checkpoint,
} from "./stored-bytes.ts";
import { type Evaluation, type Stage } from "./dependencies.ts";

const read = (name: string) =>
  JSON.parse(
    readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"),
  );
const recordSchema = read("record.schema.json");
const ajv = new Ajv2020({
  strict: true,
  allErrors: false,
  coerceTypes: false,
  removeAdditional: false,
  useDefaults: false,
});
const schema = ajv.compile(recordSchema);
const expectedSchema = ajv.compile(read("expected.schema.json"));
const identity = ajv.compile(recordSchema.properties.record_id);
const bundle: string = recordSchema.properties.interpretation_bundle_id.const;
const shapes: Record<string, string> = read(
  "declaration-shapes.json",
).legacy_adapter;

export class LocalInputError extends Error {
  constructor(
    readonly kind:
      "routing_error" | "unsupported_bundle" | "unrepresentable_input",
    readonly reason: string,
  ) {
    super(reason);
    this.name = "LocalInputError";
  }
}

/** A trusted acquisition adapter may wrap only an expected-input access failure. */
export class ExpectedContextAccessError extends Error {}

const result = (reasons: string[] = []): Evaluation => ({
  execution: "completed",
  outcome: reasons.length ? "fail" : "pass",
  reasons: reasons.map((r) => `candidate:holm:${r}`),
});
const contextError = (reason: string): Evaluation => ({
  execution: "error",
  reasons: [`candidate:holm:${reason}`],
});

// Schema-admitted objects only below this boundary. The original D0 vocabulary is
// adapted on a private clone, preserving operation_kind in the inspected Record.
function legacyDeclaration(d: any): any {
  const out = structuredClone(d);
  out.artifact_kind = "unissued-d0-declaration-exercise";
  for (const x of [...out.analyses, ...out.result_slots]) {
    x.contract_ref = shapes[x.operation_kind];
    delete x.operation_kind;
  }
  for (const x of out.result_slots)
    x.payload_status = "method_payload_deferred";
  return out;
}

// Retain candidate.4's bridge size guards before its relational work. Shared
// Record/expected document bounds have one owner in stored-bytes.ts.
function localBounds(d: any, payload: any, checkpoint: Checkpoint): void {
  for (const [v, cap] of [
    [d.design.groups, 16],
    [d.design.units, 1024],
    [d.dataset.observations, 1024],
    [d.analyses, 16],
    [d.families, 16],
    [d.result_slots, 16],
  ] as const)
    if (v.length > cap)
      throw new StoredInputError("resource_limit", "d0_count");
  for (const f of d.families)
    if (f.members.length > 120)
      throw new StoredInputError("resource_limit", "d0_member_count");
  const inputs = {
    ...payload.inputs,
    kind: "unissued-holm-binding-input-v0",
    revision: "internal-bound-revision",
  };
  const values = [
    d,
    inputs,
    {
      kind: "unissued-holm-binding-evidence-v0",
      binding: { declaration: d, inputs },
      adjusted: payload.result.adjusted,
    },
  ];
  const caps = [
    { bytes: 1048576, depth: 32, nodes: 24576 },
    { bytes: 262144, depth: 32, nodes: 2048 },
    { bytes: 2097152, depth: 34, nodes: 28672 },
  ];
  values.forEach((value, i) => {
    const cap = caps[i]!;
    if (Buffer.byteLength(jcsCanonicalize(value)) > cap.bytes)
      throw new StoredInputError("resource_limit", "legacy_bytes");
    const stack = [{ value, depth: 0 }];
    let nodes = 0;
    while (stack.length) {
      checkpoint();
      const { value: v, depth } = stack.pop()!;
      if (++nodes > cap.nodes)
        throw new StoredInputError("resource_limit", "legacy_nodes");
      if (v !== null && typeof v === "object") {
        if (depth + 1 > cap.depth)
          throw new StoredInputError("resource_limit", "legacy_depth");
        for (const child of Object.values(v))
          stack.push({ value: child, depth: depth + 1 });
      }
    }
  });
}

/** Domain admission only; never recomputes p or adjusted values. */
function holmReasons(payload: any): string[] {
  const d = payload.declaration,
    e = payload.inputs,
    s = payload.result;
  const issues = new Set<string>();
  const need = (ok: boolean, reason: string) => {
    if (!ok) issues.add(reason);
  };
  const origins = new Map<string, Set<string>>();
  for (const m of e.members) {
    need(BigInt(`0x${m.p_hex}`) <= 0x3ff0000000000000n, "p_domain");
    const old = origins.get(m.origin.source_id) ?? new Set<string>();
    need(!old.has(m.origin.hypothesis_id), "source_hypothesis_duplicate");
    old.add(m.origin.hypothesis_id);
    origins.set(m.origin.source_id, old);
  }
  need(s.adjusted.length === e.members.length, "adjusted_count");
  for (const m of s.adjusted) {
    need(BigInt(`0x${m.adjusted_hex}`) <= 1n << 1074n, "adjusted_domain");
    need(BigInt(`0x${m.display_hex}`) <= 0x3ff0000000000000n, "display_domain");
  }
  const a = d.analyses.find((x: any) => x.analysis_id === e.analysis_id);
  const f = d.families.find((x: any) => x.family_id === e.family_id);
  const r = d.result_slots.find((x: any) => x.result_id === e.result_id);
  if (!a || !f || !r) issues.add("selection_binding");
  else {
    need(
      a.family_id === e.family_id &&
        f.analysis_id === e.analysis_id &&
        r.analysis_id === e.analysis_id &&
        r.family_id === e.family_id,
      "selection_binding",
    );
    need(
      a.operation_kind === "multiplicity_adjustment" &&
        r.operation_kind === "multiplicity_adjustment" &&
        r.kind === "multiplicity_adjustment",
      "selection_kind",
    );
    need(f.kind === "all_pairs", "family_kind");
    const k = d.design.groups.length;
    need(
      k >= 3 && k <= 16 && f.members.length === (k * (k - 1)) / 2,
      "family_scope",
    );
    need(
      [
        a.analysis_id,
        f.family_id,
        r.result_id,
        ...f.members.map((x: any) => x.member_id),
      ].every((id) => /^[A-Za-z0-9_.-]{1,64}$/.test(id)),
      "d0_selected_id",
    );
    need(
      e.members.length === f.members.length &&
        e.members.every(
          (m: any, i: number) => m.member_id === f.members[i].member_id,
        ),
      "member_order",
    );
  }
  need(
    s.adjusted.every(
      (m: any, i: number) => m.member_id === e.members[i]?.member_id,
    ),
    "output_member_order",
  );
  need(
    ["analysis_id", "family_id", "result_id"].every((k) => s[k] === e[k]),
    "result_ownership",
  );
  return [...issues].sort();
}

function context(
  record: any,
  acquire: () => string | undefined,
  checkpoint: Checkpoint,
): Evaluation {
  let text: string | undefined;
  try {
    text = acquire();
  } catch (e) {
    if (!(e instanceof ExpectedContextAccessError)) throw e;
    checkpoint();
    return contextError("expected_unreadable");
  }
  checkpoint();
  if (text === undefined) return contextError("expected_missing");
  if (typeof text !== "string") return contextError("expected_type");
  if (
    text.length > LIMITS.expectedBytes ||
    Buffer.byteLength(text) > LIMITS.expectedBytes
  )
    throw new StoredInputError("resource_limit", "expected_bytes");
  let value: unknown;
  try {
    value = parseStrictJson(text);
  } catch (e) {
    if (e instanceof RangeError)
      throw new StoredInputError(
        "resource_limit",
        "expected_parser_exhaustion",
      );
    if (!(e instanceof SyntaxError || e instanceof StrictJsonError)) throw e;
    checkpoint();
    return contextError("expected_parse");
  }
  checkpoint();
  parsedBounds(value, checkpoint, "expected");
  if (!expectedSchema(value)) return contextError("expected_schema");
  const actual = {
    record_id: record.record_id,
    revision_id: record.revision_id,
    declaration: record.payload.declaration,
    inputs: record.payload.inputs,
  };
  return result(
    jcsCanonicalize(actual) === jcsCanonicalize(value)
      ? []
      : ["context_mismatch"],
  );
}

export interface LocalInspection {
  reference: {
    recordId: string;
    revisionId: string;
    storedProjectionDigest: string;
  };
  /** Only evaluated stages. A is deliberately absent, even on six passes. */
  evaluations: Partial<Record<Exclude<Stage, "A">, Evaluation>>;
}

/**
 * Trusted component composition, not a verifier invocation. Raw safety, exact
 * candidate routing and reference admission precede S. Exceptions escape intact
 * for the future outer refusal owner; this function emits no partial output.
 */
export function inspectLocalRecord(
  bytes: Uint8Array,
  acquireExpected: () => string | undefined,
  checkpoint: Checkpoint,
): LocalInspection {
  const inspected = inspectStoredBytes(bytes, checkpoint);
  const record = inspected.value;
  if (
    !Object.hasOwn(record, "interpretation_bundle_id") ||
    typeof record.interpretation_bundle_id !== "string"
  )
    throw new LocalInputError("routing_error", "bundle_missing_or_type");
  if (record.interpretation_bundle_id !== bundle)
    throw new LocalInputError("unsupported_bundle", "bundle_unsupported");
  if (!identity(record.record_id) || !identity(record.revision_id))
    throw new LocalInputError("unrepresentable_input", "record_reference");
  // Freeze the private parsed graph before any external acquisition callback.
  const stack: unknown[] = [record];
  while (stack.length) {
    checkpoint();
    const v = stack.pop();
    if (v !== null && typeof v === "object") {
      Object.freeze(v);
      stack.push(...Object.values(v));
    }
  }
  const reference = {
    recordId: record.record_id as string,
    revisionId: record.revision_id as string,
    storedProjectionDigest: inspected.referenceDigest,
  };
  const evaluations: LocalInspection["evaluations"] = {
    S: result(schema(record) ? [] : ["record_schema"]),
  };
  checkpoint();
  if (
    evaluations.S!.execution !== "completed" ||
    evaluations.S!.outcome !== "pass"
  )
    return { reference, evaluations };
  // Cast is after closed schema validation; consumers above this boundary are
  // trusted and read-only. No caller-supplied evaluation flags are accepted.
  const valid = record as any;
  evaluations.K = result(
    inspected.canonicalStorage ? [] : ["stored_bytes_noncanonical"],
  );
  const d = legacyDeclaration(valid.payload.declaration);
  localBounds(d, valid.payload, checkpoint);
  const relations = checkD0Relations(d);
  evaluations.D = result(
    relations.codes.map((code) => `d0_${code.toLowerCase()}`),
  );
  checkpoint();
  if (!relations.codes.length)
    evaluations.H = result(holmReasons(valid.payload));
  if (inspected.canonicalStorage)
    evaluations.I = result(
      inspected.referenceDigest === valid.integrity.content_digest
        ? []
        : ["digest_mismatch"],
    );
  evaluations.C = context(valid, acquireExpected, checkpoint);
  checkpoint();
  return { reference, evaluations };
}
