import assert from "node:assert/strict";
import { test } from "node:test";
import {
  readFileSync,
  mkdtempSync,
  writeFileSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { baseRecord, seal, context, fixedReply } from "./outer-fixtures.ts";
import { prepareInnerFiles, evaluateInner } from "./inner-call.ts";
import { controlledCall, projectTrustedReceipt } from "./controlled-call.ts";
import { validateWire } from "./output.ts";

const nonce = "a".repeat(64),
  manifest = "b".repeat(64);
const options = { python: "/unavailable/python" };
const harness = { runner: async () => fixedReply() };
async function prepared() {
  const dir = mkdtempSync(join(tmpdir(), "holm-outer-"));
  try {
    const r = join(dir, "record"),
      e = join(dir, "expected");
    const bytes = seal(baseRecord());
    writeFileSync(r, bytes);
    writeFileSync(e, context());
    const result = await prepareInnerFiles(r, e, options, harness);
    // A path change after inspection cannot change the retained snapshot.
    writeFileSync(r, "changed after inspection");
    assert.equal(result.proposed_record_base64, bytes.toString("base64"));
    return result;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
function receipt(result: any): any {
  return {
    kind: "unissued-holm-controlled/0.3.0-candidate.5",
    category: "completed_valid",
    causes: {},
    result,
    evidence: {
      nonce,
      runtime_manifest_sha256: manifest,
      probe: null,
      leader_exit: 0,
      subreaper: true,
      cleanup: {
        populated_zero: true,
        echild: true,
        cgroup_removed: true,
        temporary_removed: true,
      },
      controls: {
        "memory.max": "536870912",
        "memory.swap.max": "0",
        "memory.oom.group": "1",
        "pids.max": "64",
        "cpu.max": "100000 100000",
      },
      memory_events_delta: { max: 0, oom: 0, oom_kill: 0 },
      pids_events_delta: { max: 0 },
    },
  };
}

test("trusted projection forwards only retained original bytes after complete lifecycle observations", async () => {
  const p = await prepared();
  const out = projectTrustedReceipt(receipt(p), nonce, manifest);
  assert.equal(out.output.kind, "report");
  assert.equal(out.verified_record_base64, p.proposed_record_base64);
  assert.equal(Object.hasOwn(out, "proposed_record_base64"), false);
});

test("missing/false lifecycle evidence, changed nonce/pins, and probe provenance refuse", async () => {
  const base = receipt(await prepared());
  const mutations = [
    (r: any) => {
      r.evidence.nonce = "c".repeat(64);
    },
    (r: any) => {
      r.evidence.runtime_manifest_sha256 = "c".repeat(64);
    },
    (r: any) => {
      r.evidence.probe = "descendant";
    },
    (r: any) => {
      r.evidence.leader_exit = 1;
    },
    (r: any) => {
      r.evidence.subreaper = false;
    },
    ...["populated_zero", "echild", "cgroup_removed", "temporary_removed"].map(
      (k) => (r: any) => {
        r.evidence.cleanup[k] = false;
      },
    ),
    (r: any) => {
      delete r.evidence.cleanup.echild;
    },
    (r: any) => {
      r.evidence.controls["memory.swap.max"] = "max";
    },
    (r: any) => {
      r.evidence.memory_events_delta.oom_kill = 1;
    },
    (r: any) => {
      r.evidence.pids_events_delta.max = 1;
    },
    (r: any) => {
      delete r.evidence.memory_events_delta;
    },
    (r: any) => {
      r.causes.unknown = true;
    },
    (r: any) => {
      r.causes.deadline = false;
    },
    (r: any) => {
      r.category = "unknown";
    },
    (r: any) => {
      delete r.result.proposed_record_base64;
    },
  ];
  for (const mutate of mutations) {
    const r = structuredClone(base);
    mutate(r);
    const out = projectTrustedReceipt(r, nonce, manifest);
    assert.equal(out.output.refusal_kind, "internal_error");
    assert.equal(out.verified_record_base64, undefined);
  }
});

test("late outer causes discard every provisional report and have fixed precedence", async () => {
  const p = await prepared();
  for (const [causes, category, kind] of [
    [
      { memory_enforced: true, deadline: true },
      "memory_enforced",
      "resource_limit",
    ],
    [
      { cleanup_failed: true, memory_enforced: true },
      "cleanup_failed",
      "internal_error",
    ],
    [{ cancelled: true, deadline: true }, "cancelled", "execution_cancelled"],
    [
      { unsupported_host: true, abnormal_exit: true },
      "unsupported_host",
      "unsupported_execution",
    ],
    [{ pids_enforced: true }, "pids_enforced", "resource_limit"],
    [
      { completed_invalid_output: true },
      "completed_invalid_output",
      "internal_error",
    ],
  ] as const) {
    const r = receipt(p);
    r.causes = causes;
    r.category = category;
    assert.equal(
      projectTrustedReceipt(r, nonce, manifest).output.refusal_kind,
      "internal_error",
    );
    delete r.result;
    const out = projectTrustedReceipt(r, nonce, manifest);
    assert.equal(out.output.refusal_kind, kind);
    assert.equal(out.verified_record_base64, undefined);
  }
});

test("changed snapshot, declared digest or output graph cannot pass final projection", async () => {
  const base = receipt(await prepared());
  for (const mutate of [
    (r: any) => {
      r.result.proposed_record_base64 += "\n";
    },
    (r: any) => {
      r.result.proposed_record_base64 = Buffer.from(
        baseRecord().record_id,
      ).toString("base64");
    },
    (r: any) => {
      const x = baseRecord();
      x.integrity.content_digest = "sha256:" + "0".repeat(64);
      const b = JSON.parse(
        Buffer.from(r.result.proposed_record_base64, "base64").toString(),
      );
      b.integrity = x.integrity;
      r.result.proposed_record_base64 = Buffer.from(JSON.stringify(b)).toString(
        "base64",
      );
    },
    (r: any) => {
      r.result.output.verification[2].outcome = "fail";
    },
    (r: any) => {
      r.result.output.verification[2].scope.result_id = "other";
    },
    (r: any) => {
      r.result.output.conformance[0].scope.kind = "expected_context";
    },
    (r: any) => {
      r.result.output.protocol = "old";
    },
  ]) {
    const r = structuredClone(base);
    mutate(r);
    assert.equal(
      projectTrustedReceipt(r, nonce, manifest).output.refusal_kind,
      "internal_error",
    );
  }
});

test("safe C error remains a report after cleanup and cannot forward", async () => {
  const output = await evaluateInner(
    seal(baseRecord()),
    () => undefined,
    options,
    harness,
  );
  validateWire(output);
  const r = receipt({ output });
  const out = projectTrustedReceipt(r, nonce, manifest);
  assert.equal(out.output.verification[1].execution, "error");
  assert.equal(out.verified_record_base64, undefined);
  r.result.proposed_record_base64 = seal(baseRecord()).toString("base64");
  assert.equal(
    projectTrustedReceipt(r, nonce, manifest).output.refusal_kind,
    "internal_error",
  );
});

test(
  "expected symlink follows a regular target; path-only faults remain C errors",
  { skip: process.platform === "win32" },
  async () => {
    const dir = mkdtempSync(join(tmpdir(), "holm-links-"));
    try {
      const rp = join(dir, "record"),
        ep = join(dir, "expected"),
        link = join(dir, "link"),
        loop = join(dir, "loop");
      writeFileSync(rp, seal(baseRecord()));
      writeFileSync(ep, context());
      symlinkSync(ep, link);
      symlinkSync(loop, loop);
      assert.equal(
        (await prepareInnerFiles(rp, link, options, harness)).output
          .verification[1].outcome,
        "pass",
      );
      for (const path of [loop, join(dir, "x".repeat(300))]) {
        const out = await prepareInnerFiles(rp, path, options, harness);
        assert.equal(out.output.verification[1].execution, "error");
        assert.deepEqual(out.output.verification[1].reasons, [
          "candidate:holm:expected_unreadable",
        ]);
        assert.equal(out.proposed_record_base64, undefined);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

const python = process.env.NOMUE_TEST_PYTHON;
test(
  "direct launcher rejects unavailable delegation before Record access",
  { skip: !python },
  async () => {
    const out = await controlledCall("/missing/record", "/missing/expected", {
      python: python!,
      delegation: "/unavailable",
    });
    assert.equal(out.output.refusal_kind, "unsupported_execution");
    assert.equal(out.verified_record_base64, undefined);
  },
);

test(
  "native child transport uses real Python and a fresh completion nonce",
  { skip: !python },
  () => {
    const dir = mkdtempSync(join(tmpdir(), "holm-entry-"));
    try {
      const rp = join(dir, "record"),
        ep = join(dir, "expected");
      writeFileSync(rp, seal(baseRecord()));
      writeFileSync(ep, context());
      const p = spawnSync(
        process.execPath,
        [fileURLToPath(new URL("./outer-entry.mjs", import.meta.url)), rp, ep],
        {
          env: {
            PATH: "/usr/bin:/bin",
            LANG: "C.UTF-8",
            NOMUE_EXPERIMENT_PYTHON: python!,
            NOMUE_CALL_NONCE: nonce,
          },
          timeout: 10000,
        },
      );
      assert.equal(p.status, 0, p.stderr.toString());
      const envelope = JSON.parse(p.stdout.toString());
      assert.equal(envelope.nonce, nonce);
      assert.equal(
        envelope.sha256,
        createHash("sha256").update(envelope.payload).digest("hex"),
      );
      const result = JSON.parse(envelope.payload);
      assert.equal(result.output.verification[2].outcome, "pass");
      assert.equal(
        result.proposed_record_base64,
        readFileSync(rp).toString("base64"),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
