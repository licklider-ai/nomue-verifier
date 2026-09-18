import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assembleResults,
  CHECK_IDS,
  validateResults,
  type Evaluation,
  type Stage,
  type Row,
} from "./dependencies.ts";

const pass = (): Evaluation => ({
  execution: "completed",
  outcome: "pass",
  reasons: [],
});
const fail = (reason: string): Evaluation => ({
  execution: "completed",
  outcome: "fail",
  reasons: [`candidate:holm:${reason}`],
});
const error = (): Evaluation => ({
  execution: "error",
  reasons: ["candidate:holm:expected_schema"],
});
const all = () => ({
  S: pass(),
  K: pass(),
  D: pass(),
  H: pass(),
  I: pass(),
  C: pass(),
  A: pass(),
});
const row = (rows: Row[], s: Stage) => rows.find((r) => r.stage === s)!;

test("all-pass seven-result graph is internally valid, not a forwarding authorization", () => {
  const rows = assembleResults(all());
  validateResults(rows);
  assert.equal(rows.length, 7);
  assert.ok(
    rows.every(
      (r) =>
        r.execution === "completed" &&
        r.outcome === "pass" &&
        r.blockers.length === 0,
    ),
  );
});
test("schema failure blocks every dependent with actual schema reason", () => {
  const rows = assembleResults({ S: fail("record_schema") });
  for (const r of rows.slice(1)) {
    assert.equal(r.execution, "not_run");
    assert.deepEqual(r.reasons, ["candidate:holm:record_schema"]);
    assert.ok(r.blockers.length);
    assert.equal(Object.hasOwn(r, "outcome"), false);
  }
  validateResults(rows);
});
test("K failure blocks I/A without suppressing D/H/C", () => {
  const rows = assembleResults({
    S: pass(),
    K: fail("stored_bytes_noncanonical"),
    D: pass(),
    H: pass(),
    C: fail("context_mismatch"),
  });
  assert.deepEqual(row(rows, "I"), {
    stage: "I",
    checkId: CHECK_IDS.I,
    execution: "not_run",
    reasons: ["candidate:holm:stored_bytes_noncanonical"],
    blockers: [CHECK_IDS.K],
  });
  assert.deepEqual(row(rows, "A").blockers, [
    CHECK_IDS.K,
    CHECK_IDS.I,
    CHECK_IDS.C,
  ]);
  assert.deepEqual(row(rows, "A").reasons, [
    "candidate:holm:stored_bytes_noncanonical",
    "candidate:holm:context_mismatch",
  ]);
  assert.equal(row(rows, "H").execution, "completed");
  validateResults(rows);
});
test("D/H remain evaluated despite I failure and C error", () => {
  const rows = assembleResults({
    S: pass(),
    K: pass(),
    D: pass(),
    H: pass(),
    I: fail("digest_mismatch"),
    C: error(),
  });
  assert.deepEqual(row(rows, "A").blockers, [CHECK_IDS.I, CHECK_IDS.C]);
  assert.deepEqual(row(rows, "A").reasons, [
    "candidate:holm:digest_mismatch",
    "candidate:holm:expected_schema",
  ]);
  assert.equal(row(rows, "D").execution, "completed");
  validateResults(rows);
});
test("multiple and transitive blockers retain deterministic actual reasons", () => {
  const rows = assembleResults({
    S: pass(),
    K: fail("stored_bytes_noncanonical"),
    D: fail("declaration_invalid"),
    C: fail("context_mismatch"),
  });
  assert.deepEqual(row(rows, "H").blockers, [CHECK_IDS.D]);
  assert.deepEqual(row(rows, "A").blockers, [
    CHECK_IDS.K,
    CHECK_IDS.D,
    CHECK_IDS.H,
    CHECK_IDS.I,
    CHECK_IDS.C,
  ]);
  assert.deepEqual(row(rows, "A").reasons, [
    "candidate:holm:stored_bytes_noncanonical",
    "candidate:holm:declaration_invalid",
    "candidate:holm:context_mismatch",
  ]);
  validateResults(rows);
});
test("exhaustive pass/fail/context-error combinations agree with an independent boolean oracle", () => {
  let combinations = 0;
  for (let mask = 0; mask < 64; mask++)
    for (const context of ["pass", "fail", "error"] as const) {
      const [s, k, d, h, i, a] = Array.from({ length: 6 }, (_, bit) =>
        Boolean(mask & (1 << bit)),
      );
      // Direct boolean contract, not DEPENDS or assembleResults as expectation source.
      const eligible = {
        S: true,
        K: s,
        D: s,
        H: s && d,
        I: s && k,
        C: s,
        A: s && k && d && h && i && context === "pass",
      };
      const choices: Record<Stage, Evaluation> = {
        S: s ? pass() : fail("s"),
        K: k ? pass() : fail("k"),
        D: d ? pass() : fail("d"),
        H: h ? pass() : fail("h"),
        I: i ? pass() : fail("i"),
        C:
          context === "error"
            ? error()
            : context === "pass"
              ? pass()
              : fail("c"),
        A: a ? pass() : fail("a"),
      };
      const evaluations = Object.fromEntries(
        Object.entries(choices).filter(([stage]) => eligible[stage as Stage]),
      );
      const rows = assembleResults(evaluations);
      for (const r of rows)
        assert.equal(r.execution !== "not_run", eligible[r.stage]);
      validateResults(rows);
      combinations++;
    }
  assert.equal(combinations, 192);
});
test("serialized-output mutations cannot invent graph passes or erase causes", () => {
  const source = assembleResults({
    S: pass(),
    K: fail("stored_bytes_noncanonical"),
    D: fail("declaration_invalid"),
    C: error(),
  });
  const mutations: ((rows: any[]) => void)[] = [
    (r) => {
      r[6] = {
        ...r[6],
        execution: "completed",
        outcome: "pass",
        reasons: [],
        blockers: [],
      };
    },
    (r) => {
      r[6].reasons = ["candidate:holm:prerequisite_failed"];
    },
    (r) => {
      r[6].reasons = [];
    },
    (r) => {
      r[6].reasons.push("candidate:holm:unrelated");
    },
    (r) => {
      r[6].reasons.reverse();
    },
    (r) => {
      r[6].blockers.pop();
    },
    (r) => {
      r[6].blockers.reverse();
    },
    (r) => {
      r[6].outcome = "pass";
    },
    (r) => {
      r[5].outcome = "fail";
    },
    (r) => {
      r[4].execution = "error";
    },
    (r) => {
      r[2].checkId = CHECK_IDS.C;
    },
    (r) => {
      [r[2], r[5]] = [r[5], r[2]];
    },
    (r) => {
      r[0].extra = true;
    },
    (r) => {
      r.pop();
    },
    (r) => {
      r.push(r[0]);
    },
  ];
  for (const mutate of mutations) {
    const copy = structuredClone(source);
    mutate(copy);
    assert.throws(() => validateResults(copy));
  }
});
test("trusted evaluator boundary rejects incomplete/invalid inputs and generic root causes", () => {
  assert.throws(() => assembleResults({}));
  assert.throws(() => assembleResults({ S: fail("schema"), K: pass() }));
  assert.throws(() => assembleResults({ ...all(), X: pass() } as any));
  assert.throws(() => assembleResults({ ...all(), S: error() }));
  assert.throws(() => assembleResults({ S: fail("prerequisite_failed") }));
  assert.throws(() =>
    assembleResults({
      S: { execution: "completed", outcome: "fail", reasons: [] },
    }),
  );
  assert.throws(() =>
    assembleResults({ ...all(), C: { ...error(), outcome: "fail" } as any }),
  );
  assert.throws(() =>
    assembleResults({
      S: {
        execution: "completed",
        outcome: "fail",
        reasons: ["candidate:holm:x", "candidate:holm:x"],
      },
    }),
  );
});
test("caller mutations do not rewrite copied reasons", () => {
  const first = fail("schema");
  const rows = assembleResults({ S: first });
  first.reasons[0] = "candidate:holm:changed";
  assert.deepEqual(row(rows, "A").reasons, ["candidate:holm:schema"]);
});
