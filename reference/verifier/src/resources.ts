/**
 * Local resource loading for the reference verifier: schemas and registries
 * are read from this repository only. Nothing is fetched from the network,
 * and Record-supplied identifiers are never dereferenced (NRS-CORE-0004,
 * NRS-SEC-0001).
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { Ajv2020, type ValidateFunction } from "ajv/dist/2020.js";

export const verifierRepoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);

export const VERIFIER_NAME = "nomue-reference-verifier";
export const VERIFIER_VERSION = "0.2.0-draft.5";

const SCHEMA_FILES = [
  "schemas/common/identifier.schema.json",
  "schemas/common/execution-outcome.schema.json",
  "schemas/common/execution-outcome-0.2.schema.json",
  "schemas/profiles/itgc-minimal.schema.json",
  "schemas/profiles/itgc-guarantee-0.2.schema.json",
  "schemas/record/record.schema.json",
  "schemas/record/record-0.2.schema.json",
  "schemas/reports/verification-report.schema.json",
  "schemas/reports/verification-report-0.2.schema.json",
  "schemas/reports/verifier-refusal-0.2.schema.json",
  "schemas/reports/verifier-refusal-0.2-draft-2.schema.json",
  "schemas/reports/verifier-refusal-0.2-draft-3.schema.json",
  "schemas/routing/routing-envelope-0.2.schema.json",
] as const;

export const RECORD_SCHEMA_ID = "urn:nomue:schema:record:0.1.0-draft.1";
export const REPORT_SCHEMA_ID = "urn:nomue:schema:verification-report:0.1.0-draft.1";
export const RECORD_2A_SCHEMA_ID = "urn:nomue:schema:record:0.2.0-draft.1";
export const REPORT_2A_SCHEMA_ID = "urn:nomue:schema:verification-report:0.2.0-draft.1";
export const REFUSAL_2A_SCHEMA_ID = "urn:nomue:schema:verifier-refusal:0.2.0-draft.3";
export const ROUTING_ENVELOPE_SCHEMA_ID = "urn:nomue:schema:routing-envelope:0.2.0-draft.1";

/**
 * Exact bundle dispatch (NRS-VERSION-0005): behavior is selected only by an
 * exactly registered bundle identifier; nothing is inferred from version
 * proximity.
 */
export const PHASE1_BUNDLE_ID = "urn:nomue:bundle:itgc-minimal:0.1.0-draft.1";
export const PHASE2A_BUNDLE_ID = "urn:nomue:bundle:itgc-guarantee:0.2.0-draft.1";
export const PHASE2A_021_BUNDLE_ID = "urn:nomue:bundle:itgc-guarantee:0.2.1-draft.1";

export interface BundleEntry {
  bundle_id: string;
  status: string;
  schema_version: string;
  canonicalization_version: string;
  profile_id: string;
  public_check_set_version: string;
  attestation_support: string;
  allowed_check_ids: string[];
}

export interface ToleranceSpec {
  absolute: number;
  relative: number;
}

export interface CheckEntry {
  check_id: string;
  version: string;
  tolerance_policy: {
    kind: "not_applicable" | "exact" | "numeric";
    exact_fields?: string[];
    numeric_tolerances?: Record<string, ToleranceSpec>;
  };
  comparison_constants?: {
    supported_confidence_level?: number;
    supported_ci_method_id?: string;
    supported_estimand_kind?: string;
  };
}

export interface VerifierResources {
  validateRecord: ValidateFunction;
  validateReport: ValidateFunction;
  validateRecord2a: ValidateFunction;
  validateReport2a: ValidateFunction;
  validateRefusal: ValidateFunction;
  validateRoutingEnvelope: ValidateFunction;
  bundles: Map<string, BundleEntry>;
  checks: Map<string, CheckEntry>;
  sourceCommit: string;
}

function readRepoFile(rel: string): string {
  return fs.readFileSync(path.join(verifierRepoRoot, rel), "utf8");
}

/** Read the current git commit without executing any external process. */
export function readSourceCommit(): string {
  try {
    const pinText = fs.readFileSync(path.join(verifierRepoRoot, "SOURCE-PIN.json"), "utf8");
    const pin = JSON.parse(pinText) as { protocol_source_commit?: string };
    if (
      typeof pin.protocol_source_commit === "string" &&
      /^[0-9a-f]{40}$/.test(pin.protocol_source_commit)
    ) {
      return pin.protocol_source_commit;
    }
  } catch {
    // fall through to git HEAD or unknown
  }

  try {
    const head = fs.readFileSync(path.join(verifierRepoRoot, ".git", "HEAD"), "utf8").trim();
    if (/^[0-9a-f]{40}$/.test(head)) return head;
    const refMatch = /^ref: (.+)$/.exec(head);
    if (refMatch !== null) {
      const refPath = path.join(verifierRepoRoot, ".git", ...(refMatch[1] as string).split("/"));
      return fs.readFileSync(refPath, "utf8").trim();
    }
  } catch {
    // fall through
  }
  return "unknown";
}

let cached: VerifierResources | null = null;

/**
 * Build fresh verifier resources. `bundleEntryOrder` optionally permutes the
 * registry entry array BEFORE the bundle map is built; it exists so the
 * conformance suite can prove that registry order carries no semantic
 * meaning (NRS-VERSION-0007): dispatch is exact identifier lookup, so any
 * permutation must produce byte-identical routing outcomes.
 */
export function buildVerifierResources(
  bundleEntryOrder?: (entries: BundleEntry[]) => BundleEntry[],
): VerifierResources {
  // strictRequired stays off: the execution/outcome invariant legitimately
  // uses `required`/`not required` inside conditionals without redeclaring
  // the properties there.
  const ajv = new Ajv2020({
    allErrors: true,
    strictSchema: true,
    strictTypes: true,
    strictRequired: false,
  });
  for (const file of SCHEMA_FILES) {
    ajv.addSchema(JSON.parse(readRepoFile(file)) as object);
  }
  const validateRecord = ajv.getSchema(RECORD_SCHEMA_ID);
  const validateReport = ajv.getSchema(REPORT_SCHEMA_ID);
  const validateRecord2a = ajv.getSchema(RECORD_2A_SCHEMA_ID);
  const validateReport2a = ajv.getSchema(REPORT_2A_SCHEMA_ID);
  const validateRefusal = ajv.getSchema(REFUSAL_2A_SCHEMA_ID);
  const validateRoutingEnvelope = ajv.getSchema(ROUTING_ENVELOPE_SCHEMA_ID);
  if (
    validateRecord === undefined ||
    validateReport === undefined ||
    validateRecord2a === undefined ||
    validateReport2a === undefined ||
    validateRefusal === undefined ||
    validateRoutingEnvelope === undefined
  ) {
    throw new Error("verifier schemas failed to load");
  }

  const bundlesDoc = parseYaml(readRepoFile("registries/interpretation-bundles.yaml")) as {
    entries: BundleEntry[];
  };
  const checksDoc = parseYaml(readRepoFile("registries/public-checks.yaml")) as {
    checks: CheckEntry[];
  };

  const entries =
    bundleEntryOrder === undefined ? bundlesDoc.entries : bundleEntryOrder([...bundlesDoc.entries]);
  const bundles = new Map(entries.map((b) => [b.bundle_id, b]));
  // Dispatch requires implemented AND registered bundles (NRS-VERSION-0005):
  // a withdrawn registry entry must not remain silently interpretable.
  for (const implemented of [PHASE1_BUNDLE_ID, PHASE2A_BUNDLE_ID, PHASE2A_021_BUNDLE_ID]) {
    if (!bundles.has(implemented)) {
      throw new Error(
        `implemented bundle ${implemented} is not registered in the interpretation-bundle registry`,
      );
    }
  }

  const checks = new Map(checksDoc.checks.map((c) => [c.check_id, c]));
  const p021 = checks.get("urn:nomue:check:welch-recompute:0.2.1-draft.1");
  if (p021?.tolerance_policy.kind === "numeric") {
    const pTol = p021.tolerance_policy.numeric_tolerances?.p_value;
    if (pTol === undefined || pTol.absolute !== 0 || pTol.relative !== 1e-10) {
      throw new Error(
        "welch-recompute 0.2.1-draft.1 p_value tolerance must be absolute 0 and relative 1e-10",
      );
    }
  }

  return {
    validateRecord,
    validateReport,
    validateRecord2a,
    validateReport2a,
    validateRefusal,
    validateRoutingEnvelope,
    bundles,
    checks,
    sourceCommit: readSourceCommit(),
  };
}

export function loadVerifierResources(): VerifierResources {
  if (cached !== null) return cached;
  cached = buildVerifierResources();
  return cached;
}

export const CHECK_IDS = {
  conformance: "urn:nomue:check:record-conformance:0.1.0-draft.1",
  integrity: "urn:nomue:check:record-integrity:0.1.0-draft.1",
  preconditions: "urn:nomue:check:itgc-preconditions:0.1.0-draft.1",
  welch: "urn:nomue:check:welch-recompute:0.1.0-draft.1",
} as const;

export const CHECK_IDS_2A = {
  conformance: "urn:nomue:check:record-conformance:0.2.0-draft.1",
  integrity: "urn:nomue:check:record-integrity:0.2.0-draft.1",
  admissibility: "urn:nomue:check:itgc-profile-admissibility:0.2.0-draft.1",
  computability: "urn:nomue:check:welch-computability:0.2.0-draft.1",
  welch: "urn:nomue:check:welch-recompute:0.2.0-draft.1",
} as const;

export const CHECK_IDS_2A_021 = {
  computability: "urn:nomue:check:welch-computability:0.2.1-draft.1",
  welch: "urn:nomue:check:welch-recompute:0.2.1-draft.1",
} as const;
