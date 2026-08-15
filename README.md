# nomue August Experimental Category Demo

Local, offline **experimental** verification of synthetic nomue Records. Checks
**scoped** properties only: Record integrity (content digest), Welch result
recomputation from recorded data under the included verification contract, and
agreement between declared and recomputed quantities. **Not Release 1.**
**Not a stable protocol release.**

**PASS** means the included scoped verification checks passed — not that
scientific validity passed. The CLI prints `scientific_validity: not_asserted`
for that boundary.

## Quick start

```bash
npm install
npm exec nomue verify records/valid.json
npm exec nomue verify records/invalid-result-mismatch.json
```

The invalid example is internally intact (digest matches content), but a
**declared result does not match** the value recomputed from the recorded
evidence under the included verification contract.

## What this is

- An experimental category demonstration: scoped verification vs overall
  "verified" claims
- A minimal reference verifier for synthetic Records
- No network, API key, or nomue server required

## What this is not

- Proof that science is correct or scientifically valid
- A production-ready or stable nomue protocol release
- Patent-free or royalty-free implementation of the full nomue protocol

See [NON-CLAIMS.md](NON-CLAIMS.md) and [EXPERIMENTAL-NOTICE.md](EXPERIMENTAL-NOTICE.md).

## Contributing

External code and specification contributions are not currently accepted.
See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Apache License 2.0. See [LICENSE](LICENSE). No trademark rights are granted
beyond those provided by Apache License 2.0.
