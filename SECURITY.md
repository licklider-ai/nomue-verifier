# Security Policy

This repository contains the experimental verifier package aligned to the published
**nomue Protocol Release 1 Public Draft**. It runs locally against nomue Records and
is not a server-side verification service.

## Reporting a vulnerability

Report suspected vulnerabilities privately through GitHub's private vulnerability
reporting form:

**https://github.com/licklider-ai/nomue-verifier/security/advisories/new**

Please do not open a public GitHub issue for security-sensitive findings. Do not
include credentials, private Records, unpublished data, or exploit details in a public
issue.

For non-security packaging defects (broken `verify` commands, unclear README
instructions), GitHub Issues are welcome as described in
[CONTRIBUTING.md](CONTRIBUTING.md).

## Scope

**In scope**

- The verifier CLI and reference implementation in this repository
- Schemas and registries shipped with this verifier package
- The synthetic example Records in `records/`
- Package behavior against the exact Release 1 support target recorded in
  `SOURCE-PIN.json`

**Out of scope**

- Protocol release-signing, KMS, or trust-root operations; those belong to the
  canonical [nomue Protocol](https://github.com/licklider-ai/nomue-protocol) project
- Production attestation, which Release 1 does not support
- Any nomue server or API; this verifier does not call one

After dependencies are installed, verification is designed to run locally and not to
dereference Record-supplied identifiers over the network.

## Supported versions

The published `main` branch is the supported verifier-package line. The package remains
experimental and currently retains version `0.2.1-rc.0`; this does not alter the
published status of nomue Protocol Release 1.
