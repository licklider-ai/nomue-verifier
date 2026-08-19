import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const nomue = join(root, "bin", "nomue.cjs");
const BUNDLE_021 = "urn:nomue:bundle:itgc-guarantee:0.2.1-draft.1";
const RECOMPUTE_021 = "urn:nomue:check:welch-recompute:0.2.1-draft.1";

function run(record: string): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [nomue, "verify", record, "--format", "json"], {
    cwd: root,
    encoding: "utf8",
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function parseJson(label: string, text: string): Record<string, unknown> {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch (error) {
    console.error(`${label}: expected machine-readable JSON`, error);
    console.error(text);
    process.exit(1);
  }
}

const valid = run("records/valid.json");
if (valid.status !== 0) {
  console.error("valid 0.2.1 hero: expected exit 0, got", valid.status);
  console.error(valid.stdout);
  console.error(valid.stderr);
  process.exit(1);
}
if (valid.stderr !== "") {
  console.error("valid 0.2.1 hero: --format json must not emit a human summary to stderr");
  console.error(valid.stderr);
  process.exit(1);
}
const validReport = parseJson("valid 0.2.1 hero", valid.stdout);
if (!valid.stdout.includes(BUNDLE_021) || !valid.stdout.includes(RECOMPUTE_021)) {
  console.error("valid 0.2.1 hero: expected exact Release 1 target bundle/check IDs");
  process.exit(1);
}
const validBoundary = validReport["guarantee_boundary"] as Record<string, unknown> | undefined;
if (validBoundary?.["scientific_validity"] !== "not_asserted") {
  console.error("valid 0.2.1 hero: expected scientific_validity non-claim");
  process.exit(1);
}

const invalid = run("records/invalid-result-mismatch.json");
if (invalid.status !== 2) {
  console.error("invalid 0.2.1 hero: expected exit 2, got", invalid.status);
  console.error(invalid.stdout);
  console.error(invalid.stderr);
  process.exit(1);
}
if (invalid.stderr !== "") {
  console.error("invalid 0.2.1 hero: --format json must not emit a human summary to stderr");
  process.exit(1);
}
parseJson("invalid 0.2.1 hero", invalid.stdout);
if (!invalid.stdout.includes(RECOMPUTE_021)) {
  console.error("invalid 0.2.1 hero: expected 0.2.1 recompute check");
  process.exit(1);
}
if (!invalid.stdout.includes("NRS-DECLARED-RESULT-MISMATCH")) {
  console.error("invalid 0.2.1 hero: expected declared-result mismatch reason code");
  process.exit(1);
}

console.log("smoke: OK");
