# Release 1 Verifier Rebuild Procedure

This repository distributes the verifier as a source package. There is no hidden
compile product: the public `nomue` binary launches the packaged TypeScript source
through the pinned runtime dependency set. Rebuildability therefore means reconstructing
the exact runnable package surface from an exact source commit and lockfile, then
confirming its tests and package manifest independently.

## Release 1 independence boundary

The steps below are designed for gate **R1-09**, but running them in Licklider's normal
project CI is **not an independent rebuild**. R1-09 requires an operator/environment
independent of the ordinary release implementation path. The operator should receive
only:

- the frozen verifier source commit or source archive;
- the expected Protocol candidate commit C;
- these instructions;
- the public Release 1 gate requirement.

The operator should preserve all logs, including failures. They should not receive a
prebuilt `node_modules/` tree or an unpublished package tarball from the release team.

## Preconditions

- Node.js 20 or later; record the exact version used.
- npm available from that Node installation; record the exact version.
- Git, when rebuilding from a Git checkout.
- Network access is permitted **only to obtain the locked npm dependencies** during
  `npm ci`. Verification itself does not require a nomue service or network call.

Before final Release 1 rebuild evidence is accepted, `SOURCE-PIN.json` must point to
candidate content commit C and `final_candidate_pin_pending` must be false.

## Procedure

1. Obtain and check out the exact frozen verifier commit supplied for Release 1.
2. Confirm a clean tree:

```bash
git status --porcelain
```

It must print nothing.

3. Install exactly the dependency graph in `package-lock.json`:

```bash
npm ci
```

Do not run `npm install` to resolve a newer dependency graph.

4. Run the verifier's repository tests:

```bash
npm test
```

5. Generate rebuild evidence from the clean checkout:

```bash
npm run rebuild:evidence -- rebuild-evidence
```

This command fails if the package name/version in `package-lock.json` does not match
`package.json` or if the working tree is dirty. It writes:

- `rebuild-evidence/environment.json` — source commit/tree, Protocol source pin,
  Node/npm/OS/architecture, and SHA-256 pins for package metadata;
- `rebuild-evidence/dependency-provenance.json` — every lockfile package entry,
  resolved source/integrity metadata where available, license metadata, and the
  lockfile SHA-256;
- `rebuild-evidence/package-manifest.json` — the exact file list and sizes reported by
  `npm pack --dry-run --json` for the rebuilt package.

6. Inspect the package surface:

```bash
npm pack --dry-run --json
```

The package must contain only the explicit runtime/public surface allowed by
`package.json` plus npm's mandatory package metadata (for example `package.json`,
README, and license files). Test fixtures, CI configuration, old August presentation
code, and unrelated repository files are not part of the runtime package.

7. Exercise the public CLI from the rebuilt checkout:

```bash
npm exec -- nomue verify records/valid.json --format json
npm exec -- nomue verify records/invalid-result-mismatch.json --format json
```

For final candidate evidence, the operator may instead be given the exact candidate
canonical case Record or another rights-cleared 0.2.1 Record. The important property
is that the rebuilt public CLI dispatches the exact pinned 0.2.1 bundle and preserves
the documented machine-readable output/exit-code contract.

## Evidence to return for R1-09 review

Return, without editing after the run:

- operator identity/affiliation and statement of independence;
- the exact verifier source commit/archive identity;
- the exact Protocol candidate commit C from `SOURCE-PIN.json`;
- shell/terminal log for `npm ci`, `npm test`, `npm run rebuild:evidence`, and the
  public CLI exercise;
- the complete `rebuild-evidence/` directory;
- any failure, warning, manual intervention, mirror/proxy, or environmental deviation
  observed during the rebuild.

A successful project-owned CI run is useful regression evidence but must not be
relabeled as this independent rebuild.
