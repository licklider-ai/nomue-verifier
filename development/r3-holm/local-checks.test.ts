import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { jcsCanonicalize } from "../../reference/verifier/src/jcs.ts";
import {
  inspectLocalRecord,
  LocalInputError,
  ExpectedContextAccessError,
} from "./local-checks.ts";
import {
  assembleResults,
  validateResults,
  GraphInvariantError,
  type Evaluation,
} from "./dependencies.ts";
import { LIMITS, StoredInputError } from "./stored-bytes.ts";
import { checkD0Relations } from "./d0-relations.ts";

const read = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url));
const record = () => JSON.parse(read("example-record.jcs").toString());
const expected = () => JSON.parse(read("example-expected.json").toString());
const expectedText = () => read("example-expected.json").toString();
const bytes = (v: unknown) => Buffer.from(jcsCanonicalize(v));
const noop = () => {};
const run = (v: unknown, acquire = expectedText) =>
  inspectLocalRecord(bytes(v), acquire, noop);
const assertPass = (e: Evaluation | undefined) =>
  assert.deepEqual(e, { execution: "completed", outcome: "pass", reasons: [] });
const hasReason = (e: Evaluation | undefined, reason: string) =>
  assert.ok(e?.reasons.includes(`candidate:holm:${reason}`));
const resource = (reason: string) => (e: unknown) =>
  e instanceof StoredInputError &&
  e.kind === "resource_limit" &&
  e.reason === reason;

test("fixed example has six local passes and its original digest; never an A evaluation", () => {
  const r = inspectLocalRecord(read("example-record.jcs"), expectedText, noop);
  assert.deepEqual(Object.keys(r.evaluations), ["S", "K", "D", "H", "I", "C"]);
  for (const e of Object.values(r.evaluations)) assertPass(e);
  assert.equal(
    r.reference.storedProjectionDigest,
    "sha256:9063aa291f6ab21443eb41e2d40fc88d47f007de25c09e9057805922522805e4",
  );
  assert.throws(() => assembleResults(r.evaluations), GraphInvariantError);
  assert.equal(Object.hasOwn(r, "verified_bytes"), false);
});

test("schema failure with faithful references does not acquire context and blocks all dependents", () => {
  for (const edit of [
    (r: any) => {
      r.payload = {};
    },
    (r: any) => {
      delete r.integrity;
    },
    (r: any) => {
      r.extra = 1;
    },
  ]) {
    const r = record();
    edit(r);
    let calls = 0;
    const out = inspectLocalRecord(
      bytes(r),
      () => {
        calls++;
        throw Error("must not read");
      },
      noop,
    );
    assert.equal(calls, 0);
    assert.deepEqual(Object.keys(out.evaluations), ["S"]);
    hasReason(out.evaluations.S, "record_schema");
    const rows = assembleResults(out.evaluations);
    validateResults(rows);
    assert.ok(
      rows
        .slice(1)
        .every(
          (row) =>
            row.execution === "not_run" &&
            row.reasons.includes("candidate:holm:record_schema"),
        ),
    );
  }
});

test("exact routing and valid supplied identity are required before any S result", () => {
  for (const [field, value, kind] of [
    ["interpretation_bundle_id", undefined, "routing_error"],
    ["interpretation_bundle_id", "urn:unknown:bundle", "unsupported_bundle"],
    ["record_id", "bad identity", "unrepresentable_input"],
    ["revision_id", 2, "unrepresentable_input"],
  ] as const) {
    const r = record();
    if (value === undefined) delete r[field];
    else r[field] = value;
    assert.throws(
      () => run(r),
      (e) => e instanceof LocalInputError && e.kind === kind,
    );
  }
});

test("declared digest mismatch preserves D/H/C and reference uses independently computed bytes", () => {
  const r = record();
  r.integrity.content_digest = "sha256:" + "0".repeat(64);
  const out = run(r);
  for (const s of ["D", "H", "C"] as const) assertPass(out.evaluations[s]);
  hasReason(out.evaluations.I, "digest_mismatch");
  assert.equal(
    out.reference.storedProjectionDigest,
    "sha256:9063aa291f6ab21443eb41e2d40fc88d47f007de25c09e9057805922522805e4",
  );
  const rows = assembleResults(out.evaluations);
  validateResults(rows);
  assert.deepEqual(rows[6].reasons, ["candidate:holm:digest_mismatch"]);
});

test("noncanonical bytes with D and C failures preserve independent results and transitive reasons", () => {
  const r = record();
  r.payload.declaration.design.groups.push(
    structuredClone(r.payload.declaration.design.groups[0]),
  );
  const out = inspectLocalRecord(
    Buffer.concat([bytes(r), Buffer.from("\n")]),
    expectedText,
    noop,
  );
  hasReason(out.evaluations.K, "stored_bytes_noncanonical");
  hasReason(out.evaluations.D, "d0_duplicate_id");
  hasReason(out.evaluations.C, "context_mismatch");
  assert.equal(Object.hasOwn(out.evaluations, "H"), false);
  assert.equal(Object.hasOwn(out.evaluations, "I"), false);
  const rows = assembleResults(out.evaluations);
  validateResults(rows);
  assert.deepEqual(
    rows[6].blockers,
    ["K", "D", "H", "I", "C"].map((s) => `candidate:holm:d1:${s}`),
  );
  assert.ok(rows[6].reasons.includes("candidate:holm:d0_duplicate_id"));
});

test("whitespace K failure still evaluates passing D/H/C and never evaluates I", () => {
  const raw = Buffer.concat([read("example-record.jcs"), Buffer.from("\n")]);
  const out = inspectLocalRecord(raw, expectedText, noop);
  for (const s of ["D", "H", "C"] as const) assertPass(out.evaluations[s]);
  assert.equal(Object.hasOwn(out.evaluations, "I"), false);
  assert.notEqual(
    out.reference.storedProjectionDigest,
    record().integrity.content_digest,
  );
  validateResults(assembleResults(out.evaluations));
});

for (const field of [
  "record_id",
  "revision_id",
  "declaration",
  "inputs",
] as const)
  test(`independent expected ${field} mismatch is C fail, not local nonconformance`, () => {
    const e = expected();
    if (field === "declaration")
      e.declaration.dataset.outcome_definition += " other";
    else if (field === "inputs") e.inputs.members[0].p_hex = "0000000000000000";
    else e[field] = "urn:example:other";
    const out = run(record(), () => JSON.stringify(e));
    for (const s of ["S", "K", "D", "H", "I"] as const)
      assertPass(out.evaluations[s]);
    hasReason(out.evaluations.C, "context_mismatch");
    validateResults(assembleResults(out.evaluations));
  });

test("schema-valid D0 failure may coexist with C pass on an independently supplied matching fixture", () => {
  const r = record(),
    e = expected();
  // Independent edits to the two fixture files, not context synthesis in code.
  r.payload.declaration.design.units[0].group_id = "missing";
  e.declaration.design.units[0].group_id = "missing";
  const out = run(r, () => JSON.stringify(e));
  hasReason(out.evaluations.D, "d0_unit_group_ref");
  assertPass(out.evaluations.C);
  validateResults(assembleResults(out.evaluations));
});

test("missing, unreadable, malformed and schema-invalid context yield C error only", () => {
  const acquisitions: Array<() => string | undefined> = [
    () => undefined,
    () => {
      throw new ExpectedContextAccessError("missing file");
    },
    () => "{",
    () => "{}",
    () => '{"x":1,"x":2}',
    () => '{"x":-0}',
    () => '{"x":"\\ud800"}',
  ];
  for (const acquire of acquisitions) {
    const out = inspectLocalRecord(read("example-record.jcs"), acquire, noop);
    for (const s of ["S", "K", "D", "H", "I"] as const)
      assertPass(out.evaluations[s]);
    assert.equal(out.evaluations.C?.execution, "error");
    assert.equal(Object.hasOwn(out.evaluations.C!, "outcome"), false);
    validateResults(assembleResults(out.evaluations));
  }
});

test("expected-input limits and unexpected acquisition failures escape without partial output", () => {
  assert.throws(
    () => run(record(), () => " ".repeat(LIMITS.expectedBytes + 1)),
    resource("expected_bytes"),
  );
  assert.throws(
    () => run(record(), () => "[".repeat(37) + "0" + "]".repeat(37)),
    resource("expected_depth"),
  );
  const failure = Error("trusted acquisition failed unexpectedly");
  assert.throws(
    () =>
      run(record(), () => {
        throw failure;
      }),
    (e) => e === failure,
  );
  let readDone = false;
  assert.throws(
    () =>
      inspectLocalRecord(
        read("example-record.jcs"),
        () => {
          readDone = true;
          return "{}";
        },
        () => {
          if (readDone) throw failure;
        },
      ),
    (e) => e === failure,
  );
});

test("raw bounds precede routing; routing and references precede canonicalization", () => {
  const r = record();
  r.payload = {};
  r.extra = "x".repeat(LIMITS.string + 1);
  assert.throws(() => run(r), resource("record_string"));
  assert.throws(
    () =>
      inspectLocalRecord(
        Buffer.from('{"interpretation_bundle_id":"bad","x":1e999}'),
        expectedText,
        noop,
      ),
    (e) => e instanceof LocalInputError && e.kind === "unsupported_bundle",
  );
  assert.throws(
    () => inspectLocalRecord(Buffer.from('{"x":1e999}'), expectedText, noop),
    (e) => e instanceof LocalInputError && e.kind === "routing_error",
  );
  const routed = `{"interpretation_bundle_id":${JSON.stringify(record().interpretation_bundle_id)},"x":1e999}`;
  assert.throws(
    () => inspectLocalRecord(Buffer.from(routed), expectedText, noop),
    (e) => e instanceof LocalInputError && e.kind === "unrepresentable_input",
  );
  const referenced =
    routed.slice(0, -1) + ',"record_id":"urn:r","revision_id":"urn:v"}';
  assert.throws(
    () => inspectLocalRecord(Buffer.from(referenced), expectedText, noop),
    (e) =>
      e instanceof StoredInputError && e.kind === "canonicalization_failure",
  );
  const many = record();
  while (many.payload.declaration.design.groups.length <= 16)
    many.payload.declaration.design.groups.push({ group_id: "extra" });
  assert.throws(() => run(many), resource("d0_count"));
});

test("p-domain admits zero, subnormal and one, rejects negative zero/nonfinite/greater-than-one", () => {
  for (const hex of [
    "0000000000000000",
    "0000000000000001",
    "3ff0000000000000",
    "8000000000000000",
    "7ff0000000000000",
    "7ff8000000000000",
    "3ff0000000000001",
  ]) {
    const r = record();
    r.payload.inputs.members[0].p_hex = hex;
    const out = run(r);
    assertPass(out.evaluations.S);
    assertPass(out.evaluations.D);
    if (
      ["0000000000000000", "0000000000000001", "3ff0000000000000"].includes(hex)
    )
      assertPass(out.evaluations.H);
    else hasReason(out.evaluations.H, "p_domain");
  }
});

test("actual Holm domain and ownership mutations cannot be accepted through a trusted flag", () => {
  const edits: Array<[string, (r: any) => void]> = [
    [
      "source_hypothesis_duplicate",
      (r) => {
        r.payload.inputs.members[1].origin = structuredClone(
          r.payload.inputs.members[0].origin,
        );
      },
    ],
    [
      "member_order",
      (r) => {
        r.payload.inputs.members.reverse();
      },
    ],
    [
      "output_member_order",
      (r) => {
        r.payload.result.adjusted.reverse();
      },
    ],
    [
      "result_ownership",
      (r) => {
        r.payload.result.result_id = "other";
      },
    ],
    [
      "selection_binding",
      (r) => {
        r.payload.inputs.analysis_id = "other";
      },
    ],
    [
      "adjusted_domain",
      (r) => {
        r.payload.result.adjusted[0].adjusted_hex = (
          (1n << 1074n) +
          1n
        ).toString(16);
      },
    ],
    [
      "display_domain",
      (r) => {
        r.payload.result.adjusted[0].display_hex = "8000000000000000";
      },
    ],
  ];
  for (const [reason, edit] of edits) {
    const r = record();
    edit(r);
    const out = run(r);
    assertPass(out.evaluations.S);
    assertPass(out.evaluations.D);
    hasReason(out.evaluations.H, reason);
    validateResults(assembleResults(out.evaluations));
  }
});

test("acquisition cannot change inspected bytes by mutating the original input", () => {
  const input = read("example-record.jcs");
  const out = inspectLocalRecord(
    input,
    () => {
      input.fill(0);
      return expectedText();
    },
    noop,
  );
  for (const e of Object.values(out.evaluations)) assertPass(e);
  assert.equal(
    out.reference.storedProjectionDigest,
    "sha256:9063aa291f6ab21443eb41e2d40fc88d47f007de25c09e9057805922522805e4",
  );
});

test("D0 relation-only vectors retain all original expected reason sets", () => {
  const baseline = JSON.parse(read("d0-example.json").toString());
  const cases = JSON.parse(read("d0-cases.json").toString()).filter(
    (c: any) => c.expected.stage === "relations",
  );
  assert.ok(cases.length > 20);
  for (const c of cases) {
    const d = structuredClone(baseline);
    for (const edit of c.edits ?? []) {
      const parts = edit.path
        .split("/")
        .slice(1)
        .map((s: string) => s.replaceAll("~1", "/").replaceAll("~0", "~"));
      const key = parts.pop();
      let parent = d;
      for (const p of parts) parent = parent[p];
      if (edit.op === "delete") {
        if (Array.isArray(parent)) parent.splice(Number(key), 1);
        else delete parent[key];
      } else parent[key] = edit.value;
    }
    assert.deepEqual(checkD0Relations(d), c.expected, c.name);
  }
});

test("copied candidate input bytes match their fixed source manifest", () => {
  const pins = JSON.parse(
    readFileSync(new URL("./PROVENANCE.json", import.meta.url), "utf8"),
  );
  for (const pin of pins.assets)
    assert.equal(
      createHash("sha256").update(read(pin.file)).digest("hex"),
      pin.sha256,
      pin.file,
    );
});
