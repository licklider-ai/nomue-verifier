/** Development-only direct launch. Persisted/submitted receipts are never inputs. */
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { parseStrictJson } from "../../reference/verifier/src/strict-json.ts";
import { inspectStoredBytes, LIMITS } from "./stored-bytes.ts";
import { createBudget } from "./execution.ts";
import {
  allPass,
  encodeOutput,
  refusal,
  validateWire,
  type RefusalKind,
} from "./output.ts";

export const OUTER = Object.freeze({
  memory: 536870912,
  tasks: 64,
  deadline: 30,
  cleanup: 3,
  receiptBytes: 6291456,
  stderrBytes: 65536,
  watchdogMs: 40000,
});
const HERE = new URL("./", import.meta.url);
const ROOT = fileURLToPath(new URL("../../", HERE));
const PRECEDENCE = [
  "cleanup_failed",
  "memory_enforced",
  "pids_enforced",
  "cancelled",
  "deadline",
  "output_overflow",
  "unsupported_host",
  "setup_failed",
  "invalid_input",
  "abnormal_exit",
  "completed_invalid_output",
] as const;
const refusalFor: Record<string, RefusalKind> = {
  cleanup_failed: "internal_error",
  memory_enforced: "resource_limit",
  pids_enforced: "resource_limit",
  cancelled: "execution_cancelled",
  deadline: "resource_limit",
  output_overflow: "resource_limit",
  unsupported_host: "unsupported_execution",
  setup_failed: "internal_error",
  invalid_input: "input_access_error",
  abnormal_exit: "internal_error",
  completed_invalid_output: "internal_error",
};
export interface ControlledResult {
  output: any;
  verified_record_base64?: string;
}
export interface ControlledOptions {
  python: string;
  delegation: string;
  signal?: AbortSignal;
  /** Trusted evidence sink; receives a copy, never supplies a completion. */
  onReceipt?: (receipt: unknown) => void;
}
const failed = (kind: RefusalKind = "internal_error"): ControlledResult => ({
  output: refusal(kind),
});
function record(value: any): boolean {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function exact(value: any, keys: string[]): boolean {
  return (
    record(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((k) => Object.hasOwn(value, k))
  );
}

/** Local trusted-transport validator, not authentication and not an invocation API.
 * Production entry calls this only on the directly launched supervisor's closed pipe.
 * Exported solely so negative contract tests need no fabricated process evidence.
 */
export function projectTrustedReceipt(
  receipt: any,
  nonce: string,
  manifestHash: string,
): ControlledResult {
  try {
    if (
      !record(receipt) ||
      receipt.kind !== "unissued-holm-controlled/0.3.0-candidate.5" ||
      !record(receipt.causes) ||
      !record(receipt.evidence)
    )
      return failed();
    if (
      Object.entries(receipt.causes).some(
        ([k, v]) =>
          !(PRECEDENCE as readonly string[]).includes(k) || v !== true,
      )
    )
      return failed();
    const category =
      PRECEDENCE.find((k) => receipt.causes[k]) ?? "completed_valid";
    if (
      category !== receipt.category ||
      receipt.evidence.nonce !== nonce ||
      receipt.evidence.runtime_manifest_sha256 !== manifestHash ||
      receipt.evidence.probe !== null
    )
      return failed();
    if (category !== "completed_valid") {
      if (Object.hasOwn(receipt, "result")) return failed();
      return failed(refusalFor[category]);
    }
    const e = receipt.evidence;
    if (
      e.leader_exit !== 0 ||
      e.subreaper !== true ||
      !exact(e.cleanup, [
        "populated_zero",
        "echild",
        "cgroup_removed",
        "temporary_removed",
      ]) ||
      Object.values(e.cleanup).some((v) => v !== true) ||
      !exact(e.controls, [
        "memory.max",
        "memory.swap.max",
        "memory.oom.group",
        "pids.max",
        "cpu.max",
      ]) ||
      e.controls["memory.max"] !== String(OUTER.memory) ||
      e.controls["memory.swap.max"] !== "0" ||
      e.controls["memory.oom.group"] !== "1" ||
      e.controls["pids.max"] !== String(OUTER.tasks) ||
      e.controls["cpu.max"] !== "100000 100000"
    )
      return failed();
    for (const [key, required] of [
      ["memory_events_delta", ["max", "oom", "oom_kill"]],
      ["pids_events_delta", ["max"]],
    ] as const) {
      if (
        !record(e[key]) ||
        required.some((k) => !Object.hasOwn(e[key], k)) ||
        Object.values(e[key]).some(
          (v) => !Number.isSafeInteger(v) || (v as number) < 0,
        )
      )
        return failed();
    }
    if (
      ["max", "oom", "oom_kill", "oom_group_kill"].some(
        (k) => (e.memory_events_delta[k] ?? 0) !== 0,
      ) ||
      e.pids_events_delta.max !== 0
    )
      return failed();
    const result = receipt.result;
    if (!(
      exact(result, ["output"]) ||
      exact(result, ["output", "proposed_record_base64"])
    ))
      return failed();
    validateWire(result.output);
    encodeOutput(result.output);
    const pass = allPass(result.output);
    if (pass !== Object.hasOwn(result, "proposed_record_base64"))
      return failed();
    if (!pass) return { output: structuredClone(result.output) };
    const b64 = result.proposed_record_base64;
    if (typeof b64 !== "string" || b64.length > 4 * Math.ceil(LIMITS.bytes / 3))
      return failed();
    const bytes = Buffer.from(b64, "base64");
    if (bytes.toString("base64") !== b64 || bytes.length > LIMITS.bytes)
      return failed();
    const budget = createBudget();
    const inspected = inspectStoredBytes(bytes, () => budget.checkpoint());
    const ref = result.output.record_reference;
    if (
      !inspected.canonicalStorage ||
      inspected.referenceDigest !== ref.stored_projection_digest ||
      inspected.value.record_id !== ref.record_id ||
      inspected.value.revision_id !== ref.revision_id ||
      inspected.value.interpretation_bundle_id !==
        result.output.interpretation_bundle_id ||
      (inspected.value.integrity as any)?.content_digest !==
        inspected.referenceDigest
    )
      return failed();
    for (const key of ["analysis_id", "family_id", "result_id"])
      if (
        (inspected.value.payload as any)?.inputs?.[key] !==
        result.output.conformance[3].scope[key]
      )
        return failed();
    budget.checkpoint();
    return {
      output: structuredClone(result.output),
      verified_record_base64: b64,
    };
  } catch {
    return failed();
  }
}

/** One new supervisor per call, pinned programs and policy, no receipt file/command override. */
export async function controlledCall(
  recordPath: string,
  expectedPath: string | undefined,
  options: ControlledOptions,
): Promise<ControlledResult> {
  if (options.signal?.aborted) return failed("execution_cancelled");
  if (
    process.platform !== "linux" ||
    process.arch !== "x64" ||
    process.version !== "v24.19.0" ||
    !isAbsolute(options.python) ||
    !isAbsolute(options.delegation) ||
    !isAbsolute(recordPath) ||
    (expectedPath !== undefined && !isAbsolute(expectedPath))
  )
    return failed("unsupported_execution");
  let manifestHash: string;
  try {
    manifestHash = createHash("sha256")
      .update(readFileSync(new URL("outer-runtime.json", HERE)))
      .digest("hex");
  } catch {
    return failed();
  }
  const nonce = randomBytes(32).toString("hex");
  const args = [
    "-I",
    fileURLToPath(new URL("outer-supervisor.py", HERE)),
    "--delegation",
    options.delegation,
    "--node",
    process.execPath,
    "--python",
    options.python,
    "--nonce",
    nonce,
    "--",
    recordPath,
  ];
  if (expectedPath !== undefined) args.push(expectedPath);
  return await new Promise((resolve) => {
    const child = spawn(options.python, args, {
      cwd: ROOT,
      env: { PATH: "/usr/bin:/bin", LANG: "C.UTF-8" },
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });
    const chunks: Buffer[] = [];
    let length = 0,
      errors = 0,
      failure: RefusalKind | undefined,
      settled = false;
    const finish = (r: ControlledResult) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", cancel);
        resolve(r);
      }
    };
    const cancel = () => {
      failure = "execution_cancelled";
      child.kill("SIGTERM");
    };
    const timer = setTimeout(() => {
      // Unknown cleanup after supervisor/host loss is never successful completion.
      child.kill("SIGKILL");
      child.stdout.destroy();
      child.stderr.destroy();
      finish(failed(failure));
    }, OUTER.watchdogMs);
    options.signal?.addEventListener("abort", cancel, { once: true });
    if (options.signal?.aborted) cancel();
    child.on("error", () => {
      failure ??= "internal_error";
    });
    child.stdout.on("data", (b: Buffer) => {
      length += b.length;
      if (length > OUTER.receiptBytes) {
        failure ??= "resource_limit";
        child.kill("SIGTERM");
      } else chunks.push(Buffer.from(b));
    });
    child.stderr.on("data", (b: Buffer) => {
      errors += b.length;
      if (errors > OUTER.stderrBytes) {
        failure ??= "resource_limit";
        child.kill("SIGTERM");
      }
    });
    child.on("close", (code, signal) => {
      if (failure) return finish(failed(failure));
      if (code !== 0 || signal || errors) return finish(failed());
      try {
        const receipt = parseStrictJson(
          new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
            Buffer.concat(chunks),
          ),
        );
        options.onReceipt?.(structuredClone(receipt));
        const result = projectTrustedReceipt(receipt, nonce, manifestHash);
        if (options.signal?.aborted)
          return finish(failed("execution_cancelled"));
        finish(result);
      } catch {
        finish(failed());
      }
    });
  });
}
