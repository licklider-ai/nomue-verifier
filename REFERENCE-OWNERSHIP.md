# Public reference implementation ownership

Confirmed by the founder on 2026-09-14: develop and maintain the public
reference implementation in nomue-verifier. This changes source ownership;
Protocol retains all specification and conformance authority.

## Existing-source intake

REFERENCE-ORIGIN.json records the exact Protocol revision and file hashes.
Twenty existing shared source files were already present. Four additional
files (approval, attestation, lifecycle and the paired-t spike) are imported
byte-for-byte, with their prior experimental status unchanged. The three
additional verifier modules are excluded from npm packaging; the spike is
outside the package allowlist. They require the corresponding Protocol
development registries and tests and are not standalone supported APIs.

The existing resources.ts adapter differs deliberately: the package reads
its historical SOURCE-PIN.json, while Protocol uses its local repository
identity. Neither adapter is overwritten. The released CLI path, numerical
code, bundle support, dependencies and SOURCE-PIN.json are unchanged.

SOURCE-PIN.json remains historical release provenance; it is not a claim
that every future file originates in Protocol. REFERENCE-ORIGIN.json records
this intake, rather than imposing a permanent implementation freeze.

## Protocol consumption

Protocol keeps source copies at its current paths to preserve conformance,
offline checks and in-progress candidate imports. Those are pinned consumer
copies, not a second development home. Its source pin identifies an exact
Verifier commit and hashes. Its checker rejects drift, added untracked source
paths and mismatch with that upstream checkout. Update the Verifier first,
then perform a coordinated Protocol intake with required semantic gates and
conformance evidence; updating a source pin does not bypass those gates.

R3/R4 exploratory work under Protocol tooling and evidence remains where its
existing research/candidate authority places it. Do not rewrite fixed review
targets, signed releases or historical tags to make this move look retroactive.
Future promotion into the shared public checker uses this repository.

## Validation and provenance

The intake preserves all existing runtime source bytes. Package checks assert
that the newly imported development modules are absent from the npm tarball.
Protocol-side tests continue to exercise the existing experimental source
copies. The MCP adapter still invokes the same package CLI path.

Prepared with OpenAI Codex assistance under founder authorization. Byte
identity is migration evidence, not a new independent scientific review.
