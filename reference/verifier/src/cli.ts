/**
 * Reference verifier CLI.
 *
 *   pnpm nomue-record verify <record.json> [--format json|json-compact|human]
 *   pnpm nomue-record canonicalize <record.json>  - canonical digest projection (stdout)
 *   pnpm nomue-record digest <record.json>        - recomputed content digest (JSON, stdout)
 *
 * Machine-readable JSON goes to stdout, undecorated, in every format mode.
 * `--format` controls only whether (and how) a human summary also goes to
 * stderr; it never changes stdout's JSON shape, and it adds no field a
 * relying party could mistake for an overall status (NRS-VERIFY-0001).
 * See spec/verification/relying-party-interface.md's exit-code contract
 * (NRS-VERIFY-0025) for the normative meaning of each exit code below;
 * this comment restates it for convenience and is drift-tested against
 * that document in tooling/tests/exit-code-contract.test.ts.
 *
 *   0  completed, every applicable check outcome is pass
 *   2  a report exists but conformance/integrity/precondition/computability/
 *      recompute failed, OR a parse_error / canonicalization_failure
 *      refusal (no report exists) - inspect output_type to distinguish
 *   3  routing_error (bundle declaration missing/invalid) or
 *      unsupported_bundle refusal - no report exists
 *   4  resource_limit refusal (safe refusal) - no report exists
 *   5  internal_error refusal, or a usage/IO error before any input was
 *      read - no report exists, and no other refusal_kind uses this code
 *
 * Exit codes never assert that the research as a whole is correct.
 */

import * as fs from "node:fs";
import { canonicalProjection, recomputeContentDigest } from "./digest.js";
import { checkParsedLimits, checkRawSize } from "./limits.js";
import { parseStrictJson, StrictJsonError } from "./strict-json.js";
import { refuseNonUtf8Input, verifyRecordText, type VerifyOutcome } from "./verify.js";

type OutputFormat = "json" | "json-compact" | "human";

function parseFormatFlag(args: string[]): OutputFormat {
  const index = args.indexOf("--format");
  if (index === -1) return "human";
  const value = args[index + 1];
  if (value === "json" || value === "json-compact" || value === "human") return value;
  fail(5, `--format must be json, json-compact, or human (got ${String(value)})`);
}

function writeHumanSummary(outcome: VerifyOutcome): void {
  if (outcome.report !== undefined) {
    const lines: string[] = [];
    const c = outcome.report.conformance;
    lines.push(`conformance: ${c.execution}${c.outcome === undefined ? "" : ` ${c.outcome}`}`);
    for (const result of outcome.report.verification_results) {
      const shortId = result.check_id.split(":")[3] ?? result.check_id;
      const outcomePart = result.outcome === undefined ? "" : ` ${result.outcome}`;
      const reasons = result.reason_codes.length > 0 ? ` [${result.reason_codes.join(", ")}]` : "";
      lines.push(`${shortId}: ${result.execution}${outcomePart}${reasons}`);
    }
    for (const [key, value] of Object.entries(
      outcome.report.guarantee_boundary as unknown as Record<string, string>,
    )) {
      lines.push(`${key}: ${value}`);
    }
    process.stderr.write(`${lines.join("\n")}\n`);
  } else if (outcome.refusal !== undefined) {
    process.stderr.write(`refused (${outcome.refusal.refusal_kind}): ${outcome.refusal.message}\n`);
  }
}

function fail(exitCode: number, message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(exitCode);
}

function readInputBytes(filePath: string): Buffer {
  try {
    return fs.readFileSync(filePath);
  } catch (err) {
    fail(5, `cannot read ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Strict UTF-8 decoding: invalid byte sequences are rejected, never
 * silently replaced with U+FFFD (the input would otherwise be reinterpreted
 * before any JSON processing could see it). Returns null on failure.
 */
function decodeStrictUtf8(bytes: Buffer): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/**
 * The shared strict input path (NRS-CANON-0007, NRS-CANON-0008): every CLI
 * subcommand - verify, canonicalize, digest - parses through
 * parseStrictJson, so a duplicate member name or an unpaired surrogate is
 * rejected before canonicalization or digest computation everywhere, not
 * only under `verify`.
 */
function parseWithinLimits(text: string): unknown {
  const sizeViolation = checkRawSize(Buffer.byteLength(text, "utf8"));
  if (sizeViolation !== null) fail(4, `refused: ${sizeViolation.message}`);
  let parsed: unknown;
  try {
    parsed = parseStrictJson(text);
  } catch (err) {
    if (err instanceof RangeError) fail(4, "refused: input exhausted the JSON parser");
    if (err instanceof StrictJsonError) fail(2, `refused: ${err.message}`);
    fail(2, `input is not JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
  const violations = checkParsedLimits(parsed);
  if (violations.length > 0) {
    fail(4, `refused: ${violations.map((v) => v.message).join("; ")}`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    fail(2, "input is not a JSON object");
  }
  return parsed;
}

function main(): void {
  const args = process.argv.slice(2);
  const [command, filePath] = args;
  if (command === undefined || filePath === undefined) {
    fail(
      5,
      "usage: nomue-record <verify|canonicalize|digest> <record.json> [--format json|json-compact|human]",
    );
  }
  const format = parseFormatFlag(args);

  const bytes = readInputBytes(filePath);
  const text = decodeStrictUtf8(bytes);
  if (text === null) {
    if (command === "verify") {
      const outcome = refuseNonUtf8Input(bytes.length);
      const spacing = format === "json-compact" ? undefined : 2;
      process.stdout.write(`${JSON.stringify(outcome.refusal, null, spacing)}\n`);
      if (format !== "json" && format !== "json-compact") {
        process.stderr.write(`refused (parse_error): input is not valid UTF-8 text\n`);
      }
      process.exit(outcome.exitCode);
    }
    fail(2, `input is not valid UTF-8: ${filePath}`);
  }

  switch (command) {
    case "verify": {
      const outcome = verifyRecordText(text);
      const body = outcome.report ?? outcome.refusal;
      const spacing = format === "json-compact" ? undefined : 2;
      process.stdout.write(`${JSON.stringify(body, null, spacing)}\n`);
      if (format !== "json" && format !== "json-compact") {
        writeHumanSummary(outcome);
      }
      process.exit(outcome.exitCode);
      break;
    }
    case "canonicalize": {
      const parsed = parseWithinLimits(text) as Record<string, unknown>;
      try {
        process.stdout.write(canonicalProjection(parsed));
      } catch (err) {
        fail(2, `cannot canonicalize: ${err instanceof Error ? err.message : String(err)}`);
      }
      process.exit(0);
      break;
    }
    case "digest": {
      const parsed = parseWithinLimits(text) as Record<string, unknown>;
      try {
        process.stdout.write(
          `${JSON.stringify({ content_digest: recomputeContentDigest(parsed) }, null, 2)}\n`,
        );
      } catch (err) {
        fail(2, `cannot compute digest: ${err instanceof Error ? err.message : String(err)}`);
      }
      process.exit(0);
      break;
    }
    default:
      fail(5, `unknown command: ${command}`);
  }
}

main();
