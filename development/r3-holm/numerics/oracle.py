"""Small-family closed-testing oracle; no candidate imports."""
from fractions import Fraction
from struct import unpack, pack


def closed_testing(raw):
    if not 1 <= len(raw) <= 8:
        raise ValueError('oracle family cap')
    ps = [Fraction(unpack('>d', x)[0]) for x in raw]
    result = [Fraction(0)]*len(ps)
    for mask in range(1,1 << len(ps)):
        indices = [i for i in range(len(ps)) if mask & (1 << i)]
        local = min(Fraction(1), len(indices)*min(ps[i] for i in indices))
        for i in indices:
            result[i] = max(result[i],local)
    return result


def display(q):
    return pack('>d',float(q))
