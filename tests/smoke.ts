import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parse as parseYaml } from "yaml";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const nomue = join(root, "bin", "nomue.cjs");
const BUNDLE_021 = "urn:nomue:bundle:itgc-guarantee:0.2.1-draft.1";
const RECOMPUTE_021 = "urn:nomue:check:welch-recompute:0.2.1-draft.1";
const C8 = "83d07d03f27cec0c245cf836c042e5378733b0a2";
const R = "47eeafb0b2b096658cacf219bf5af867b687c6a7";
const D = "5db97826e0905a72e0fed14536d820e77af9be95";
const RELEASE_TAG = "release-1";
const SNAPSHOT =
  "sha256:fc26c770538abe3598fc27a571ca6e99cc29763e0a25859a80c267ee2d80ab06";

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const sourcePin = JSON.parse(
  readFileSync(join(root, "SOURCE-PIN.json"), "utf8"),
) as Record<string, unknown>;

const expectedPin: Record<string, unknown> = {
  protocol_source_commit: C8,
  pin_class: "public_release",
  final_candidate_pin_pending: false,
  release_target_bundle: BUNDLE_021,
  protocol_release_status: "public_release",
  protocol_release_tag: RELEASE_TAG,
  release_decision_commit: D,
  signed_release_source_commit: R,
  protocol_snapshot_hash: SNAPSHOT,
  packaging_version: "0.2.1-rc.0",
};

for (const [key, expected] of Object.entries(expectedPin)) {
  if (sourcePin[key] !== expected) {
    fail(`Release 1 source pin drift: ${key} expected ${String(expected)}, got ${String(sourcePin[key])}`);
  }
}

const bundleRegistry = parseYaml(
  readFileSync(join(root, "registries", "interpretation-bundles.yaml"), "utf8"),
) as {
  entries?: Array<{ bundle_id?: string; public_release?: boolean; status?: string }>;
};
const releaseBundle = bundleRegistry.entries?.find((entry) => entry.bundle_id === BUNDLE_021);
if (!releaseBundle) fail("Release 1 bundle is missing from interpretation-bundles registry");
if (releaseBundle.public_release !== true) {
  fail("Release 1 bundle must be marked public_release: true");
}
if (releaseBundle.status !== "EXPERIMENTAL") {
  fail("Release 1 bundle must retain EXPERIMENTAL status for the Public Draft");
}

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
