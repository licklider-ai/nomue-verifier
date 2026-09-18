"""Author replay of preserved independent B-2 checks on the wired successor.

Original review scripts/results remain byte-identical. All script outputs are
written only in a temporary reconstruction; this runner prints new evidence.
C10's empirical runtime-sort search is superseded by the derived merge bound.
"""
import ast
from functools import lru_cache
import hashlib
import importlib.util
import itertools
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

HERE = Path(__file__).resolve().parent
sys.dont_write_bytecode = True


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@lru_cache(None)
def tree_bound(n):
    # Independently express the bottom-up tree as the largest full left subtree
    # and its residual right subtree, rather than repeating the implementation loop.
    if n <= 1:
        return 0
    left = 1 << ((n - 1).bit_length() - 1)
    return tree_bound(left) + tree_bound(n - left) + n - 1


def main():
    pins = json.loads((HERE / 'B2-PROVENANCE.json').read_text())
    for row in pins['assets']:
        assert hashlib.sha256((HERE / row['file']).read_bytes()).hexdigest() == row['sha256'], row['file']
    new = load('wired_candidate', HERE / 'candidate.py')
    old_source = (HERE / 'b2-sources/predecessor.py').read_text()
    new_source = (HERE / 'candidate.py').read_text()
    def functions(text):
        return {node.name: ast.dump(node, include_attributes=False)
                for node in ast.parse(text).body if isinstance(node, ast.FunctionDef)}
    old_functions, new_functions = functions(old_source), functions(new_source)
    unchanged = ['require', 'decode', 'project', 'transform', 'identical', 'evidence_view', 'check_evidence']
    for name in unchanged:
        assert old_functions[name] == new_functions[name], name
    # The transform source, not just its AST, is preserved.
    def transform_text(text):
        node = next(n for n in ast.parse(text).body if isinstance(n, ast.FunctionDef) and n.name == 'transform')
        return ast.get_source_segment(text, node)
    assert transform_text(old_source) == transform_text(new_source)
    for n in range(1, 1025):
        assert new.comparison_bound(n) == tree_bound(n) <= 9217
    assert new.comparison_bound(120) == 713 and new.comparison_bound(1024) == 9217
    exhaustive = 0
    for n in range(1, 9):
        for keys in itertools.permutations(range(n)):
            order, count = new.ordered(range(n), lambda i: keys[i])
            assert [keys[i] for i in order] == list(range(n))
            assert count <= tree_bound(n)
            exhaustive += 1

    with tempfile.TemporaryDirectory(prefix='holm-b2-replay-') as temporary:
        root = Path(temporary)
        preparation = root / 'governance/drafts/release-3-preparation'
        predecessor = preparation / 'holm-experiment-20260911'
        repair = preparation / 'holm-b2-repair-20260918'
        review = root / 'review-inputs/r3-holm-b2-numerical-review-20260918'
        for directory in [predecessor, repair, review]:
            directory.mkdir(parents=True)
        shutil.copyfile(HERE / 'b2-sources/predecessor.py', predecessor / 'candidate.py')
        shutil.copyfile(HERE / 'candidate.py', repair / 'candidate.py')
        shutil.copyfile(HERE / 'b2-sources/test_repair.py', repair / 'test_repair.py')
        p = subprocess.run([sys.executable, '-I', '-B', str(repair / 'test_repair.py')],
                           capture_output=True, timeout=120, check=True)
        repair_results = json.loads(p.stdout)
        assert p.stderr == b''
        # Now apply the original independent oracle functions to the wired module,
        # not to the historical candidate. Do not run main or overwrite its receipt.
        shutil.copyfile(HERE / 'candidate.py', predecessor / 'candidate.py')
        shutil.copyfile(HERE / 'b2-sources/independent_checks.py', review / 'independent_checks.py')
        independent = load('preserved_b2_review', review / 'independent_checks.py')
        assert Path(independent.candidate.__file__) == predecessor / 'candidate.py'
        assert hashlib.sha256(Path(independent.candidate.__file__).read_bytes()).hexdigest() == hashlib.sha256((HERE / 'candidate.py').read_bytes()).hexdigest()
        independent.c1_c2_c3()
        independent.c4_c5()
        independent.c6_c7_c8_c9()
        expected = json.loads((HERE / 'b2-sources/RESULTS.json').read_text())
        for name, value in independent.RESULTS.items():
            assert value == expected[name], (name, value, expected[name])
        assert len(independent.RESULTS) == 9
    result = {
        'status': 'author replay on successor, not a new independent review or whole-call acceptance',
        'python': sys.version.split()[0],
        'candidate_sha256': hashlib.sha256((HERE / 'candidate.py').read_bytes()).hexdigest(),
        'unchanged_functions_ast': unchanged,
        'transform_source_unchanged': True,
        'derived_bound_sizes_checked': 1024,
        'maximum_comparison_bound': 9217,
        'bound_at_120': 713,
        'exhaustive_small_permutations': exhaustive,
        'independent_C1_C9': independent.RESULTS,
        'preserved_repair_checks': repair_results,
        'not_run': ['C10 historical runtime-sort search, replaced by derived bound',
                    'Independent review of successor wiring', 'Full-call host lifecycle in this Python runner'],
    }
    print(json.dumps(result, indent=2, sort_keys=True))


if __name__ == '__main__':
    main()
