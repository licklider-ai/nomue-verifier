"""Regression for the retained-repair comparison, including self-consistent repinning."""
import copy
import json
import hashlib
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
import unittest
from replay_b2 import assert_repair_results

class RepairResults(unittest.TestCase):
    def setUp(self):
        self.expected = json.loads((Path(__file__).parent / 'b2-sources/repair-results.json').read_text())

    def test_only_environment_is_ignored(self):
        actual = copy.deepcopy(self.expected)
        actual['environment'] = {'python': 'different execution environment'}
        assert_repair_results(actual, self.expected)

    def test_changed_counts_results_and_shape_fail(self):
        mutations = []
        for group, key, value in [
            ('totals', 'checks', 13087),
            ('C1_predecessor_equivalence', 'divergences', 1),
            ('C2_order_equivalence', 'divergences', False),
            ('C4_maximal_family', 'repaired_refusals', 1),
        ]:
            altered = copy.deepcopy(self.expected)
            altered[group][key] = value
            mutations.append(altered)
        altered = copy.deepcopy(self.expected)
        altered['C3_derived_bound']['sizes']['1024']['observed_maximum'] += 1
        mutations.append(altered)
        altered = copy.deepcopy(self.expected); del altered['C5_adjusted_values_unchanged']
        mutations.append(altered)
        altered = copy.deepcopy(self.expected); altered['unexpected'] = {}
        mutations.append(altered)
        altered = copy.deepcopy(self.expected); del altered['environment']
        mutations.append(altered)
        for altered in mutations:
            with self.subTest(altered=altered), self.assertRaises(AssertionError):
                assert_repair_results(self.expected, altered)

    def test_replay_rejects_altered_expectation_even_after_repin(self):
        here = Path(__file__).parent
        with tempfile.TemporaryDirectory() as scratch:
            root = Path(scratch)
            pins = json.loads((here / 'B2-PROVENANCE.json').read_text())
            for row in pins['assets']:
                dest = root / row['file']; dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(here / row['file'], dest)
            shutil.copyfile(here / 'replay_b2.py', root / 'replay_b2.py')
            expected = root / 'b2-sources/repair-results.json'
            altered = json.loads(expected.read_text()); altered['totals']['checks'] -= 1
            expected.write_text(json.dumps(altered))
            for row in pins['assets']:
                if row['file'] == 'b2-sources/repair-results.json':
                    row['sha256'] = hashlib.sha256(expected.read_bytes()).hexdigest()
            (root / 'B2-PROVENANCE.json').write_text(json.dumps(pins))
            result = subprocess.run([sys.executable, '-I', '-B', str(root / 'replay_b2.py')],
                                    capture_output=True, timeout=120)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn(b'repair results differ from retained expectation', result.stderr)

if __name__ == '__main__':
    unittest.main()
