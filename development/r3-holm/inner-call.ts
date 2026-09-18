/** Unissued inner composition. No public CLI, host receipt or forwarding. */
import { parseStrictJson } from "../../reference/verifier/src/strict-json.ts";
import {
  inspectLocalRecord,
  preparedArithmetic,
  LocalInputError,
  type ArithmeticInput,
} from "./local-checks.ts";
import { StoredInputError, LIMITS, parsedBounds } from "./stored-bytes.ts";
import { type Evaluation } from "./dependencies.ts";
import {
  createBudget,
  runNumericWorker,
  readBounded,
  expectedFile,
  InvocationError,
  EXECUTION,
  type Budget,
} from "./execution.ts";
import {
  makeReport,
  validateCompletion,
  encodeOutput,
  refusal,
  type Evidence,
  type RefusalKind,
} from "./output.ts";

export interface InnerOptions {
  python: string;
  signal?: AbortSignal;
}
/** Trusted test controls only, not Record/invocation wire fields. */
export interface InnerHarness {
  budget?: Budget;
  runner?: (input: ArithmeticInput, budget: Budget) => Promise<Buffer>;
  beforeValidate?: (output: any) => void;
}

export function compareArithmetic(
  raw: Buffer,
  input: ArithmeticInput,
  checkpoint: () => void,
): Evaluation {
  if (!Buffer.isBuffer(raw) || raw.length > EXECUTION.workerBytes)
    throw new InvocationError("internal_error", "worker_output");
  let reply: any;
  try {
    reply = parseStrictJson(
      new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(raw),
    );
    parsedBounds(reply, checkpoint);
  } catch (e) {
    if (e instanceof InvocationError || e instanceof StoredInputError) throw e;
    throw new InvocationError("internal_error", "worker_output_parse");
  }
  if (
    !reply ||
    typeof reply !== "object" ||
    Array.isArray(reply) ||
    Object.keys(reply).length !== 2 ||
    !Object.hasOwn(reply, "adjusted_hex") ||
    !Object.hasOwn(reply, "display_hex") ||
    !Array.isArray(reply.adjusted_hex) ||
    !Array.isArray(reply.display_hex) ||
    reply.adjusted_hex.length !== input.submitted.length ||
    reply.display_hex.length !== input.submitted.length
  )
    throw new InvocationError("internal_error", "worker_output_shape");
  const reasons = new Set<string>();
  for (let i = 0; i < input.submitted.length; i++) {
    checkpoint();
    const a = reply.adjusted_hex[i],
      b = reply.display_hex[i];
    if (
      typeof a !== "string" ||
      !/^(0|[1-9a-f][0-9a-f]{0,268})$/.test(a) ||
      BigInt(`0x${a}`) > 1n << 1074n ||
      typeof b !== "string" ||
      !/^[0-9a-f]{16}$/.test(b) ||
      BigInt(`0x${b}`) > 0x3ff0000000000000n
    )
      throw new InvocationError("internal_error", "worker_output_domain");
    if (a !== input.submitted[i].adjusted_hex)
      reasons.add("candidate:holm:exact_value_mismatch");
    if (b !== input.submitted[i].display_hex)
      reasons.add("candidate:holm:display_value_mismatch");
  }
  return {
    execution: "completed",
    outcome: reasons.size ? "fail" : "pass",
    reasons: [...reasons].sort(),
  };
}

function refused(error: unknown): any {
  let kind: RefusalKind = "internal_error";
  if (
    error instanceof InvocationError ||
    error instanceof StoredInputError ||
    error instanceof LocalInputError
  )
    kind = error.kind;
  return refusal(kind);
}

async function complete(
  bytes: Uint8Array,
  acquire: () => string | undefined,
  options: InnerOptions,
  budget: Budget,
  harness: InnerHarness,
): Promise<any> {
  const checkpoint = () => budget.checkpoint();
  checkpoint();
  const local = inspectLocalRecord(bytes, acquire, checkpoint, "candidate.5");
  const evidence: Evidence = { local: structuredClone(local) };
  const arithmetic = preparedArithmetic(local);
  if (arithmetic) {
    const reply = await (harness.runner
      ? harness.runner(structuredClone(arithmetic), budget)
      : runNumericWorker(arithmetic, options.python, budget, options.signal));
    checkpoint();
    evidence.arithmetic = compareArithmetic(reply, arithmetic, checkpoint);
  }
  const output = makeReport(evidence);
  harness.beforeValidate?.(output);
  checkpoint();
  validateCompletion(output, evidence);
  const encoded = encodeOutput(output);
  const decoded = parseStrictJson(encoded.toString("utf8"));
  validateCompletion(decoded, evidence);
  checkpoint();
  return decoded;
}

/** Mutually exclusive output; the final controlled invocation remains unwired. */
export async function evaluateInner(
  bytes: Uint8Array,
  acquire: () => string | undefined,
  options: InnerOptions,
  harness: InnerHarness = {},
): Promise<any> {
  try {
    const budget = harness.budget ?? createBudget(options.signal);
    return await complete(bytes, acquire, options, budget, harness);
  } catch (e) {
    return refused(e);
  }
}

/** Bounded file adapter, with one budget including acquisition and output. */
export async function evaluateInnerFiles(
  recordPath: string,
  expectedPath: string | undefined,
  options: InnerOptions,
  harness: InnerHarness = {},
): Promise<any> {
  try {
    const budget = harness.budget ?? createBudget(options.signal);
    let bytes: Buffer;
    try {
      bytes = readBounded(recordPath, LIMITS.bytes, () => budget.checkpoint());
    } catch (e) {
      if (
        ["ENOENT", "EACCES", "EPERM", "ENOTDIR"].includes(
          (e as NodeJS.ErrnoException).code ?? "",
        )
      )
        throw new InvocationError("input_access_error", "record_access");
      throw e;
    }
    return await complete(
      bytes,
      expectedFile(expectedPath, () => budget.checkpoint()),
      options,
      budget,
      harness,
    );
  } catch (e) {
    return refused(e);
  }
}
