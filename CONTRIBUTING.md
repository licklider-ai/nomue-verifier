# Contributing to nomue verifier

This repository contains the experimental verifier package aligned to the published
**nomue Protocol Release 1 Public Draft**. It is not the normative specification
repository; Protocol authority lives in
[licklider-ai/nomue-protocol](https://github.com/licklider-ai/nomue-protocol).

## What is not accepted

External **code** and **specification** contributions are **not currently accepted**
in this verifier repository. This keeps verifier-packaging changes separate from
Protocol authority and contribution terms.

Do not open pull requests that change verifier semantics, schemas, registries, or
Record fixtures unless you are an authorized steward performing a coordinated
Protocol/verifier update.

## What remains welcome

- **Issues** reporting verifier packaging defects, unclear instructions, broken
  commands, questions, or behavior that did not meet your expectations.
- **Feedback and critique** of scoped verification behavior and the documented
  guarantee boundary. If you are unsure whether an issue concerns packaging or the
  Protocol, start here and maintainers will route it.
- **Forks** for private experimentation, subject to the LICENSE.

Use the guided issue forms at:

https://github.com/licklider-ai/nomue-verifier/issues/new/choose

Before posting, remove private Records, unpublished data, credentials, access tokens,
and other sensitive information. A small synthetic reproduction is preferred when
possible. This experimental project provides support on a best-effort basis and does
not promise a response time.

## Feedback on the broader specification

Questions and critique about the nomue Protocol or nomue Record Specification belong
to the public Protocol project. You may nevertheless start with a verifier feedback
issue when the correct destination is unclear:

https://github.com/licklider-ai/nomue-protocol

Security issues in this verifier should be reported privately as described in
[SECURITY.md](SECURITY.md).

## No contributor agreement in this repository

This verifier repository does not operate a CLA, DCO, or separate patent agreement.
The Apache License 2.0 applies to distributed artifacts as stated in LICENSE.

## Scope boundary

This repository does not claim:

- patent freedom beyond the Apache-2.0 license grant on distributed code;
- that all implementations of the full nomue Protocol are patent-safe; or
- royalty-free implementation of the full nomue Protocol.

See [NON-CLAIMS.md](NON-CLAIMS.md) and [EXPERIMENTAL-NOTICE.md](EXPERIMENTAL-NOTICE.md).
