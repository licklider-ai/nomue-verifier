"""Private coordinator channel; never an external Record/JSON ingress."""
import hashlib
import json
import os
from pathlib import Path
import resource
import sys
import types

HERE = Path(__file__).resolve().parent
LIMIT = 256*1024
resource.setrlimit(resource.RLIMIT_AS, (256*1024*1024,256*1024*1024))


def require(ok, reason):
    if not ok: raise ValueError(reason)


def fields(value, keys):
    require(type(value) is dict and set(value) == set(keys), 'private worker shape')


def main():
    pins = json.loads((HERE/'INPUTS.json').read_text())
    raw = (HERE/'candidate.py').read_bytes()
    require(hashlib.sha256(raw).hexdigest() == pins['runtime']['candidate.py'], 'dependency hash: candidate.py')
    # Execute the very bytes just checked, with no same-name import resolution.
    module = types.ModuleType('pinned_holm'); module.__file__ = str(HERE/'candidate.py')
    exec(compile(raw, module.__file__, 'exec'), module.__dict__)
    message = sys.stdin.buffer.read(LIMIT+1)
    require(len(message) <= LIMIT, 'private request size')
    # The coordinator generated this fresh closed message after strict ingress.
    carrier = json.loads(message)
    fields(carrier, ('family','revision','members'))
    require(type(carrier['members']) is list and 3 <= len(carrier['members']) <= 120, 'private family count')
    for member in carrier['members']:
        fields(member, ('hypothesis','origin','p'))
        h = member['p']
        require(type(h) is str and len(h)==16 and all(x in '0123456789abcdef' for x in h), 'private p encoding')
        member['p'] = bytes.fromhex(h)
    result = module.transform(carrier)
    reply = {'adjusted_hex':[format(x,'x') for x in result['adjusted_lattice']],
             'display_hex':[x.hex() for x in result['display']]}
    output = json.dumps(reply,separators=(',',':')).encode()
    require(len(output)<=LIMIT, 'private response size')
    sys.stdout.buffer.write(output+b'\n')


if __name__ == '__main__':
    try:
        main()
    finally:
        # Trusted harness diagnostics, outside the numerical response/evidence.
        target = os.environ.get('NOMUE_EXPERIMENT_METRICS')
        if target:
            Path(target).write_text(json.dumps({'peak_rss_kib':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss}))
