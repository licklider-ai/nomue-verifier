/**
 * August Demo CLI presentation wrapper. Invokes the reference verifier;
 * does not reimplement verification semantics.
 */
import * as fs from "node:fs";
import { verifyRecordText } from "../reference/verifier/src/verify.js";
import heroReasonCodes from "../display/reason-codes-hero.json";

interface ReasonMeta {
  title: string;
  description: string;
}

const hero = heroReasonCodes as Record<string, ReasonMeta>;

function printGuaranteeBoundary(report: { guarantee_boundary: Record<string, string> }): void {
  for (const [key, value] of Object.entries(report.guarantee_boundary)) {
    console.log(`${key}: ${value}`);
  }
}

function collectFailReasonCodes(report: {
  verification_results: Array<{ outcome?: string; reason_codes: string[] }>;
}): string[] {
  const codes: string[] = [];
  for (const result of report.verification_results) {
    if (result.outcome === "fail") {
      for (const code of result.reason_codes) {
        if (!codes.includes(code)) codes.push(code);
      }
    }
  }
  return codes;
}

function main(): void {
  const args = process.argv.slice(2);
  if (args[0] !== "verify" || args[1] === undefined) {
    process.stderr.write("usage: nomue verify <record.json>\n");
    process.exit(5);
  }
  const text = fs.readFileSync(args[1], "utf8");
  const outcome = verifyRecordText(text);

  if (outcome.exitCode === 0 && outcome.report !== undefined) {
    console.log("PASS");
    console.log("");
    console.log("verification completed");
    printGuaranteeBoundary(outcome.report);
  } else if (outcome.report !== undefined) {
    console.log("FAIL");
    console.log("");
    for (const code of collectFailReasonCodes(outcome.report)) {
      console.log(code);
      const meta = hero[code];
      if (meta !== undefined) {
        console.log(meta.description);
      }
    }
    printGuaranteeBoundary(outcome.report);
  } else if (outcome.refusal !== undefined) {
    console.log("FAIL");
    console.log("");
    for (const code of outcome.refusal.reason_codes) {
      console.log(code);
    }
    console.log(outcome.refusal.message);
  }

  process.exit(outcome.exitCode);
}

main();
