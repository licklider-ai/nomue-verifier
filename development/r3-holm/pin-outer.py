"""Explicit development runtime inventory. Regenerate after source changes, never to bless drift silently."""
import hashlib
import json
from pathlib import Path
HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
FILES = [
    'package.json', 'package-lock.json',
    'reference/verifier/src/jcs.ts', 'reference/verifier/src/strict-json.ts',
]
FILES += ['development/r3-holm/' + p for p in [
    'stored-bytes.ts', 'dependencies.ts', 'd0-relations.ts', 'local-checks.ts',
    'output.ts', 'inner-call.ts', 'execution.ts', 'controlled-call.ts',
    'outer-entry.mjs', 'outer-supervisor.py', 'outer-probes.mjs', 'outer-run.mjs',
    'contracts/record.schema.json', 'contracts/expected.schema.json',
    'contracts/output.schema.json', 'contracts/reason-policy.json',
    'fixtures/record.schema.json', 'fixtures/expected.schema.json',
    'fixtures/declaration-shapes.json', 'fixtures/fixture-contracts.json',
    'numerics/candidate.py', 'numerics/worker.py', 'numerics/oracle.py',
    'numerics/PROVENANCE.json', 'numerics/INPUTS.json',
]]
rows = [{'path': p, 'sha256': hashlib.sha256((ROOT / p).read_bytes()).hexdigest()} for p in sorted(FILES)]
(HERE / 'outer-runtime.json').write_text(json.dumps({'status': 'unissued source inventory, not host qualification',
    'runtime': rows}, indent=2) + '\n')
