"""Disposable supplied-p transform; no scientific or Protocol acceptance.

Successor to holm-experiment-20260911/candidate.py. The only behavioural change
is that ordering no longer delegates to the interpreter's sort. The comparisons
a family costs are now a deterministic function of the input, bounded by a
schedule that depends only on the family size, so no admissible family can be
admitted by one conforming Python and refused by another. Decoding, rank
scaling, the capped cumulative scan, projection, the admitted domain, the
refusal order and the evidence comparator are unchanged, and every input
produces the identical result or the identical refusal. See README.md.
"""

LIMIT = 1024
U = 1 << 1074
ALPHABET = frozenset('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_.-')


def require(ok, reason):
    if not ok:
        raise ValueError(reason)


def comparison_bound(n):
    """Exact worst case of the merge sort below, derived from the merge schedule.

    Merging a left block of `a` and a right block of `b` costs at most a+b-1
    comparisons, because the last remaining element is appended without one.
    The schedule depends only on n, so this bound is a property of the admitted
    family size and not of any runtime.
    """
    require(type(n) is int and n >= 0, 'bound domain')
    total, width = 0, 1
    while width < n:
        start = 0
        while start < n:
            middle = min(start + width, n)
            end = min(start + 2 * width, n)
            if end > middle:
                total += end - start - 1
            start += 2 * width
        width *= 2
    return total


def ordered(indices, key):
    """Stable bottom-up merge sort over `indices`, ordered by `key`.

    Returns the sorted indices and the comparisons actually spent. That count
    depends on the input, but never on the interpreter's sort algorithm, and it
    is bounded by comparison_bound(n), which depends only on n. Admission is
    therefore a property of the family, not of the runtime. The check below is
    an internal invariant that a correct implementation cannot trip, not an
    admission rule.
    """
    items = list(indices)
    n = len(items)
    keys = [key(i) for i in items]
    order = list(range(n))
    scratch = [0] * n
    count = 0
    width = 1
    while width < n:
        start = 0
        while start < n:
            middle = min(start + width, n)
            end = min(start + 2 * width, n)
            i, j, out = start, middle, start
            while i < middle and j < end:
                count += 1
                if keys[order[j]] < keys[order[i]]:
                    scratch[out] = order[j]
                    j += 1
                else:
                    scratch[out] = order[i]
                    i += 1
                out += 1
            while i < middle:
                scratch[out] = order[i]
                i += 1
                out += 1
            while j < end:
                scratch[out] = order[j]
                j += 1
                out += 1
            start += 2 * width
        order, scratch = scratch, order
        width *= 2
    require(count <= comparison_bound(n), 'comparison budget')
    return [items[p] for p in order], count


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
    # Comparison counters stay outside evidence identity. They no longer vary
    # with the interpreter, but the evidence contract is unchanged.
    require(type(result) is dict, 'evidence shape')
    return {k: v for k, v in result.items() if k not in DIAGNOSTICS}


def check_evidence(expected_carrier, submitted):
    expected = transform(expected_carrier)
    require(identical(evidence_view(expected), evidence_view(submitted)), 'evidence mismatch')
    return True
