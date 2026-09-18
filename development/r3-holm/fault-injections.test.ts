import assert from "node:assert/strict";
import { test } from "node:test";
import { FAULTS, faultHarness } from "./fault-injections.ts";
import { baseRecord, seal, context, fixedReply } from "./outer-fixtures.ts";
import { evaluateInner } from "./inner-call.ts";
import { validateWire } from "./output.ts";
import { inspectLocalRecord } from "./local-checks.ts";
import { makeReport } from "./output.ts";

for (const mode of FAULTS)
  test(`${mode} discards the provisional output`, async () => {
    const r = baseRecord();
    if (["fault-s-pass", "fault-schema-budget"].includes(mode)) r.payload = {};
    const noContext = [
      "fault-a-pass",
      "fault-error-outcome",
      "fault-notrun-outcome",
      "fault-generic-reason",
      "fault-missing-blocker",
      "fault-unrelated-blocker",
      "fault-missing-reason",
    ].includes(mode);
    const output = await evaluateInner(
      seal(r),
      () => (noContext ? undefined : context()),
      { python: "/unavailable/python" },
      faultHarness(mode, async () => fixedReply()),
    );
    assert.equal(output.kind, "refusal");
    assert.equal(
      output.refusal_kind,
      mode.includes("budget") ? "resource_limit" : "internal_error",
    );
    assert.equal(Object.hasOwn(output, "record_reference"), false);
  });
test("fabricated S pass remains structurally valid and needs private evidence rejection", () => {
  const r = baseRecord();
  r.payload = {};
  const local = inspectLocalRecord(
    seal(r),
    () => context(),
    () => {},
    "candidate.5",
  );
  const o = makeReport({ local });
  faultHarness("fault-s-pass").beforeValidate!(o);
  validateWire(o);
  assert.ok(
    [...o.conformance, ...o.verification].every(
      (row) => row.outcome === "pass",
    ),
  );
});
