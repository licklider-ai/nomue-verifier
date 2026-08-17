# nomue August Experimental Category Demo

A Record can be intact and still disagree with its own recorded evidence. This demo separates those questions: it checks Record integrity, then independently recomputes a narrow supported statistical result under an explicit verification contract.

Issuer-independent **experimental** verification of synthetic nomue Records. Checks
**scoped** properties only: Record integrity (content digest), Welch result
recomputation from recorded data under the included verification contract, and
agreement between declared and recomputed quantities. **Not Release 1.**
**Not a stable protocol release.**

**PASS** means the included scoped verification checks passed — not that
scientific validity passed. The CLI prints `scientific_validity: not_asserted`
for that boundary.

## Try the mismatch

Two synthetic Records ship in `records/`. Run both to see the difference.

```bash
npm install
npm exec nomue verify records/valid.json
npm exec nomue verify records/invalid-result-mismatch.json
```

Output excerpt (`records/valid.json`, exit code 0):

```text
PASS

verification completed
scientific_validity: not_asserted
...
```

Output excerpt (`records/invalid-result-mismatch.json`, exit code 2):

```text
FAIL

NRS-DECLARED-RESULT-MISMATCH
One or more declared result quantities differ from the recomputed values beyond the tolerance policy of the applicable check version.
scientific_validity: not_asserted
...
```

The invalid example is internally intact — its content digest matches the
recorded payload — but a **declared result quantity does not match** the value
recomputed from the recorded observations under the included verification
contract. The CLI reports the mismatch reason code; it does not print the
individual declared or recomputed values. A failing outcome here is not a claim
that the underlying science is wrong.

Verification runs locally after `npm install`. It does not call a nomue server
or API.

## Quick start

```bash
git clone https://github.com/licklider-ai/nomue-verifier.git
cd nomue-verifier
npm install
npm exec nomue verify records/valid.json
npm exec nomue verify records/invalid-result-mismatch.json
```

## What this verifies

- Record integrity: content digest recomputed from the payload
- Welch two-sample t-test result recomputation from recorded observations
- Agreement between declared and recomputed quantities under the included
  verification contract

## What this does not verify

- Scientific correctness, validity, or truth
- That exported figures, manuscripts, or downstream artifacts remain bound to
  the Record

**PASS** means scoped checks passed — not that scientific validity passed.
See [NON-CLAIMS.md](NON-CLAIMS.md) and [EXPERIMENTAL-NOTICE.md](EXPERIMENTAL-NOTICE.md).

## What this is

- An experimental category demonstration: scoped verification vs overall
  "verified" claims
- A minimal reference verifier for synthetic Records
- Verification does not depend on a nomue server or API key; after dependencies
  are installed, it can run without a network connection

## What this is not

- Proof that science is correct or scientifically valid
- A production-ready or stable nomue protocol release
- Patent-free or royalty-free implementation of the full nomue protocol

## Contributing

External code and specification contributions are not currently accepted.
See [CONTRIBUTING.md](CONTRIBUTING.md).

Contact: [https://licklider.ai](https://licklider.ai)

## Security

Report security issues in this demo privately via [https://licklider.ai](https://licklider.ai).
See [SECURITY.md](SECURITY.md).

## License

Apache License 2.0. See [LICENSE](LICENSE). No trademark rights are granted
beyond those provided by Apache License 2.0.
