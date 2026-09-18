/** Author integration tests; real controlled-host evidence is a separate lane. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import { evaluateInner, prepareInnerFiles } from "./inner-call.ts";
import { ExpectedContextAccessError } from "./local-checks.ts";
import {
  contextMatrix,
  expectedRows,
  recordColumns,
  contextColumns,
  CONFORMANCE_ROW_COUNT,
} from "./context-matrix.ts";
import { fixedReply } from "./outer-fixtures.ts";

const cases = contextMatrix();
const shape = new Ajv2020({ strict: true, allErrors: true }).compile(
  JSON.parse(
    readFileSync(
      new URL("./contracts/output.schema.json", import.meta.url),
      "utf8",
    ),
  ),
);
function check(out: any, expected: ReturnType<typeof expectedRows>) {
  assert.equal(shape(out), true, JSON.stringify(shape.errors));
  assert.equal(out.kind, "report");
  assert.equal(Object.hasOwn(out, "refusal_kind"), false);
  const project = ({ scope: _scope, ...rest }: any) => rest;
  assert.deepEqual(
    out.conformance.map(project),
    expected.slice(0, CONFORMANCE_ROW_COUNT),
  );
  assert.deepEqual(
    out.verification.map(project),
    expected.slice(CONFORMANCE_ROW_COUNT),
  );
  assert.ok(
    Object.values(out.guarantee_boundary).every((v) => v === "not_asserted"),
  );
}
test("context matrix is exactly seven Record columns by fifteen context columns", () => {
  assert.equal(recordColumns.length, 7);
  assert.equal(contextColumns.length, 15);
  const size = recordColumns.length * contextColumns.length;
  assert.equal(cases.length, size);
  assert.equal(new Set(cases.map((c) => c.id)).size, size);
  for (const r of recordColumns)
    for (const c of contextColumns)
      assert.equal(
        cases.filter((x) => x.column === r && x.contextColumn === c).length,
        1,
      );
  assert.equal(cases.filter((c) => c.forward).length, 1);
});
test("schema suppression does not hide malformed expected C arguments", () => {
  for (const column of recordColumns) {
    assert.throws(
      () => expectedRows(column, "pass", "context_mismatch"),
      /invalid expected C/,
    );
    assert.throws(() => expectedRows(column, "fail"), /invalid expected C/);
    assert.throws(
      () => expectedRows(column, "error", "context_mismatch"),
      /invalid expected C/,
    );
  }
  // A valid hypothetical C mismatch is still suppressed when S fails.
  assert.equal(
    expectedRows("schema", "fail", "context_mismatch")[5].execution,
    "not_run",
  );
});
for (const c of cases)
  test(`${c.id}: exact rows, reasons, blockers and file boundary`, async () => {
    let reads = 0,
      launches = 0;
    const harness = {
      runner: async () => {
        launches++;
        assert.equal(c.forward, true, "A launched without six passes");
        return fixedReply();
      },
    };
    const options = { python: "/unavailable/python" };
    const before = Buffer.from(c.bytes);
    const output = await evaluateInner(
      c.bytes,
      () => {
        reads++;
        return c.expected;
      },
      options,
      harness,
    );
    check(output, c.rows);
    assert.equal(reads, c.column === "schema" ? 0 : 1);
    assert.equal(launches, Number(c.forward));
    assert.deepEqual(c.bytes, before);
    const dir = mkdtempSync(join(tmpdir(), "nomue-context-matrix-"));
    try {
      const rp = join(dir, "record.json"),
        ep = join(dir, "expected.json");
      writeFileSync(rp, c.bytes);
      if (c.expected !== undefined) writeFileSync(ep, c.expected);
      const result = await prepareInnerFiles(
        rp,
        c.expected === undefined ? undefined : ep,
        options,
        harness,
      );
      check(result.output, c.rows);
      assert.equal(Object.hasOwn(result, "proposed_record_base64"), c.forward);
      if (c.forward)
        assert.deepEqual(
          Buffer.from(result.proposed_record_base64!, "base64"),
          before,
        );
      assert.equal(launches, 2 * Number(c.forward));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
// These two callback-only errors cannot be represented as file-content variants.
for (const column of recordColumns)
  for (const error of ["expected_unreadable", "expected_type"] as const)
    test(`CTX-${column}-${error}: callback error retains independent rows`, async () => {
      const c = cases.find(
        (x) => x.column === column && x.contextColumn === "match",
      )!;
      let reads = 0,
        launches = 0;
      const out = await evaluateInner(
        c.bytes,
        () => {
          reads++;
          if (error === "expected_unreadable")
            throw new ExpectedContextAccessError("test access");
          return 42 as unknown as string;
        },
        { python: "/unavailable/python" },
        {
          runner: async () => {
            launches++;
            throw Error("unexpected worker");
          },
        },
      );
      check(out, expectedRows(column, "error", error));
      assert.equal(reads, column === "schema" ? 0 : 1);
      assert.equal(launches, 0);
    });
test(
  "context matrix positive control uses the real pinned numerical child",
  {
    skip: !process.env.NOMUE_TEST_PYTHON,
  },
  async () => {
    const c = cases.find((c) => c.forward)!;
    const out = await evaluateInner(c.bytes, () => c.expected, {
      python: process.env.NOMUE_TEST_PYTHON!,
    });
    check(out, c.rows);
  },
);
