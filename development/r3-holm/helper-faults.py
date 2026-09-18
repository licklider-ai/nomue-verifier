"""Trusted faults in disposable, explicitly repinned source copies only.

No injection API, environment switch or alternate entry is added to the verifier.
Host mode calls normal controlledCall; inner mode does not claim host evidence.
"""
import argparse
import base64
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
SOURCE = 'development/r3-holm/stored-bytes.ts'
MANIFEST = 'development/r3-holm/outer-runtime.json'
FAULTS = {
    'baseline': [],
    'canonicalizer-throws': [('canonical = Buffer.from(jcsCanonicalize(value));',
                             'throw new Error("injected canonicalizer failure");')],
    'projection-throws': [('const ws = (n: number)',
                          'throw new Error("injected projection failure");\n  const ws = (n: number)')],
    'digest-throws': [('createHash("sha256")',
                      '(() => { throw new Error("injected digest failure"); })()')],
    'projection-disagreement': [('return Buffer.concat([bytes.subarray(0, from), bytes.subarray(to)]);',
                                 'return Buffer.from("{}");')],
    'reserialized-reference-control': [('return Buffer.concat([bytes.subarray(0, from), bytes.subarray(to)]);',
        'return Buffer.from(jcsCanonicalize(parseStrictJson(Buffer.concat([bytes.subarray(0, from), bytes.subarray(to)]).toString("utf8"))));')],
}
FAULTS['guard-disabled-control'] = FAULTS['projection-disagreement'] + [
    ('if (canonicalStorage && !projected.equals(canonicalProjection))', 'if (false)')]


def sha(data):
    return hashlib.sha256(data).hexdigest()


def run(command, root):
    p = subprocess.run(command, cwd=root, capture_output=True, timeout=50)
    if p.returncode:
        raise RuntimeError(f'exit {p.returncode}: {p.stderr.decode(errors="replace")[:2000]}')
    return p.stdout


def refusal(result, kind):
    assert set(result) == {'output'}, result
    output = result['output']
    assert output['kind'] == 'refusal' and output['refusal_kind'] == kind, output
    assert not any(k in output for k in ['conformance', 'verification', 'record_reference']), output


def prepare(destination, mode, repin, retained):
    for name in ['development', 'reference']:
        shutil.copytree(ROOT / name, destination / name, ignore=shutil.ignore_patterns('__pycache__'))
    for name in ['package.json', 'package-lock.json']:
        shutil.copy2(ROOT / name, destination / name)
    (destination / 'node_modules').symlink_to(ROOT / 'node_modules', target_is_directory=True)
    before = (ROOT / SOURCE).read_bytes()
    text = before.decode()
    for old, new in FAULTS[mode]:
        assert text.count(old) == 1, (mode, 'nonunique mutation anchor')
        text = text.replace(old, new)
    after = text.encode()
    (destination / SOURCE).write_bytes(after)
    original_inventory = (ROOT / MANIFEST).read_bytes()
    inventory = json.loads(original_inventory)
    changed = []
    for row in inventory['runtime']:
        observed = sha((destination / row['path']).read_bytes())
        if observed != row['sha256']:
            assert row['path'] == SOURCE, row['path']
            changed.append(row['path'])
            if repin:
                row['sha256'] = observed
    assert changed == ([] if mode == 'baseline' else [SOURCE])
    if repin and changed:
        (destination / MANIFEST).write_text(json.dumps(inventory, indent=2) + '\n')
    retained.mkdir(parents=True)
    (retained / 'stored-bytes.ts').write_bytes(after)
    (retained / 'outer-runtime.json').write_bytes((destination / MANIFEST).read_bytes())
    data = {'mode': mode, 'source_sha256_before': sha(before), 'source_sha256_after': sha(after),
            'inventory_sha256_before': sha(original_inventory),
            'inventory_sha256_after': sha((destination / MANIFEST).read_bytes()),
            'explicit_test_repin': bool(repin and changed), 'changed_runtime_files': changed,
            'replacements': FAULTS[mode]}
    (retained / 'MUTATION.json').write_text(json.dumps(data, indent=2) + '\n')
    return data


def exercise(delegation, artifact, node, python):
    artifact = artifact.resolve()
    artifact.mkdir(parents=True, exist_ok=True)
    inputs = artifact / 'inputs'
    run([node, '--import', 'tsx', str(HERE / 'outer-cases.ts'), str(inputs)], ROOT)
    # Keep only the three source fixtures used by these cases; never archive a loop.
    names = ['R3D-01', 'R3D-07', 'ORACLE-whitespace']
    cases = {c['id']: c for c in json.loads((inputs / 'cases.json').read_text()) if c['id'] in names}
    assert set(cases) == set(names)
    keep = {Path(c[k]).name for c in cases.values() for k in ['record', 'expected'] if c[k]}
    for p in inputs.iterdir():
        if p.name not in keep:
            if p.is_dir() and not p.is_symlink(): shutil.rmtree(p)
            else: p.unlink()
    (inputs / 'cases.json').write_text(json.dumps(list(cases.values()), indent=2) + '\n')
    rows = []
    before_source, before_inventory = (ROOT / SOURCE).read_bytes(), (ROOT / MANIFEST).read_bytes()
    plans = [(m, n, True) for m in ['baseline', 'canonicalizer-throws', 'projection-throws', 'digest-throws'] for n in names]
    plans += [('projection-disagreement', 'R3D-01', True), ('guard-disabled-control', 'R3D-01', True)]
    plans += [('reserialized-reference-control', 'ORACLE-whitespace', True)]
    if delegation is not None:
        plans += [('projection-disagreement', 'R3D-01', False)]
    (artifact / 'PLAN.json').write_text(json.dumps(plans, indent=2) + '\n')
    with tempfile.TemporaryDirectory(prefix='r3-helper-faults-') as scratch:
        for index, (mode, name, repin) in enumerate(plans):
            label = f'{index:02}-{mode}-{name}' + ('' if repin else '-unpinned')
            retained = artifact / label
            destination = Path(scratch) / label
            data = prepare(destination, mode, repin, retained)
            entry = destination / 'development/r3-holm'
            case = cases[name]
            command = [node, str(entry / 'helper-inner-run.mjs'), python, case['record'], case['expected']]
            if delegation is not None:
                command = [node, str(entry / 'outer-run.mjs'), str(delegation), python,
                           case['record'], case['expected'], str(retained / 'receipt.json')]
            try:
                raw = run(command, destination)
                (retained / 'result.json').write_bytes(raw)
                result = json.loads(raw)
                if delegation is not None:
                    receipt = json.loads((retained / 'receipt.json').read_text())
                    e = receipt['evidence']
                    assert e['runtime_manifest_sha256'] == data['inventory_sha256_after']
                    assert e['probe'] is None
                    if not repin:
                        assert receipt['category'] == 'unsupported_host'
                        assert 'runtime source drift' in e.get('preflight_error', ''), e
                        refusal(result, 'unsupported_execution')
                    else:
                        assert receipt['category'] == 'completed_valid', receipt
                        assert all(e['cleanup'].values())
                        assert not Path(e['leaf']).exists() and not Path(e['temporary']).exists()
                if not repin:
                    pass  # Source drift is rejected before the helper can run.
                elif mode == 'baseline':
                    assert result['output']['kind'] == 'report', result
                    stages = {r['stage']: r for r in result['output']['conformance'] + result['output']['verification']}
                    forward_key = 'verified_record_base64' if delegation is not None else 'proposed_record_base64'
                    assert (forward_key in result) == (name == 'R3D-01')
                    if name == 'R3D-01':
                        assert all(r.get('outcome') == 'pass' for r in stages.values())
                        assert base64.b64decode(result[forward_key], validate=True) == Path(case['record']).read_bytes()
                    else:
                        assert stages['S' if name == 'R3D-07' else 'K']['outcome'] == 'fail'
                    if 'reference_digest' in case:
                        assert result['output']['record_reference']['stored_projection_digest'] == case['reference_digest']
                elif mode == 'guard-disabled-control':
                    # A deliberately broken guard must be detected by the same assertion.
                    assert result['output']['kind'] == 'report', result
                    assert result['output']['verification'][0]['outcome'] == 'fail', result
                    try: refusal(result, 'canonicalization_failure')
                    except AssertionError: pass
                    else: raise AssertionError('guard removal went undetected')
                    assert set(result) == {'output'}
                elif mode == 'reserialized-reference-control':
                    assert set(result) == {'output'} and result['output']['kind'] == 'report', result
                    assert result['output']['conformance'][1]['outcome'] == 'fail'
                    assert result['output']['verification'][0]['execution'] == 'not_run'
                    # The fixed Python byte oracle catches a wrong failure-reference
                    # even though K prevents I pass and forwarding in this mutant.
                    observed = result['output']['record_reference']['stored_projection_digest']
                    assert observed != case['reference_digest'], 'reserialization mutation ineffective'
                    try: assert observed == case['reference_digest']
                    except AssertionError: pass
                    else: raise AssertionError('wrong failure reference went undetected')
                else:
                    refusal(result, 'canonicalization_failure')
                rows.append({'name': label, 'pass': True, 'mode': mode, 'repin': repin})
            except Exception as error:
                rows.append({'name': label, 'pass': False, 'error': repr(error)})
    assert (ROOT / SOURCE).read_bytes() == before_source and (ROOT / MANIFEST).read_bytes() == before_inventory
    assert len(rows) == (16 if delegation is not None else 15)
    summary = {'status': 'author disposable-source fault evidence, not candidate or host qualification',
               'lane': 'controlled-host' if delegation is not None else 'inner-only',
               'node': run([node, '--version'], ROOT).decode().strip(), 'python': sys.version,
               'source_sha256': sha(before_source), 'inventory_sha256': sha(before_inventory),
               'passed': sum(r['pass'] for r in rows), 'total': len(rows), 'rows': rows}
    (artifact / 'RESULTS.json').write_text(json.dumps(summary, indent=2) + '\n')
    return summary


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    result = exercise(None, Path(args.output), shutil.which('node'), sys.executable)
    print(json.dumps(result, indent=2))
    if result['passed'] != result['total']: raise SystemExit(1)
