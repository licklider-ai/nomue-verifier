# Security Policy

This repository is the **August Experimental Category Demo**: a local,
offline verifier for synthetic nomue Records. It is **not** a production
protocol release.

## Reporting a vulnerability

Report security issues in this demo privately via:

**https://licklider.ai**

Please do not open a public GitHub issue for security-sensitive findings.

For non-security demo packaging defects (broken `verify` commands, unclear
README instructions), GitHub Issues are welcome as described in
[CONTRIBUTING.md](CONTRIBUTING.md).

## Scope

**In scope**

- The verifier CLI and reference implementation in this repository
- Schemas and registries shipped here
- The two synthetic example Records in `records/`

**Out of scope**

- The unpublished nomue Record Specification
- Production attestation, signing, or trust-root operations
- Any nomue server or API (this demo does not call one)

After `npm install`, verification is designed to run locally and not to
dereference Record-supplied identifiers over the network.

## Supported versions

Only the published `main` branch of this experimental demo is in scope.
There is no stable release line.
