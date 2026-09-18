"""Offline regression fixture authoring; not a runtime or npm-test dependency.

Requires mpmath 1.3.0. Exact Fraction moments, 100-digit beta inversion and
independent Student density quadrature. Synthetic inputs only; no product imports.
Run from the repository root and redirect stdout to tests/ci-reference.json.
"""
import json
from fractions import Fraction as F
import mpmath as mp

mp.mp.dps = 100

def real(x):
    x = F(x)
    return mp.mpf(x.numerator) / x.denominator

def moment(xs):
    xs = list(map(F, xs))
    mean = sum(xs) / len(xs)
    return mean, sum((x-mean)**2 for x in xs) / (len(xs)-1)

def reference(a, b):
    m1,v1=moment(a); m2,v2=moment(b)
    va=real(v1/len(a)); vb=real(v2/len(b))
    df=(va+vb)**2/(va**2/(len(a)-1)+vb**2/(len(b)-1))
    se=mp.sqrt(va+vb); mean=real(m1-m2)
    sf=lambda t: mp.betainc(df/2,mp.mpf('.5'),0,df/(df+t*t),regularized=True)/2
    lo=mp.mpf(0); hi=mp.mpf(1)
    while sf(hi)>mp.mpf('.025'): hi*=2
    for _ in range(350):
        mid=(lo+hi)/2
        if sf(mid)>mp.mpf('.025'):lo=mid
        else:hi=mid
    q=(lo+hi)/2
    density=lambda t: mp.gamma((df+1)/2)/(mp.sqrt(df*mp.pi)*mp.gamma(df/2))*(1+t*t/df)**(-(df+1)/2)
    assert abs(mp.quad(density,[0,q])-mp.mpf('.475')) < mp.mpf('1e-85')
    return dict(lower=str(mean-q*se),upper=str(mean+q*se),df=str(df),critical=str(q),se=str(se))

rows=[]
# Different group lengths/shapes, both endpoint signs, no product-tuned inputs.
for n,m in [(5,7),(3,4),(2,2),(9,13)]:
    a=[float(i-(n-1)/2) for i in range(n)]
    b=[float((i-(m-1)/2)*1.25) for i in range(m)]
    r=reference(a,b)
    shift=float(mp.mpf(r['critical'])*mp.mpf(r['se']))
    for offset in [-2**-40,2**-40]:
        shifted=[x+shift+offset for x in a]
        for exponent in [-20,0,20]:
            aa=[x*2**exponent for x in shifted]; bb=[x*2**exponent for x in b]
            rows.append(dict(name=f'{n}-{m}/{offset}/{exponent}',a=aa,b=bb,expected=reference(aa,bb)))
    # Old-trigger missed band, then either side of the new 1e-4 trigger.
    # Requested ratios are approximate: reference the actual rounded inputs.
    for ratio in [2e-6, 9e-5, 1.1e-4]:
        for sign in [-1, 1]:
            shifted=[x+shift+sign*shift*ratio for x in a]
            for exponent in [-20,0,20]:
                aa=[x*2**exponent for x in shifted]; bb=[x*2**exponent for x in b]
                rows.append(dict(name=f'{n}-{m}/ratio-{sign*ratio}/{exponent}',
                                 a=aa,b=bb,expected_refinement=ratio < 1e-4,
                                 expected=reference(aa,bb)))
print(json.dumps(dict(provenance='mpmath 1.3.0, 100 digits; Fraction binary64 moments; beta inversion checked by density quadrature',rows=rows),indent=2))
