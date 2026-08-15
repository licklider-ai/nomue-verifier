import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const nomue = join(root, "bin", "nomue.cjs");

function run(record: string): { status: number | null; stdout: string } {
  const result = spawnSync(process.execPath, [nomue, "verify", record], {
    cwd: root,
    encoding: "utf8",
  });
  return { status: result.status, stdout: result.stdout };
}

const valid = run("records/valid.json");
if (valid.status !== 0) {
  console.error("T2 valid hero: expected exit 0, got", valid.status);
  console.error(valid.stdout);
  process.exit(1);
}
if (!valid.stdout.includes("PASS")) {
  console.error("T2 valid hero: expected PASS in output");
  process.exit(1);
}
if (!valid.stdout.includes("scientific_validity: not_asserted")) {
  console.error("T2 valid hero: expected scientific_validity non-claim");
  process.exit(1);
}

const invalid = run("records/invalid-result-mismatch.json");
if (invalid.status !== 2) {
  console.error("T3 invalid hero: expected exit 2, got", invalid.status);
  process.exit(1);
}
if (!invalid.stdout.includes("FAIL")) {
  console.error("T3 invalid hero: expected FAIL");
  process.exit(1);
}
if (!invalid.stdout.includes("NRS-DECLARED-RESULT-MISMATCH")) {
  console.error("T3 invalid hero: expected reason code");
  process.exit(1);
}

console.log("smoke: OK");
