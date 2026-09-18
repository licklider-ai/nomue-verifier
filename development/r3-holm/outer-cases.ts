/** Predetermined first-pass full-call expectations, not the entire expanded 44-case suite. */
import { writeFileSync, mkdirSync } from "node:fs";
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
) {
  const rp = join(dir, id + ".record"),
    ep = join(dir, id + ".expected");
  writeFileSync(rp, bytes);
  if (expected !== undefined) writeFileSync(ep, expected);
  rows.push({
    id,
    record: rp,
    expected: ep,
    checks,
    refusal: refusal ?? null,
    forward: id === "R3D-01",
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
// Persist expectations before running any candidate; the runner never rewrites these.
writeFileSync(join(dir, "cases.json"), JSON.stringify(rows, null, 2) + "\n");
