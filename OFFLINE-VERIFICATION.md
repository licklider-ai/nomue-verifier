# Release 1 External Offline Verification Procedure

This procedure is intended to produce the **external clean-environment** evidence
required by nomue Protocol gate R1-04 after Release 1 candidate content commit C is
frozen and the public verifier is re-pinned to C.

Running the same commands in Licklider-controlled CI is useful regression evidence,
but it is **not** the external-operator evidence required by R1-04.

## Independence requirements

The final operator should not be a person who authored the candidate verifier or the
Release 1 gate evidence. Record the operator's name/organization and the basis for
treating the run as external to the release implementation path.

The operator receives only:

- the exact public verifier source commit/archive selected for Release 1;
- these instructions;
- a rights-cleared 0.2.1 Record to verify;
- the expected Protocol candidate commit C for comparison with `SOURCE-PIN.json`.

Do not give the operator a prebuilt `node_modules/` tree or a prebuilt container image
from the release team.

## 1. Record the clean host environment

From a fresh working directory, record at minimum:

```bash
git rev-parse HEAD
git status --porcelain
docker version
uname -a
```

`git status --porcelain` must be empty. Also copy `SOURCE-PIN.json` into the returned
evidence. For final Release 1 evidence it must identify candidate C and must not say
that a final candidate pin is still pending.

## 2. Build the verifier image

Dependency acquisition is allowed during image construction. The offline claim begins
only at the container execution boundary.

```bash
docker build --no-cache -f offline/Dockerfile -t nomue-verifier-r1-offline .
```

Record the resulting image metadata:

```bash
mkdir -p evidence
docker image inspect nomue-verifier-r1-offline > evidence/docker-image-inspect.json
```

## 3. Create an isolated container

Create a container with Docker network mode `none`. The output directory is the only
writable host mount; the container root filesystem is read-only and `/tmp` is an
ephemeral tmpfs.

```bash
CID=$(docker create \
  --network none \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  --mount type=bind,src="$PWD/evidence",dst=/evidence \
  nomue-verifier-r1-offline \
  sh -lc '
    set -eu
    node offline/network-probe.mjs > /evidence/network-probe.json
    node bin/nomue.cjs verify records/valid.json --format json > /evidence/verification-valid.json
    printf "%s\n" "$?" > /evidence/valid-exit-code.txt
    set +e
    node bin/nomue.cjs verify records/invalid-result-mismatch.json --format json > /evidence/verification-mismatch.json
    mismatch_exit=$?
    set -e
    printf "%s\n" "$mismatch_exit" > /evidence/mismatch-exit-code.txt
    node --version > /evidence/node-version.txt
    npm --version > /evidence/npm-version.txt
  ')
```

Start it and preserve the console output/exit status:

```bash
docker start -a "$CID" 2>&1 | tee evidence/container-console.log
```

## 4. Capture network-isolation evidence

Before removing the container, capture Docker's configuration plus the passive
interface inventory produced inside the container:

```bash
docker inspect "$CID" > evidence/container-inspect.json
docker inspect --format '{{.HostConfig.NetworkMode}}' "$CID" > evidence/network-mode.txt
cat evidence/network-mode.txt
cat evidence/network-probe.json
```

Expected evidence:

- `network-mode.txt` is exactly `none`;
- `network-probe.json.non_loopback_interfaces` is empty;
- `network-probe.json.isolation_observed` is `true`.

The network argument is based on both Docker's configured network mode and the
container's passive interface inventory. The probe does not attempt to contact any
external address.

## 5. Confirm verifier behavior

Expected scoped outcomes for the bundled 0.2.1 hero Records:

- `valid-exit-code.txt` = `0`;
- `mismatch-exit-code.txt` = `2`;
- both verifier outputs are machine-readable JSON;
- the valid output identifies exact bundle
  `urn:nomue:bundle:itgc-guarantee:0.2.1-draft.1`;
- the mismatch output includes `NRS-DECLARED-RESULT-MISMATCH`;
- scientific validity remains `not_asserted`.

For final R1-04 evidence, additionally run the exact rights-cleared candidate Record
specified by the gate-review packet and preserve its JSON output and exit code. Do not
substitute a different Record after seeing the result.

## 6. Return the evidence without editing it

Return:

- operator identity/organization and independence statement;
- exact verifier source commit/archive identity;
- `SOURCE-PIN.json` showing Protocol candidate C;
- host environment log;
- Docker image inspection;
- container inspection;
- `network-mode.txt` and `network-probe.json`;
- verifier JSON output(s) and exit-code files;
- container console log;
- any failure, warning, proxy/mirror, manual intervention, or deviation observed.

After evidence capture:

```bash
docker rm "$CID"
```

Do not clean up failures before preserving them. A failed external run remains Release
1 evidence and is reviewed rather than silently replaced.
