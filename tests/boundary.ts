import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const manifest = JSON.parse(
  fs.readFileSync(path.join(root, "EXTRACTION-MANIFEST.json"), "utf8"),
) as { files: Array<{ destination: string }> };
const historicalExtractionFiles = new Set(
  manifest.files.map((f) => f.destination),
);

// EXTRACTION-MANIFEST.json is immutable historical evidence for the August demo
// extraction. Release 1 operational/rebuild/offline-evidence files added later are
// authorized here explicitly instead of rewriting that historical manifest.
const postExtractionOperationalFiles = new Set([
  // Founder-authorized CI cancellation repair; unchanged public check semantics.
  "reference/stats-kernel/src/precise-ci.ts",
  "tests/ci-precision.ts",
  "tests/ci-reference.json",
  "tests/generate-ci-reference.py",
  "CI-ACCURACY-REPAIR.md",
  ".github/ISSUE_TEMPLATE/bug.yml",
  ".github/ISSUE_TEMPLATE/config.yml",
  ".github/ISSUE_TEMPLATE/documentation.yml",
  ".github/ISSUE_TEMPLATE/feedback.yml",
  ".github/workflows/publish-npm.yml",
  "REBUILD.md",
  "scripts/rebuild-evidence.mjs",
  "scripts/package-smoke.mjs",
  "OFFLINE-VERIFICATION.md",
  "offline/Dockerfile",
  "offline/network-probe.mjs",
  // Founder-authorized reference source ownership transfer (2026-09-14).
  // These exact files do not broaden the npm runtime or supported bundles.
  ".gitattributes",
  "AGENTS.md",
  // Owner-approved instruction import; not part of the published runtime.
  "CLAUDE.md",
  "REFERENCE-ORIGIN.json",
  "REFERENCE-OWNERSHIP.md",
  "reference/spikes/paired-t.ts",
  "reference/verifier/src/.npmignore",
  "reference/verifier/src/approval.ts",
  "reference/verifier/src/attestation.ts",
  "reference/verifier/src/lifecycle.ts",
  // Steward direction 2026-09-26: numerical methods list and development freeze.
  "NUMERICAL-METHODS.md",
  "development/README.md",
  // Protocol PR #355 D0 GO permits these unissued D1 development assets.
  // Exact entries only: none is a supported bundle or npm runtime module.
  "development/r3-holm/fault-injections.ts",
  "development/r3-holm/fault-injections.test.ts",
  "development/r3-holm/outer-fault-entry.mjs",
  "development/r3-holm/B2-INTEGRATION-HANDOFF.md",
  "development/r3-holm/ORACLES-HANDOFF.md",
  "development/r3-holm/context-matrix.ts",
  "development/r3-holm/context-matrix.test.ts",
  "development/r3-holm/context-sensitivity.mjs",
  "development/r3-holm/CONTEXT-MATRIX-HANDOFF.md",
  "development/r3-holm/helper-inner-run.mjs",
  "development/r3-holm/helper-faults.py",
  "development/r3-holm/HELPER-FAULTS-HANDOFF.md",
  "development/r3-holm/evidence/helper-before-results.json",
  "development/r3-holm/oracles.test.ts",
  "development/r3-holm/oracles/generate.py",
  "development/r3-holm/oracles/projection-vectors.json",
  "development/r3-holm/numerics/test_replay_b2.py",
  "development/r3-holm/numerics/b2-sources/repair-results.json",
  "development/r3-holm/evidence/ORACLES-VALIDATION.json",
  "development/r3-holm/evidence/oracles-tests.tap",
  "development/r3-holm/evidence/oracles-b2-replay.json",
  "development/r3-holm/evidence/B2-VALIDATION.json",
  "development/r3-holm/evidence/b2-replay.json",
  "development/r3-holm/evidence/b2-tests.tap",
  "development/r3-holm/EXPANSION-HANDOFF.md",
  "development/r3-holm/ACCEPTANCE-COVERAGE.json",
  "development/r3-holm/evidence/EXPANSION-VALIDATION.json",
  "development/r3-holm/evidence/expansion-tests.tap",
  "development/r3-holm/OUTER-CALL-HANDOFF.md",
  "development/r3-holm/OUTER-PROVENANCE.json",
  "development/r3-holm/controlled-call.test.ts",
  "development/r3-holm/controlled-call.ts",
  "development/r3-holm/evidence/OUTER-VALIDATION.json",
  "development/r3-holm/evidence/outer-tests.tap",
  "development/r3-holm/evidence/outer-unsupported.json",
  "development/r3-holm/outer-cases.ts",
  "development/r3-holm/outer-entry.mjs",
  "development/r3-holm/outer-fixtures.ts",
  "development/r3-holm/outer-host.py",
  "development/r3-holm/outer-probes.mjs",
  "development/r3-holm/outer-run.mjs",
  "development/r3-holm/outer-runtime.json",
  "development/r3-holm/outer-supervisor.py",
  "development/r3-holm/outer-supervisor.test.py",
  "development/r3-holm/pin-outer.py",
  "development/r3-holm/stored-bytes.ts",
  "development/r3-holm/stored-bytes.test.ts",
  "development/r3-holm/dependencies.ts",
  "development/r3-holm/dependencies.test.ts",
  "development/r3-holm/README.md",
  "development/r3-holm/HANDOFF.md",
  "development/r3-holm/LOCAL-CHECKS-HANDOFF.md",
  "development/r3-holm/INNER-CALL-HANDOFF.md",
  "development/r3-holm/contracts/expected.schema.json",
  "development/r3-holm/contracts/output.schema.json",
  "development/r3-holm/contracts/reason-policy.json",
  "development/r3-holm/contracts/record.schema.json",
  "development/r3-holm/evidence/inner-tests.tap",
  "development/r3-holm/evidence/numerical-worker.txt",
  "development/r3-holm/execution.ts",
  "development/r3-holm/inner-call.test.ts",
  "development/r3-holm/inner-call.ts",
  "development/r3-holm/numerics/B2-PROVENANCE.json",
  "development/r3-holm/numerics/b2-sources/predecessor.py",
  "development/r3-holm/numerics/b2-sources/independent_checks.py",
  "development/r3-holm/numerics/b2-sources/test_repair.py",
  "development/r3-holm/numerics/b2-sources/RESULTS.json",
  "development/r3-holm/numerics/replay_b2.py",
  "development/r3-holm/numerics/INPUTS.json",
  "development/r3-holm/numerics/PROVENANCE.json",
  "development/r3-holm/numerics/candidate.py",
  "development/r3-holm/numerics/oracle.py",
  "development/r3-holm/numerics/test_worker.py",
  "development/r3-holm/numerics/worker.py",
  "development/r3-holm/output.ts",
  "development/r3-holm/tsconfig.json",
  "development/r3-holm/evidence/VALIDATION.json",
  "development/r3-holm/PROVENANCE.json",
  "development/r3-holm/d0-relations.ts",
  "development/r3-holm/local-checks.ts",
  "development/r3-holm/local-checks.test.ts",
  "development/r3-holm/fixtures/record.schema.json",
  "development/r3-holm/fixtures/expected.schema.json",
  "development/r3-holm/fixtures/declaration-shapes.json",
  "development/r3-holm/fixtures/example-record.jcs",
  "development/r3-holm/fixtures/example-expected.json",
  "development/r3-holm/fixtures/fixture-contracts.json",
  "development/r3-holm/fixtures/d0-cases.json",
  "development/r3-holm/fixtures/d0-example.json",
]);
const currentAllowlist = new Set([
  ...historicalExtractionFiles,
  ...postExtractionOperationalFiles,
]);

function walk(dir: string, base = ""): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const e of entries) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.name === "node_modules" || e.name === ".git") continue;
    if (e.name.endsWith(".tgz")) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full, rel));
    else out.push(rel.replace(/\\/g, "/"));
  }
  return out;
}

const files = walk(root);
const missing = files.filter((f) => !currentAllowlist.has(f));
const historicalExtra = [...historicalExtractionFiles].filter(
  (f) => !files.includes(f),
);
const operationalExtra = [...postExtractionOperationalFiles].filter(
  (f) => !files.includes(f),
);

if (missing.length > 0) {
  console.error(
    "T5 boundary: files outside historical+Release1 allowlist:",
    missing,
  );
  process.exit(1);
}
if (historicalExtra.length > 0) {
  console.error(
    "T5 boundary: historical extraction entries missing on disk:",
    historicalExtra,
  );
  process.exit(1);
}
if (operationalExtra.length > 0) {
  console.error(
    "T5 boundary: Release 1 operational entries missing on disk:",
    operationalExtra,
  );
  process.exit(1);
}

console.log("boundary: OK");
