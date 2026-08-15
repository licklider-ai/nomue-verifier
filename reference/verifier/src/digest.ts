/**
 * Content-digest computation for the digest projection: the Record without
 * its integrity member, canonicalized with JCS, prefixed with the
 * record-content domain-separation tag, and hashed with SHA-256
 * (spec/core/integrity-model.md, canonicalization/record-canonicalization.md,
 * NRS-CANON-0020).
 *
 * Domain separation (canonicalization 0.2.0-draft.1, Batch 5 / ADR-0027):
 * each digest context prefixes the hashed bytes with a fixed ASCII tag
 * terminated by a single LF, so bytes hashed in one context can never
 * collide with the same bytes hashed in another. This was a PRE-RELEASE
 * DESTRUCTIVE revision: digests computed under canonicalization
 * 0.1.0-draft.1 (untagged) do not match and were regenerated everywhere in
 * one coherent commit set.
 */

import { createHash } from "node:crypto";
import { CanonicalizationError, jcsCanonicalize } from "./jcs.js";

/**
 * Domain-separation tags (NRS-CANON-0020). The attestation signing payload
 * uses DSSE PAE instead (reference/verifier/src/attestation.ts), which is
 * its own domain separation; these tags cover the plain-digest contexts.
 */
export const DIGEST_DOMAIN_TAGS = {
  record_content: "nomue/record-content/v1\n",
  snapshot_manifest: "nomue/snapshot-manifest/v1\n",
} as const;

export function sha256HexOfUtf8(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * The digest projection: the Record object with the `integrity` member
 * removed and every other declared member retained (NRS-CORE-0006).
 */
export function digestProjection(record: Record<string, unknown>): Record<string, unknown> {
  const projection: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (key !== "integrity") projection[key] = value;
  }
  return projection;
}

/** Canonical UTF-8 text of the digest projection. */
export function canonicalProjection(record: Record<string, unknown>): string {
  return jcsCanonicalize(digestProjection(record));
}

/** Record-content digest of already-canonical text: sha256 over tag + bytes. */
export function contentDigestOfCanonicalText(canonicalText: string): string {
  return `sha256:${sha256HexOfUtf8(DIGEST_DOMAIN_TAGS.record_content + canonicalText)}`;
}

/** Recompute the content digest: sha256: + 64 lowercase hex digits (record-content context). */
export function recomputeContentDigest(record: Record<string, unknown>): string {
  return contentDigestOfCanonicalText(canonicalProjection(record));
}

export { CanonicalizationError };
