# nomue verifier — Release 1 candidate package

Issuer-independent local verification of scoped nomue Record properties.

## Status

This repository is being aligned to the planned **nomue Protocol Release 1** support
target:

```text
urn:nomue:bundle:itgc-guarantee:0.2.1-draft.1
```

Package version: **`0.2.1-rc.0`**.

This is still **pre-release**. The Protocol has not yet published Release 1 and the
final Release 1 candidate content commit has not yet been pinned. `SOURCE-PIN.json`
therefore records a pre-candidate Protocol alignment commit and explicitly requires a
final re-pin to candidate C before Release 1 publication. Do not treat this package
version as evidence that the Protocol itself has been publicly released.

Release 1 is intentionally narrow: independent two-group continuous outcomes under
the registered ITGC Profile, with the two-sided Welch two-sample t procedure and the
exact 0.2.1 numerical check versions. Production attestation is not supported by this
bundle.

## Quick start

```bash
git clone https://github.com/licklider-ai/nomue-verifier.git
cd nomue-verifier
npm install

npm exec -- nomue verify records/valid.json --format json
npm exec -- nomue verify records/invalid-result-mismatch.json --format json
```

The first example is the Protocol's `A2-1-V-001` 0.2.1 conformance fixture and exits
`0`. The second is the Protocol's `A2-1-P-001` declared-result mismatch fixture and
exits `2`.

Machine-readable verifier output is JSON on stdout. With `--format json` or
`--format json-compact`, no human summary is written to stderr. The public `nomue`
command invokes the same reference CLI implementation carried by the Protocol-derived
verifier code; the old August PASS/FAIL presentation wrapper is no longer the package
entry point.

## CLI

```text
nomue verify <record.json> [--format json|json-compact|human]
nomue canonicalize <record.json>
nomue digest <record.json>
```

`verify` uses the Protocol exit-code contract:

| Code | Meaning |
| --- | --- |
| `0` | A report exists and every applicable scoped check outcome is `pass`. |
| `2` | A report contains a failed scoped check, or a parse/canonicalization refusal occurred. |
| `3` | Routing failure or unsupported bundle; no verification report exists. |
| `4` | Resource-limit safe refusal. |
| `5` | Internal/usage/IO failure before verification could complete. |

Scripts that need the exact outcome must parse the JSON object, not infer an overall
scientific verdict from the exit code.

## What Release 1 verification covers

For the exact 0.2.1 bundle, the verifier can check the registered scopes for:

- Record structural/semantic conformance;
- Record content-digest integrity;
- declared ITGC Profile admissibility;
- Welch numerical computability;
- Welch result recomputation and comparison under the registered 0.2.1 tolerance
  policy, including the unstandardized arithmetic mean difference, standard error,
  two-sided 95% Welch-Satterthwaite confidence interval, test statistic, degrees of
  freedom, and p-value.

Verification runs locally after dependencies are installed. The verifier does not call
a nomue server, fetch Record-supplied URIs, load remote schemas, or execute
Record-supplied code.

## What it does not establish

A clean verification report does **not** establish:

- scientific truth or scientific validity;
- that input data or researcher declarations are truthful;
- causal validity;
- publication acceptance;
- correctness of methods outside the registered Release 1 bundle;
- production attestation or a `nomue-attested` claim;
- that figures, legends, Methods, Results, or Claims remain bound to this Record.

The machine-readable report carries these non-asserted boundaries explicitly. There
is no single overall `VERIFIED` result.

See [NON-CLAIMS.md](NON-CLAIMS.md) for the package boundary.

## Exact version dispatch

The verifier dispatches only on an exact registered `interpretation_bundle_id`. There
is no default bundle and no inference from version proximity. The planned Release 1
target is the exact `0.2.1-draft.1` bundle above; the older 0.1 and 0.2.0 bundles are
historical/development surfaces, not aliases for Release 1.

## Source provenance

`SOURCE-PIN.json` identifies the Protocol source commit used for this package state.
The current pin is a **pre-candidate alignment pin**. Before Release 1 publication it
must be replaced by the frozen candidate content commit C and the package must be
revalidated against that exact candidate.

`EXTRACTION-MANIFEST.json` records the earlier August-demo extraction boundary and is
retained as historical packaging evidence; it is not the final Release 1 candidate
identity.

## Contributing

External code and specification contributions are not currently accepted through this
repository. Protocol contribution rules are governed separately by the Protocol
project.

## Security

Report security issues using the private contact path described in [SECURITY.md](SECURITY.md).

## License

Apache License 2.0. See [LICENSE](LICENSE). No trademark rights are granted beyond
those provided by the license.
