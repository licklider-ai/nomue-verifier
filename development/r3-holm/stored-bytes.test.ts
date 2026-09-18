import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import {
  inspectStoredBytes,
  inspectParsedBytes,
  parseStoredBytes,
  LIMITS,
  StoredInputError,
} from "./stored-bytes.ts";

const checkpoint = () => {};
const inspect = (text: string) =>
  inspectStoredBytes(Buffer.from(text), checkpoint);
// Hand-specified input/projection pairs; no candidate or canonicalizer generates targets.
const vectors: [string, string, string, boolean][] = [
  ["first", '{"integrity":{"x":1},"z":2}', '{"z":2}', true],
  ["middle", '{"a":1,"integrity":null,"z":2}', '{"a":1,"z":2}', true],
  ["last", '{"a":1,"integrity":[]}', '{"a":1}', true],
  ["sole", '{ "integrity" : false }\n', "{  }\n", false],
  ["absent", ' { "b":2, "a":1 }\n', ' { "b":2, "a":1 }\n', false],
  [
    "space-first",
    ' { "integrity" : 1 , \n "z" : 2 }\n',
    ' {  \n "z" : 2 }\n',
    false,
  ],
  [
    "space-middle",
    '{ "a":1 , "integrity" : {"x":2} , "b":3 }',
    '{ "a":1 ,  "b":3 }',
    false,
  ],
  ["space-last", '{"a":1 ,  "integrity" : true  }\n', '{"a":1   }\n', false],
  ["escaped-key", '{"a":1,"\\u0069ntegrity":{},"z":2}', '{"a":1,"z":2}', false],
  [
    "nested",
    '{"a":{"integrity":2},"integrity":{},"z":[{"integrity":3}]}',
    '{"a":{"integrity":2},"z":[{"integrity":3}]}',
    true,
  ],
  [
    "string-lookalike",
    '{"a":"integrity,}\\\"","integrity":{"nested":[1,{"q":"x\\\\y"}]},"z":0}',
    '{"a":"integrity,}\\\"","z":0}',
    true,
  ],
  [
    "unicode",
    '{"a":"日本語😀","integrity":{},"z":"é"}',
    '{"a":"日本語😀","z":"é"}',
    true,
  ],
  [
    "spelling",
    '{"integrity":0,"a":1.0e+0,"b":"\\u0061"}',
    '{"a":1.0e+0,"b":"\\u0061"}',
    false,
  ],
  ["trailing-newline", '{"a":1,"integrity":{}}\n', '{"a":1}\n', false],
];
for (const [name, input, expected, canonical] of vectors) {
  test(`stored projection: ${name}`, () => {
    const result = inspect(input);
    assert.deepEqual(result.original, Buffer.from(input));
    assert.deepEqual(result.projected, Buffer.from(expected));
    assert.equal(result.canonicalStorage, canonical);
    const expectedHash = createHash("sha256")
      .update(Buffer.from("nomue/record-content/v1\n" + expected))
      .digest("hex");
    assert.equal(result.referenceDigest, `sha256:${expectedHash}`);
  });
}

test("stored reference distinguishes newline/whitespace from reserialized content", () => {
  const compact = inspect('{"a":1,"integrity":{}}');
  const spaced = inspect('{ "a":1,"integrity":{}}');
  const newline = inspect('{"a":1,"integrity":{}}\n');
  assert.notEqual(compact.referenceDigest, spaced.referenceDigest);
  assert.notEqual(compact.referenceDigest, newline.referenceDigest);
  assert.equal(spaced.canonicalStorage, false);
  assert.equal(newline.canonicalStorage, false);
});
test("digest ignores only integrity and does not trust its declared digest", () => {
  const a = inspect('{"a":1,"integrity":{"content_digest":"wrong"}}');
  const b = inspect('{"a":1,"integrity":{"content_digest":"also-wrong"}}');
  assert.equal(a.referenceDigest, b.referenceDigest);
  assert.notEqual(
    a.referenceDigest,
    inspect('{"a":2,"integrity":{}}').referenceDigest,
  );
});
test("input and output buffers do not share storage", () => {
  const source = Buffer.from('{"a":1,"integrity":{}}');
  const result = inspectStoredBytes(source, checkpoint);
  source.fill(0);
  assert.equal(result.original.toString(), '{"a":1,"integrity":{}}');
  result.original.fill(0);
  assert.equal(result.projected.toString(), '{"a":1}');
});
for (const [name, input, code] of [
  ["duplicate", '{"integrity":1,"\\u0069ntegrity":2}', "DUPLICATE_JSON_MEMBER"],
  ["nested-duplicate", '{"a":{"x":1,"x":2}}', "DUPLICATE_JSON_MEMBER"],
  ["surrogate", '{"a":"\\ud800"}', "INVALID_UNICODE_STRING"],
  ["negative-zero", '{"a":-0.0}', "NEGATIVE_ZERO_NUMBER"],
] as const)
  test(`strict eligibility: ${name}`, () => {
    assert.throws(
      () => inspect(input),
      (e: unknown) => (e as { code: string }).code === code,
    );
  });
test("malformed and BOM input is not normalized", () => {
  assert.throws(() => inspect('{"a":'), SyntaxError);
  assert.throws(() => inspect('\ufeff{"a":1}'), SyntaxError);
});
test("invalid UTF-8 rejects before parsing; shared buffers rejected", () => {
  assert.throws(
    () => inspectStoredBytes(new Uint8Array([0x7b, 0xff, 0x7d]), checkpoint),
    { reason: "record_utf8" },
  );
  assert.throws(
    () =>
      inspectStoredBytes(new Uint8Array(new SharedArrayBuffer(8)), checkpoint),
    { reason: "record_bytes_type" },
  );
});
test("non-object input and canonicalization failure never produce an inspection", () => {
  for (const input of ["[]", "null", "1", '"x"'])
    assert.throws(() => inspect(input), { reason: "record_object" });
  assert.throws(() => inspect('{"a":1e309}'), {
    kind: "canonicalization_failure",
  });
});
test("raw byte bound at equality and over", () => {
  const at = Buffer.from("{}" + " ".repeat(LIMITS.bytes - 2));
  assert.equal(
    inspectStoredBytes(at, checkpoint).original.length,
    LIMITS.bytes,
  );
  assert.throws(
    () => inspectStoredBytes(Buffer.concat([at, Buffer.from(" ")]), checkpoint),
    { reason: "record_bytes" },
  );
});
test("depth, string, key, entry and node ceilings reject excess", () => {
  assert.doesNotThrow(() =>
    inspect('{"a":' + "[".repeat(35) + "0" + "]".repeat(35) + "}"),
  );
  assert.throws(
    () => inspect('{"a":' + "[".repeat(36) + "0" + "]".repeat(36) + "}"),
    { reason: "record_depth" },
  );
  assert.doesNotThrow(() =>
    inspect(JSON.stringify({ a: "x".repeat(LIMITS.string) })),
  );
  assert.throws(
    () => inspect(JSON.stringify({ a: "x".repeat(LIMITS.string + 1) })),
    { reason: "record_string" },
  );
  assert.throws(
    () => inspect(JSON.stringify({ ["x".repeat(LIMITS.string + 1)]: 1 })),
    { reason: "record_key" },
  );
  assert.doesNotThrow(() =>
    inspect(JSON.stringify({ a: Array(1024).fill(0) })),
  );
  assert.throws(() => inspect(JSON.stringify({ a: Array(1025).fill(0) })), {
    reason: "record_container",
  });
  assert.throws(
    () =>
      inspect(
        JSON.stringify({
          a: Array.from({ length: 29 }, () => Array(1024).fill(0)),
        }),
      ),
    { reason: "record_nodes" },
  );
});
test("budget failures propagate unchanged at early and late checkpoints", () => {
  const input = Buffer.from('{"a":1,"integrity":{}}');
  let total = 0;
  inspectStoredBytes(input, () => {
    total++;
  });
  for (const stop of Array.from({ length: total }, (_, i) => i + 1)) {
    const sentinel = new StoredInputError(
      "resource_limit",
      "processing_timeout",
    );
    let seen = 0;
    assert.throws(
      () =>
        inspectStoredBytes(input, () => {
          if (++seen === stop) throw sentinel;
        }),
      (e) => e === sentinel,
    );
  }
});
test("projection checkpoints preserve even untyped cancellation sentinels", () => {
  const input = Buffer.from('{"a":1,"integrity":{}}');
  let total = 0;
  inspectStoredBytes(input, () => total++);
  for (const sentinel of [new Error("cancelled"), undefined]) {
    for (let stop = 1; stop <= total; stop++) {
      let seen = 0,
        caught = false;
      try {
        inspectStoredBytes(input, () => {
          if (++seen === stop) throw sentinel;
        });
      } catch (error) {
        caught = true;
        assert.equal(error, sentinel);
      }
      assert.equal(caught, true);
    }
  }
});
test("periodic projection checkpoints preserve budget and cancellation identity", () => {
  // Long whitespace, string and nested-array spans exercise skip/quote/valueEnd ticks.
  const input = Buffer.from(
    "{" +
      " ".repeat(768) +
      '"a":"' +
      "x".repeat(768) +
      '","b":[' +
      Array(400).fill("0").join(",") +
      '],"integrity":{}}',
  );
  const parsed = parseStoredBytes(input, checkpoint);
  let total = 0;
  inspectParsedBytes(parsed, () => total++);
  assert.ok(input.length > 2048);
  // Five phase/member calls plus at least nine periodic skip/quote/valueEnd ticks.
  assert.ok(total >= 14, String(total));
  for (const sentinel of [
    new StoredInputError("resource_limit", "processing_timeout"),
    new Error("cancelled"),
    undefined,
  ]) {
    for (let stop = 1; stop <= total; stop++) {
      let seen = 0;
      let caught = false;
      try {
        inspectParsedBytes(parsed, () => {
          if (++seen === stop) throw sentinel;
        });
      } catch (error) {
        caught = true;
        assert.equal(error, sentinel);
      }
      assert.equal(caught, true);
    }
  }
});
