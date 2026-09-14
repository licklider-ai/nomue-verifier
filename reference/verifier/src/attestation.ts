/**
 * Attestation reference implementation: NRS-ATTEST-0001..0005 (first
 * increment, merged by the steward) plus the Batch 4
 * signature-infrastructure additions - trust root pinning
 * (NRS-ATTEST-0007/0008) and the optional RFC 3161 timestamp member
 * (NRS-ATTEST-0011). See spec/attestation/README.md.
 *
 * Non-normative reference implementation. Real Ed25519 sign/verify via
 * node:crypto (no third-party cryptography dependency). NOT wired into the
 * `verify` CLI pipeline: every registered bundle's attestation_support is
 * "none" (registries/interpretation-bundles.yaml), so there is no bundle
 * that would attach an attestation automatically. attachAttestations is an
 * explicit, separate step a caller performs on an already-produced report.
 */

import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
} from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { parse as parseYaml } from "yaml";
import { jcsCanonicalize } from "./jcs.js";
import type { CheckResult, Scope, VerificationReport } from "./report-types.js";
import { verifierRepoRoot } from "./resources.js";

export const ATTESTATION_STATEMENT_ID =
  "urn:nomue:attestation-statement:verification-procedure-executed:1";
export const ED25519_SUITE_ID = "urn:nomue:signature-suite:ed25519:1";

/** The fixed statement text NRS-ATTEST-0001 binds to ATTESTATION_STATEMENT_ID. Restated here only as a code comment, never as a runtime string a caller could substitute. */

export interface RecordReference {
  record_id: string;
  revision_id: string;
  content_digest: string;
}

export interface Attester {
  name: string;
  key_id: string;
}

export interface Signature {
  algorithm: typeof ED25519_SUITE_ID;
  key_id: string;
  value: string;
}

export interface VerificationProcedureRef {
  check_id: string;
  check_version: string;
  outcome: "pass" | "fail";
}

/** Same shape as CheckResult (execution-outcome model), reused deliberately (NRS-ATTEST-0004). */
export type SignatureVerificationResult = CheckResult;

export interface UnsignedAssertion {
  assertion_id: string;
  subject: RecordReference;
  scope: Scope;
  statement: typeof ATTESTATION_STATEMENT_ID;
  verification_procedure: VerificationProcedureRef;
}

export interface Rfc3161Timestamp {
  /** Base64-encoded RFC 3161 TimeStampToken over the assertion's signing payload. */
  token: string;
  /** Informative TSA identification; an identifier, never dereferenced (NRS-CORE-0004). */
  tsa_name?: string;
}

export interface Assertion extends UnsignedAssertion {
  signature: Signature;
  signature_verification: SignatureVerificationResult;
  /** OPTIONAL (NRS-ATTEST-0011, EXPERIMENTAL): never a v0 validity condition; absence carries no claim. */
  rfc3161_timestamp?: Rfc3161Timestamp;
}

export interface Attestation {
  attestation_id: string;
  attester: Attester;
  created_at: string;
  assertions: Assertion[];
}

/** Generates a fresh Ed25519 keypair (test/demo convenience, not key custody policy). */
export function generateEd25519KeyPair(): { publicKey: string; privateKey: string } {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    publicKey: publicKey.export({ type: "spki", format: "pem" }).toString(),
    privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };
}

/** DSSE payload type for nomue assertions (fixed; part of the signed context). */
export const ASSERTION_PAE_PAYLOAD_TYPE = "application/vnd.nomue.assertion+json";

/**
 * DSSE Pre-Authentication Encoding (PAE): domain separation for the
 * attestation signing context (Batch 5, NRS-CANON-0020; ADR-0027):
 *   PAE(type, body) = "DSSEv1" SP LEN(type) SP type SP LEN(body) SP body
 * with LEN in decimal bytes. Signing raw canonical bytes without this
 * framing would let the same bytes be replayed in a different context.
 */
export function preAuthenticationEncoding(payloadType: string, body: Buffer): Buffer {
  const typeBytes = Buffer.from(payloadType, "utf8");
  return Buffer.concat([
    Buffer.from(`DSSEv1 ${typeBytes.length} `, "utf8"),
    typeBytes,
    Buffer.from(` ${body.length} `, "utf8"),
    body,
  ]);
}

/**
 * The exact bytes an Ed25519 signature is computed over: the DSSE PAE of
 * the JCS canonical form of the unsigned assertion content. Deterministic
 * and independent of key material, so a verifier recomputes the same bytes
 * from the assertion alone. PRE-RELEASE DESTRUCTIVE change (Batch 5):
 * signatures over the previous un-framed canonical bytes do not verify.
 */
export function assertionSigningPayload(unsigned: UnsignedAssertion): Buffer {
  const canonical = Buffer.from(
    jcsCanonicalize(unsigned as unknown as Record<string, unknown>),
    "utf8",
  );
  return preAuthenticationEncoding(ASSERTION_PAE_PAYLOAD_TYPE, canonical);
}

/**
 * Signs an assertion and computes its own signature_verification result
 * (a fresh signature always verifies against the payload it was just
 * computed over, so this is "completed"/"pass" by construction - the
 * interesting case, a tampered or mismatched signature, is exercised by
 * verifyAssertionSignature below, not here).
 */
export function signAssertion(
  unsigned: UnsignedAssertion,
  privateKeyPem: string,
  keyId: string,
): Assertion {
  const payload = assertionSigningPayload(unsigned);
  const privateKey = createPrivateKey(privateKeyPem);
  const signatureBytes = sign(null, payload, privateKey);
  const signature: Signature = {
    algorithm: ED25519_SUITE_ID,
    key_id: keyId,
    value: signatureBytes.toString("base64"),
  };
  const assertion: Assertion = {
    ...unsigned,
    signature,
    // Placeholder until verifyAssertionSignature recomputes it against the
    // actual public key; a signer is not a verifier (NRS-ATTEST-0004: the
    // signature_verification result is depth-3 evidence produced BY
    // verification, not asserted by the signer).
    signature_verification: {
      check_id: "urn:nomue:check:attestation-signature:0.1.0-draft.1",
      check_version: "0.1.0-draft.1",
      execution: "not_run",
      scope: unsigned.scope,
      reason_codes: ["NRS-SIGNATURE-NOT-YET-VERIFIED"],
    },
  };
  return assertion;
}

/**
 * Verifies an assertion's signature against a supplied public key and
 * returns the depth-3 signature_verification result (NRS-ATTEST-0004).
 * This is the only place a "pass" signature_verification result is
 * legitimately produced; signAssertion above never claims one.
 */
export function verifyAssertionSignature(
  assertion: Assertion,
  publicKeyPem: string,
): SignatureVerificationResult {
  const checkId = "urn:nomue:check:attestation-signature:0.1.0-draft.1";
  const checkVersion = "0.1.0-draft.1";
  const scope = assertion.scope;

  if (assertion.signature.algorithm !== ED25519_SUITE_ID) {
    // Allow-list enforcement (NRS-ATTEST-0003): an unlisted algorithm is
    // never dispatched to a verification routine at all.
    return {
      check_id: checkId,
      check_version: checkVersion,
      execution: "completed",
      outcome: "fail",
      scope,
      reason_codes: ["NRS-SIGNATURE-ALGORITHM-NOT-ALLOWED"],
    };
  }

  // The RFC 3161 token (if any) is applied AFTER signing, over the signing
  // payload itself, so it is excluded from the recomputed payload exactly
  // like the signature members (NRS-ATTEST-0011).
  const {
    signature: _signature,
    signature_verification: _sv,
    rfc3161_timestamp: _ts,
    ...unsigned
  } = assertion;
  const payload = assertionSigningPayload(unsigned);
  let valid: boolean;
  try {
    const publicKey = createPublicKey(publicKeyPem);
    valid = verify(null, payload, publicKey, Buffer.from(assertion.signature.value, "base64"));
  } catch (err) {
    return {
      check_id: checkId,
      check_version: checkVersion,
      execution: "error",
      scope,
      reason_codes: ["NRS-SIGNATURE-VERIFICATION-ERROR"],
      error: {
        error_type: "signature_verification_error",
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }

  return {
    check_id: checkId,
    check_version: checkVersion,
    execution: "completed",
    outcome: valid ? "pass" : "fail",
    scope,
    reason_codes: valid ? [] : ["NRS-SIGNATURE-INVALID"],
  };
}

/**
 * Attaches attestations to an already-produced report. Returns a NEW
 * report object; `conformance` and `verification_results` are carried by
 * reference, unchanged (NRS-VERIFY-0004 non-escalation, NRS-ATTEST-0005
 * separation) - proven by tooling/tests/attestation.test.ts, which asserts
 * byte-identical JSON for both fields before and after this call.
 */
export function attachAttestations(
  report: VerificationReport,
  attestations: Attestation[],
): VerificationReport & { attestations: Attestation[] } {
  return {
    ...report,
    attestations,
  };
}

// ---------------------------------------------------------------------------
// Trust root (Batch 4, NRS-ATTEST-0007/0008): only pinned keys make a
// signature "nomue-attested". A structurally valid signature by any other
// key fails explicitly; nothing is silently accepted or dropped.
// ---------------------------------------------------------------------------

export interface TrustRootKey {
  key_id: string;
  generation: number;
  suite_id: string;
  public_key_pem: string;
  fingerprint: string;
  valid_from: string;
  valid_until: string | null;
  status: "active" | "superseded";
  superseded_by: string | null;
}

export interface TrustRoot {
  registry: string;
  registry_version: string;
  updated: string;
  fingerprint_method: string;
  keys: TrustRootKey[];
}

/**
 * SHA-256 over the DER-encoded SubjectPublicKeyInfo of the public key,
 * rendered as "sha256:" + lowercase hex - the fingerprint method fixed by
 * registries/attestation-trust-root.yaml.
 */
export function computeSpkiSha256Fingerprint(publicKeyPem: string): string {
  const der = createPublicKey(publicKeyPem).export({ type: "spki", format: "der" });
  return `sha256:${createHash("sha256").update(der).digest("hex")}`;
}

/** Loads the trust root registry from this repository (local file only, never fetched). */
export function loadTrustRoot(): TrustRoot {
  const text = fs.readFileSync(
    path.join(verifierRepoRoot, "registries", "attestation-trust-root.yaml"),
    "utf8",
  );
  return parseYaml(text) as TrustRoot;
}

/**
 * Verifies an assertion as "nomue-attested" against the trust root
 * (NRS-ATTEST-0007). The evaluation time is an explicit ISO 8601 input,
 * never an environment default (same discipline as the confidence level).
 * Failure modes, each an explicit failed result:
 *   - signature.key_id not pinned            -> NRS-SIGNATURE-KEY-NOT-PINNED
 *   - pinned but outside the validity window -> NRS-SIGNATURE-KEY-OUTSIDE-VALIDITY
 *   - pinned and in-window but invalid       -> NRS-SIGNATURE-INVALID (via
 *     verifyAssertionSignature against the PINNED key, never a caller-supplied one)
 */
export function verifyAssertionAsNomueAttested(
  assertion: Assertion,
  trustRoot: TrustRoot,
  evaluationTimeIso: string,
): SignatureVerificationResult {
  const checkId = "urn:nomue:check:attestation-signature:0.1.0-draft.1";
  const checkVersion = "0.1.0-draft.1";
  const scope = assertion.scope;

  const pinned = trustRoot.keys.find((k) => k.key_id === assertion.signature.key_id);
  if (pinned === undefined) {
    return {
      check_id: checkId,
      check_version: checkVersion,
      execution: "completed",
      outcome: "fail",
      scope,
      reason_codes: ["NRS-SIGNATURE-KEY-NOT-PINNED"],
    };
  }

  const at = Date.parse(evaluationTimeIso);
  const from = Date.parse(pinned.valid_from);
  const until =
    pinned.valid_until === null ? Number.POSITIVE_INFINITY : Date.parse(pinned.valid_until);
  if (Number.isNaN(at) || Number.isNaN(from) || Number.isNaN(until) || at < from || at > until) {
    return {
      check_id: checkId,
      check_version: checkVersion,
      execution: "completed",
      outcome: "fail",
      scope,
      reason_codes: ["NRS-SIGNATURE-KEY-OUTSIDE-VALIDITY"],
    };
  }

  return verifyAssertionSignature(assertion, pinned.public_key_pem);
}
