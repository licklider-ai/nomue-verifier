"""Disposable supplied-p transform; no scientific or Protocol acceptance."""
from functools import cmp_to_key

U = 1 << 1074
LIMIT = 1024
ALPHABET = frozenset('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_.-')


def require(ok, reason):
    if not ok:
        raise ValueError(reason)


def ordered(indices, key):
    count = 0
    def compare(i, j):
        nonlocal count
        count += 1
        require(count <= 10240, 'comparison budget')
        a, b = key(i), key(j)
        return (a > b) - (a < b)
    return sorted(indices, key=cmp_to_key(compare)), count


def decode(raw):
    require(type(raw) is bytes and len(raw) == 8, 'p bytes')
    bits = int.from_bytes(raw, 'big')
    require(bits <= 0x3ff0000000000000, 'p domain')
    e, f = (bits >> 52) & 2047, bits & ((1 << 52)-1)
    return f if e == 0 else ((1 << 52) + f) << (e-1)


def project(a):
    require(type(a) is int and 0 <= a <= U, 'projection domain')
    if a == 0:
        return bytes(8)
    s = max(a.bit_length()-53, 0)
    q, r = divmod(a, 1 << s)
    q += 2*r > (1 << s) or (2*r == (1 << s) and q % 2 == 1)
    k = q << s
    if k < 1 << 52:
        bits = k
    else:
        length = k.bit_length()
        sig = k >> (length-53)
        bits = ((length-52) << 52) | (sig-(1 << 52))
    return bits.to_bytes(8, 'big')


def transform(carrier):
    require(type(carrier) is dict and set(carrier) == {'family','revision','members'}, 'carrier shape')
    members = carrier['members']
    require(type(members) is list, 'members shape')
    require(1 <= len(members) <= LIMIT, 'family count')
    require(all(type(x) is dict and set(x) == {'hypothesis','origin','p'} for x in members), 'member shape')
    labels = [carrier['family'], carrier['revision']] + [x[k] for x in members for k in ('hypothesis','origin')]
    require(all(type(x) is str and 1 <= len(x) <= 64 for x in labels), 'label length')
    require(all(all(c in ALPHABET for c in x) for x in labels), 'label characters')
    ids, id_work = ordered(range(len(members)), lambda i: members[i]['hypothesis'])
    require(all(members[ids[i-1]]['hypothesis'] != members[ids[i]]['hypothesis'] for i in range(1,len(ids))), 'duplicate hypothesis')
    require(all(type(x['p']) is bytes and len(x['p']) == 8 for x in members), 'p bytes')
    values = [decode(x['p']) for x in members]
    order, sort_work = ordered(range(len(members)), lambda i: (values[i],i))
    adjusted, products, inverse = [0]*len(members), [], [0]*len(members)
    cumulative = 0
    for rank, original in enumerate(order):
        t = (len(members)-rank)*values[original]
        products.append(t)
        cumulative = min(U, max(cumulative,t))
        adjusted[original] = cumulative
        inverse[original] = rank
    copied = {'family':carrier['family'], 'revision':carrier['revision'], 'members':[dict(x) for x in members]}
    return {'carrier':copied,'input_lattice':values,'order':order,'inverse':inverse,
            'sorted_products':products,'adjusted_lattice':adjusted,
            'display':[project(a) for a in adjusted],
            'comparisons':{'identity':id_work,'values':sort_work}}


def identical(a,b):
    if type(a) is not type(b):
        return False
    if type(a) is dict:
        return a.keys()==b.keys() and all(identical(a[k],b[k]) for k in a)
    if type(a) is list:
        return len(a)==len(b) and all(identical(x,y) for x,y in zip(a,b))
    return a==b


DIAGNOSTICS = frozenset({'comparisons'})


def evidence_view(result):
    # Runtime comparison counters depend on the interpreter's sort algorithm;
    # they are diagnostics, not exact mathematical or identity evidence.
    require(type(result) is dict, 'evidence shape')
    return {k: v for k, v in result.items() if k not in DIAGNOSTICS}


def check_evidence(expected_carrier, submitted):
    expected = transform(expected_carrier)
    require(identical(evidence_view(expected), evidence_view(submitted)), 'evidence mismatch')
    return True
