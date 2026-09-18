"""Pure transport/priority tests. These never stand in for cgroup enforcement."""
import hashlib
import json
from pathlib import Path
import types
import unittest
HERE = Path(__file__).resolve().parent
s = types.ModuleType('outer_supervisor')
s.__file__ = str(HERE / 'outer-supervisor.py')
exec(compile(Path(s.__file__).read_bytes(), s.__file__, 'exec'), s.__dict__)
NONCE = 'a' * 64

def envelope(payload, nonce=NONCE):
    text = json.dumps(payload, separators=(',', ':'))
    return json.dumps({'nonce': nonce, 'payload': text, 'sha256': hashlib.sha256(text.encode()).hexdigest()}).encode()

class Transport(unittest.TestCase):
    def test_identity_and_corruption(self):
        out = {'output': {'kind':'refusal', 'protocol':'unissued-holm-output/0.3.0-candidate.5'}}
        self.assertEqual(s.strict_transport(envelope(out), NONCE), out)
        for raw in [envelope(out, 'b'*64), b'{}', b'{', envelope({'output':{'kind':'report','protocol':'old'}}),
                    envelope({'output': out['output'], 'proposed_record_base64':'YQ=='}),
                    envelope({'output':out['output'], 'extra':True})]:
            with self.assertRaises((ValueError, TypeError)):
                s.strict_transport(raw, NONCE)
        raw=json.loads(envelope(out));raw['payload']+=' '
        with self.assertRaises(ValueError):s.strict_transport(json.dumps(raw).encode(),NONCE)

    def test_strict_eligibility(self):
        for raw in [b'{"a":1,"a":2}', b'{"a":1e999}', b'{"a":-0}',b'{"a":"\\ud800"}',
                    b'{"a":'+b'9'*400+b'}', b'{"a":-1e-999}', b'\xef\xbb\xbf{}']:
            with self.assertRaises((ValueError, UnicodeError)):s.strict_json(raw)

    def test_priority(self):
        for flags, expected in [({'memory_enforced':True,'deadline':True},'memory_enforced'),
                ({'cleanup_failed':True,'memory_enforced':True},'cleanup_failed'),
                ({'cancelled':True,'deadline':True},'cancelled'),
                ({'unsupported_host':True,'abnormal_exit':True},'unsupported_host'),
                ({'pids_enforced':True,'abnormal_exit':True},'pids_enforced')]:
            self.assertEqual(s.category(flags),expected)

    def test_counter_regression(self):
        self.assertEqual(s.delta({'max':0},{'max':1}),{'max':1})
        with self.assertRaises(ValueError):s.delta({'max':1},{'max':0})
        with self.assertRaises(ValueError):s.delta({'max':0},{})

    def test_runtime_source_hashes(self):
        pins=json.loads((HERE/'outer-runtime.json').read_text())
        for row in pins['runtime']:
            self.assertEqual(s.digest(s.ROOT/row['path']),row['sha256'],row['path'])

if __name__ == '__main__':unittest.main()
