/** Development inner controls, not the outer cgroup/supervisor guarantee. */
import { performance } from "node:perf_hooks";
import {
  openSync,
  readSync,
  closeSync,
  fstatSync,
  constants,
  readFileSync,
} from "node:fs";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ExpectedContextAccessError,
  type ArithmeticInput,
} from "./local-checks.ts";
import { LIMITS } from "./stored-bytes.ts";

export const EXECUTION = Object.freeze({
  timeMs: 5000,
  heapBytes: 536870912,
  workerBytes: 262144,
  stderrBytes: 65536,
});
export class InvocationError extends Error {
  constructor(
    readonly kind:
      | "resource_limit"
      | "internal_error"
      | "unsupported_execution"
      | "execution_cancelled"
      | "input_access_error",
    readonly reason: string,
  ) {
    super(reason);
    this.name = "InvocationError";
  }
}
export interface Budget {
  checkpoint(): void;
  remainingMs(): number;
}
export function createBudget(
  signal?: AbortSignal,
  observations = {
    now: () => performance.now(),
    heap: () => process.memoryUsage().heapUsed,
  },
): Budget {
  const start = observations.now();
  if (!Number.isFinite(start))
    throw new InvocationError("internal_error", "invalid_clock");
  let last = start,
    peak = 0;
  const checkpoint = () => {
    if (signal?.aborted)
      throw new InvocationError("execution_cancelled", "cancelled");
    const now = observations.now(),
      heap = observations.heap();
    if (
      !Number.isFinite(now) ||
      now < last ||
      !Number.isSafeInteger(heap) ||
      heap < 0
    )
      throw new InvocationError("internal_error", "invalid_budget_observation");
    last = now;
    peak = Math.max(peak, heap);
    if (now - start > EXECUTION.timeMs)
      throw new InvocationError("resource_limit", "processing_timeout");
    if (peak > EXECUTION.heapBytes)
      throw new InvocationError("resource_limit", "processing_heap");
  };
  return {
    checkpoint,
    remainingMs() {
      checkpoint();
      return Math.max(1, EXECUTION.timeMs - (last - start));
    },
  };
}

/** Regular files only; at most cap+1 bytes, including a file growing during read. */
export function readBounded(
  path: string,
  cap: number,
  checkpoint: () => void,
): Buffer {
  checkpoint();
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0));
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile())
      throw new InvocationError("input_access_error", "regular_file_required");
    if (stat.size > cap)
      throw new InvocationError("resource_limit", "input_bytes");
    const buffer = Buffer.alloc(cap + 1);
    let length = 0;
    while (length < buffer.length) {
      checkpoint();
      const n = readSync(
        fd,
        buffer,
        length,
        Math.min(65536, buffer.length - length),
        null,
      );
      if (!n) break;
      length += n;
    }
    if (length > cap)
      throw new InvocationError("resource_limit", "input_bytes");
    checkpoint();
    return Buffer.from(buffer.subarray(0, length));
  } finally {
    closeSync(fd);
  }
}

/** Shared path classification; resource and unexpected failures are not access errors. */
export function isInputAccessError(error: unknown): boolean {
  if (error instanceof InvocationError)
    return (
      error.kind === "input_access_error" &&
      error.reason === "regular_file_required"
    );
  if (error === null || typeof error !== "object") return false;
  return [
    "ENOENT",
    "EACCES",
    "EPERM",
    "ENOTDIR",
    "EISDIR",
    "ELOOP",
    "ENAMETOOLONG",
  ].includes((error as NodeJS.ErrnoException).code ?? "");
}

export function expectedFile(
  path: string | undefined,
  checkpoint: () => void,
): () => string | undefined {
  return () => {
    if (path === undefined) return undefined;
    let bytes: Buffer;
    try {
      bytes = readBounded(path, LIMITS.expectedBytes, checkpoint);
    } catch (e) {
      if (isInputAccessError(e))
        throw new ExpectedContextAccessError("expected input inaccessible");
      throw e;
    }
    try {
      return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
        bytes,
      );
    } catch {
      throw new ExpectedContextAccessError("expected input invalid UTF-8");
    }
  };
}

const numerics = new URL("./numerics/", import.meta.url);
const worker = fileURLToPath(new URL("worker.py", numerics));
function verifyNumerics(): void {
  const pins = JSON.parse(
    readFileSync(new URL("PROVENANCE.json", numerics), "utf8"),
  );
  for (const row of pins.assets) {
    const hash = createHash("sha256")
      .update(readFileSync(new URL(row.file, numerics)))
      .digest("hex");
    if (hash !== row.sha256)
      throw new InvocationError("internal_error", "numeric_source_drift");
  }
}

// Fixed trusted executable/arguments, never Record-supplied code, path or command.
// Wait for close after kill/exit so no early successful result escapes cleanup.
async function child(
  python: string,
  args: string[],
  input: Buffer,
  budget: Budget,
  signal?: AbortSignal,
): Promise<Buffer> {
  budget.checkpoint();
  if (input.length > EXECUTION.workerBytes)
    throw new InvocationError("resource_limit", "worker_input_bytes");
  const timeout = budget.remainingMs();
  return await new Promise((resolve, reject) => {
    const p = spawn(python, args, {
      cwd: fileURLToPath(numerics),
      env: { PATH: "/usr/bin:/bin", LANG: "C.UTF-8" },
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
    });
    const chunks: Buffer[] = [];
    let out = 0,
      err = 0,
      failure: unknown;
    const stop = (e: unknown) => {
      failure ??= e;
      p.kill("SIGKILL");
    };
    const timer = setTimeout(
      () => stop(new InvocationError("resource_limit", "worker_deadline")),
      timeout,
    );
    const cancel = () =>
      stop(new InvocationError("execution_cancelled", "cancelled"));
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) cancel();
    p.on("error", () =>
      stop(new InvocationError("internal_error", "worker_launch")),
    );
    p.stdin.on("error", () =>
      stop(new InvocationError("internal_error", "worker_input")),
    );
    p.stdout.on("data", (b: Buffer) => {
      out += b.length;
      if (out > EXECUTION.workerBytes)
        stop(new InvocationError("resource_limit", "worker_output_bytes"));
      else chunks.push(Buffer.from(b));
    });
    p.stderr.on("data", (b: Buffer) => {
      err += b.length;
      if (err > EXECUTION.stderrBytes)
        stop(new InvocationError("resource_limit", "worker_stderr_bytes"));
    });
    p.on("close", (code, sig) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      try {
        budget.checkpoint();
      } catch (e) {
        failure = e;
      }
      if (failure) reject(failure);
      else if (code !== 0 || sig || err)
        reject(new InvocationError("internal_error", "worker_failure"));
      else resolve(Buffer.concat(chunks));
    });
    p.stdin.end(input);
  });
}

/** Linux numeric child regression only; outer host qualification remains separate. */
export async function runNumericWorker(
  input: ArithmeticInput,
  python: string,
  budget: Budget,
  signal?: AbortSignal,
): Promise<Buffer> {
  budget.checkpoint();
  if (
    process.platform !== "linux" ||
    process.arch !== "x64" ||
    !isAbsolute(python)
  )
    throw new InvocationError("unsupported_execution", "worker_platform");
  verifyNumerics();
  const version = await child(
    python,
    ["-I", "-c", "import sys; print('.'.join(map(str,sys.version_info[:3])))"],
    Buffer.alloc(0),
    budget,
    signal,
  );
  if (version.toString() !== "3.12.14\n")
    throw new InvocationError("unsupported_execution", "worker_python_version");
  return await child(
    python,
    ["-I", worker],
    Buffer.from(JSON.stringify(input.carrier)),
    budget,
    signal,
  );
}
