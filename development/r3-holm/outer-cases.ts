/** Predetermined first-pass full-call expectations, not the entire expanded 44-case suite. */
import { writeFileSync, mkdirSync, symlinkSync } from "node:fs";
import { resolve, join } from "node:path";
import { baseRecord, seal, context } from "./outer-fixtures.ts";
import { jcsCanonicalize } from "../../reference/verifier/src/jcs.ts";
const dir = resolve(process.argv[2]);
mkdirSync(dir, { recursive: true });
const rows: any[] = [];
function add(
  id: string,
  bytes: Buffer,
  expected: string | undefined,
  checks: Record<string, string>,
  refusal?: string,
  details: Record<string, any> = {},
) {
  const rp = join(dir, id + ".record"),
    ep = join(dir, id + ".expected");
  writeFileSync(rp, bytes);
  if (expected !== undefined) writeFileSync(ep, expected);
  rows.push({
    id,
    record: rp,
    expected: expected === undefined ? null : ep,
    checks,
    refusal: refusal ?? null,
    forward: id === "R3D-01",
    ...details,
  });
}
const mutate = (fn: (r: any) => void) => {
  const r = baseRecord();
  fn(r);
  return seal(r);
};
const good = seal(baseRecord()),
  e = context();
const changed = JSON.parse(e);
changed.revision_id = "urn:different-revision";
add("R3D-01", good, e, {
  S: "pass",
  K: "pass",
  D: "pass",
  H: "pass",
  I: "pass",
  C: "pass",
  A: "pass",
});
add("R3D-02", good, JSON.stringify(changed), {
  D: "pass",
  H: "pass",
  C: "fail",
  A: "not_run",
});
const d = mutate(
  (r) => (r.payload.declaration.design.units[0].group_id = "missing"),
);
// Matching context for the same invalid D0 declaration; expected schema still holds.
const de = JSON.parse(e);
de.declaration = JSON.parse(d.toString()).payload.declaration;
add("R3D-03", d, JSON.stringify(de), {
  D: "fail",
  H: "not_run",
  I: "pass",
  C: "pass",
  A: "not_run",
});
add("R3D-04", d, e, { D: "fail", C: "fail", H: "not_run", A: "not_run" });
const ir = JSON.parse(good.toString());
ir.integrity.content_digest = "sha256:" + "0".repeat(64);
add("R3D-05", Buffer.from(jcsCanonicalize(ir)), e, {
  I: "fail",
  D: "pass",
  H: "pass",
  C: "pass",
  A: "not_run",
});
const di = JSON.parse(d.toString());
di.integrity.content_digest = ir.integrity.content_digest;
add("R3D-06", Buffer.from(jcsCanonicalize(di)), JSON.stringify(de), {
  D: "fail",
  I: "fail",
  H: "not_run",
  A: "not_run",
});
add(
  "R3D-07",
  mutate((r) => (r.payload = {})),
  e,
  { S: "fail", K: "not_run", D: "not_run", C: "not_run", A: "not_run" },
);
add(
  "R3D-08",
  mutate((r) => delete r.record_id),
  e,
  {},
  "unrepresentable_input",
);
add(
  "R3D-09",
  mutate((r) => (r.revision_id = "invalid")),
  e,
  {},
  "unrepresentable_input",
);
add(
  "R3D-10",
  mutate((r) => (r.interpretation_bundle_id = "unknown")),
  e,
  {},
  "unsupported_bundle",
);
add("R3D-11", Buffer.from("{"), e, {}, "parse_error");
add("R3D-12", Buffer.from('{"x":1,"x":2}'), e, {}, "parse_error");
add("R3D-13", Buffer.from('{"x":"\\ud800"}'), e, {}, "parse_error");
add("R3D-14", Buffer.from(" " + good.toString()), e, {
  K: "fail",
  D: "pass",
  H: "pass",
  I: "not_run",
  C: "pass",
  A: "not_run",
});
add("R3D-15", Buffer.concat([good, Buffer.from("\n")]), e, {
  K: "fail",
  I: "not_run",
  C: "pass",
  A: "not_run",
});
add("R3D-16", good, undefined, {
  D: "pass",
  H: "pass",
  I: "pass",
  C: "error",
  A: "not_run",
});
add("R3D-17", good, "{", {
  D: "pass",
  H: "pass",
  I: "pass",
  C: "error",
  A: "not_run",
});
add("R3D-18", good, "[]", {
  D: "pass",
  H: "pass",
  I: "pass",
  C: "error",
  A: "not_run",
});
add(
  "R3D-20",
  mutate((r) => (r.payload = {})),
  undefined,
  { S: "fail", C: "not_run", A: "not_run" },
);
add(
  "R3D-22",
  mutate(
    (r) =>
      (r.payload.result.adjusted[0].adjusted_hex = (
        BigInt("0x" + r.payload.result.adjusted[0].adjusted_hex) - 1n
      ).toString(16)),
  ),
  e,
  { A: "fail" },
);
add("R3D-24", Buffer.alloc(2359297, 32), e, {}, "resource_limit");
add(
  "R3D-32",
  Buffer.from(
    '{"interpretation_bundle_id":"https://nomue.ai/id/bundle/holm-supplied-p-bundle/0.3.0-candidate.4"}',
  ),
  e,
  {},
  "unsupported_bundle",
);
add("R3D-34", Buffer.from("{}"), e, {}, "routing_error");
add("R3D-38", Buffer.concat([d, Buffer.from("\n")]), JSON.stringify(de), {
  K: "fail",
  D: "fail",
  H: "not_run",
  I: "not_run",
  C: "pass",
  A: "not_run",
});
add(
  "R3D-39",
  Buffer.concat([good, Buffer.from("\n")]),
  JSON.stringify(changed),
  { K: "fail", D: "pass", H: "pass", C: "fail", I: "not_run", A: "not_run" },
);
add("R3D-40", good, JSON.stringify(changed), {
  C: "fail",
  D: "pass",
  H: "pass",
  A: "not_run",
});
// Additional expectations are authored before execution; no verifier output is an oracle.
const reason = (name: string) => "candidate:holm:" + name;
const find = (id: string) => rows.find((row) => row.id === id);
find("R3D-16").reasons = { C: [reason("expected_missing")] };
find("R3D-17").reasons = { C: [reason("expected_parse")] };
add(
  "R3D-17-missing-file",
  good,
  undefined,
  { C: "error", A: "not_run" },
  undefined,
  {
    expected: join(dir, "not-created.expected"),
    reasons: { C: [reason("expected_unreadable")] },
  },
);
add(
  "R3D-17-directory",
  good,
  undefined,
  { C: "error", A: "not_run" },
  undefined,
  { expected: dir, reasons: { C: [reason("expected_unreadable")] } },
);
// A path that would exceed the expected byte bound proves lazy acquisition on S failure.
add(
  "R3D-20-unread",
  mutate((r) => (r.payload = {})),
  " ".repeat(1572865),
  { S: "fail", C: "not_run", A: "not_run" },
);
for (const field of ["record_id", "revision_id"]) {
  const c = JSON.parse(e);
  c[field] = "urn:other-valid-identity";
  add(
    "R3D-40-" + field,
    good,
    JSON.stringify(c),
    { C: "fail", D: "pass", H: "pass", A: "not_run" },
    undefined,
    { reasons: { C: [reason("context_mismatch")] } },
  );
}
for (const variant of ["unselected", "order"]) {
  const c = JSON.parse(e);
  if (variant === "unselected")
    c.declaration.analyses[1].population.definition =
      "Different unselected declaration";
  else c.declaration.analyses.reverse();
  add("R3D-19-" + variant, good, JSON.stringify(c), {
    D: "pass",
    H: "pass",
    C: "fail",
    A: "not_run",
  });
}
const negativeZero = baseRecord();
negativeZero.payload.inputs.members[0].p_hex = "8000000000000000";
const negContext = JSON.parse(e);
negContext.inputs = negativeZero.payload.inputs;
add(
  "R3D-21",
  seal(negativeZero),
  JSON.stringify(negContext),
  { D: "pass", H: "fail", C: "pass", A: "not_run" },
  undefined,
  { reasons: { H: [reason("p_domain")] } },
);
// Three tied least-subnormal p values: max(3u,2u,u)=3u; exact numerator/display are 3.
// Zero and one endpoints similarly follow directly from clamping, independently of worker.py.
for (const [name, p, numerator, display] of [
  ["zero", "0000000000000000", "0", "0000000000000000"],
  ["subnormal-tie", "0000000000000001", "3", "0000000000000003"],
  ["one", "3ff0000000000000", (1n << 1074n).toString(16), "3ff0000000000000"],
]) {
  const r = baseRecord();
  for (const m of r.payload.inputs.members) m.p_hex = p;
  for (const m of r.payload.result.adjusted) {
    m.adjusted_hex = numerator;
    m.display_hex = display;
  }
  const c = JSON.parse(e);
  c.inputs = r.payload.inputs;
  add(
    "R3D-23-" + name,
    seal(r),
    JSON.stringify(c),
    {
      S: "pass",
      K: "pass",
      D: "pass",
      H: "pass",
      I: "pass",
      C: "pass",
      A: "pass",
    },
    undefined,
    { forward: true, numeric_target: { p, numerator, display } },
  );
}
add("R3D-11-utf8", Buffer.from([0xff]), e, {}, "parse_error");
add(
  "R3D-10-missing",
  mutate((r) => delete r.interpretation_bundle_id),
  e,
  {},
  "routing_error",
);
add(
  "R3D-09-oversized",
  mutate((r) => (r.revision_id = "urn:" + "x".repeat(4097))),
  e,
  {},
  "resource_limit",
);
add("R3D-24-expected-bytes", good, " ".repeat(1572865), {}, "resource_limit");
const schemaFail = mutate((r) => (r.payload = {}));
add(
  "R3D-37-raw",
  Buffer.concat([schemaFail, Buffer.alloc(2359297, 32)]),
  e,
  {},
  "resource_limit",
);
add(
  "R3D-37-parsed",
  mutate((r) => {
    r.payload = {};
    r.extra = Array(1025).fill(0);
  }),
  e,
  {},
  "resource_limit",
);
add(
  "R3D-42",
  Buffer.concat([d, Buffer.from("\n")]),
  e,
  { K: "fail", D: "fail", H: "not_run", I: "not_run", C: "fail", A: "not_run" },
  undefined,
  {
    reasons: {
      D: [reason("d0_unit_group_mismatch"), reason("d0_unit_group_ref")],
      A: [
        reason("stored_bytes_noncanonical"),
        reason("d0_unit_group_mismatch"),
        reason("d0_unit_group_ref"),
        reason("context_mismatch"),
      ],
    },
  },
);
// Non-finite JSON is strict-parseable but cannot be canonicalized. Dispatch has already succeeded.
add(
  "R3D-43",
  Buffer.from(
    schemaFail.toString().replace('"payload":{}', '"payload":{"x":1e999}'),
  ),
  e,
  {},
  "canonicalization_failure",
);
const loop = join(dir, "record-loop");
symlinkSync(loop, loop);
for (const [name, path] of [
  ["loop", loop],
  ["overlong", join(dir, "x".repeat(300))],
]) {
  add("ACCESS-" + name, good, undefined, {}, "input_access_error", {
    record: path,
    path_setup: name,
  });
}
// Persist expectations before running any candidate; the runner never rewrites these.
writeFileSync(join(dir, "cases.json"), JSON.stringify(rows, null, 2) + "\n");
