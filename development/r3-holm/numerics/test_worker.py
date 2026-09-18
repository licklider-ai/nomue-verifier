"""Fixed-source worker regression against the retained independent closed-testing oracle."""
import hashlib
import types
import json
from pathlib import Path
import random
import struct
import subprocess
import sys
import unittest

HERE = Path(__file__).resolve().parent
sys.dont_write_bytecode = True
oracle = types.ModuleType('closed_oracle')
exec(compile((HERE / 'oracle.py').read_bytes(), str(HERE / 'oracle.py'), 'exec'), oracle.__dict__)


class WorkerEvidence(unittest.TestCase):
    def test_sources(self):
        for row in json.loads((HERE / 'PROVENANCE.json').read_text())['assets']:
            self.assertEqual(hashlib.sha256((HERE / row['file']).read_bytes()).hexdigest(), row['sha256'])

    def test_closed_testing(self):
        rng = random.Random(20260918)
        cases = [[0.0]*3, [1.0]*3, [0.0, 0.5, 1.0], [2**-1074]*3,
                 [0.25 + 2**-54]*3, [0.25 + 3*2**-54]*3]
        for n in (3, 6):
            cases.extend([[rng.randrange(257)/256 for _ in range(n)] for _ in range(40)])
        for index, values in enumerate(cases):
            with self.subTest(index=index):
                raw = [struct.pack('>d', x) for x in values]
                expected = oracle.closed_testing(raw)
                carrier = {'family': 'fixed', 'revision': 'independent', 'members': [
                    {'hypothesis': 'h'+str(i), 'origin': 'supplied', 'p': p.hex()} for i,p in enumerate(raw)]}
                child = subprocess.run([sys.executable, '-I', str(HERE/'worker.py')],
                    input=json.dumps(carrier).encode(), stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE, timeout=5, check=True)
                self.assertEqual(child.stderr, b'')
                reply = json.loads(child.stdout)
                self.assertEqual(set(reply), {'adjusted_hex', 'display_hex'})
                self.assertEqual(reply['adjusted_hex'], [format(int(q*(1<<1074)), 'x') for q in expected])
                self.assertEqual(reply['display_hex'], [oracle.display(q).hex() for q in expected])
        print(json.dumps({'independent_worker_vectors': len(cases), 'python': sys.version.split()[0]}))


if __name__ == '__main__':
    unittest.main()
