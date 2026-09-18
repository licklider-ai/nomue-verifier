/** Author tests with precommitted Python byte-construction/hash expectations. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { inspectStoredBytes, LIMITS } from "./stored-bytes.ts";
import { evaluateInner } from "./inner-call.ts";
import { context } from "./outer-fixtures.ts";

const corpus = JSON.parse(
  readFileSync(
    new URL("./oracles/projection-vectors.json", import.meta.url),
    "utf8",
  ),
);
const noop = () => {};

test("constructed raw-byte oracle: every component vector and fixed digest", () => {
  assert.equal(corpus.component_vectors.length, 324);
  for (const v of [...corpus.component_vectors, ...corpus.full_call_vectors]) {
    const result = inspectStoredBytes(Buffer.from(v.input), noop);
    assert.deepEqual(result.original, Buffer.from(v.input), v.id);
    assert.deepEqual(result.projected, Buffer.from(v.projection), v.id);
    assert.equal(result.referenceDigest, v.digest, v.id);
    if ("canonical" in v)
      assert.equal(result.canonicalStorage, v.canonical, v.id);
  }
});

test("non-zero typed-array offset and independent retained copies", () => {
  const v = corpus.component_vectors[101];
  const input = Buffer.from(v.input);
  const backing = Buffer.concat([
    Buffer.from("prefix"),
    input,
    Buffer.from("suffix"),
  ]);
  const view = new Uint8Array(
    backing.buffer,
    backing.byteOffset + 6,
    input.length,
  );
  const result = inspectStoredBytes(view, noop);
  backing.fill(0);
  assert.deepEqual(result.original, input);
  assert.deepEqual(result.projected, Buffer.from(v.projection));
  result.original.fill(0);
  assert.equal(result.referenceDigest, v.digest);
  assert.deepEqual(result.projected, Buffer.from(v.projection));
});

// These are component ceilings, not admission at the narrower D0/worker limits.
const dimensions = [
  {
    name: "bytes",
    cap: 2359296,
    reason: "record_bytes",
    make: (n: number) => "{}" + " ".repeat(n - 2),
  },
  {
    name: "depth",
    cap: 36,
    reason: "record_depth",
    make: (n: number) =>
      '{"a":' + "[".repeat(n - 1) + "0" + "]".repeat(n - 1) + "}",
  },
  {
    name: "nodes",
    cap: 28736,
    reason: "record_nodes",
    make: (n: number) => {
      // Root + outer array + 29 arrays = 31 nodes; object keys do not count.
      const scalars = n - 31;
      return JSON.stringify({
        a: Array.from({ length: 29 }, (_, i) =>
          Array(Math.min(1024, Math.max(0, scalars - i * 1024))).fill(0),
        ),
      });
    },
  },
  {
    name: "entries",
    cap: 1024,
    reason: "record_container",
    make: (n: number) => JSON.stringify({ a: Array(n).fill(0) }),
  },
  {
    name: "string",
    cap: 4096,
    reason: "record_string",
    make: (n: number) => JSON.stringify({ a: "x".repeat(n) }),
  },
  {
    name: "key",
    cap: 4096,
    reason: "record_key",
    make: (n: number) => JSON.stringify({ ["x".repeat(n)]: 0 }),
  },
];
for (const d of dimensions)
  for (const delta of [-1, 0, 1]) {
    test(`component limit ${d.name}: ${delta < 0 ? "below" : delta ? "above" : "equal"}`, () => {
      assert.equal(
        LIMITS[d.name === "key" ? "string" : (d.name as keyof typeof LIMITS)],
        d.cap,
      );
      const invoke = () =>
        inspectStoredBytes(Buffer.from(d.make(d.cap + delta)), noop);
      if (delta > 0)
        assert.throws(invoke, { kind: "resource_limit", reason: d.reason });
      else assert.doesNotThrow(invoke);
    });
  }

for (const v of corpus.full_call_vectors) {
  test(
    `inner call checks stored-byte reference against independent target: ${v.id}`,
    {
      skip:
        v.forward && !process.env.NOMUE_TEST_PYTHON
          ? "requires actual pinned worker"
          : false,
    },
    async () => {
      const output = await evaluateInner(Buffer.from(v.input), context, {
        python: process.env.NOMUE_TEST_PYTHON ?? "/unavailable/python",
      });
      assert.equal(output.kind, "report");
      assert.equal(output.record_reference.stored_projection_digest, v.digest);
      const rows = [...output.conformance, ...output.verification];
      for (const [stage, want] of Object.entries(v.checks)) {
        const r = rows.find((r: any) => r.stage === stage)!;
        assert.equal(
          r.execution === "completed" ? r.outcome : r.execution,
          want,
          v.id + ":" + stage,
        );
      }
    },
  );
}
