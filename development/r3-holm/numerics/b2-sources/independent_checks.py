"""Independent B-2 checks for the ordinary supplied-p Holm candidate.

Written for the Release 3 B-2 mathematical and numerical review. Every expected
value is produced from Holm (1979) Scheme 1, from closed testing with Bonferroni
local tests, or from CPython integer/Fraction primitives. No expectation is taken
from the candidate, from its oracle, or from any previous review report.

Run from the repository root:

    python3 review-inputs/r3-holm-b2-numerical-review-20260918/independent_checks.py

Writes RESULTS.json beside this file.
"""
import json
import math
import os
import random
import struct
import sys
from fractions import Fraction
from struct import pack, unpack

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "governance", "drafts", "release-3-preparation",
                                "holm-experiment-20260911"))
import candidate  # noqa: E402  the artifact under review

U = 1 << 1074
SEED = 20260918
RESULTS = {}


# --------------------------------------------------------------------------
# Independent references
# --------------------------------------------------------------------------
def scheme1_reject(ps, alpha):
    """Holm (1979) Scheme 1 applied literally to exact rational levels.

    Reject H(k) when R(k) <= alpha/(n-k+1); otherwise accept H(k)..H(n) and stop.
    The non-strict comparison is the one the paper's proof complements, which
    bounds P(R_i > alpha/m for all i in I) from below by 1 - alpha.
    """
    n = len(ps)
    order = sorted(range(n), key=lambda i: (ps[i], i))
    rejected = set()
    for k in range(1, n + 1):
        i = order[k - 1]
        if ps[i] <= Fraction(alpha, n - k + 1):
            rejected.add(i)
        else:
            break
    return rejected


def closed_testing_adjusted(ps):
    """Closed testing with Bonferroni local tests over every non-empty subset."""
    n = len(ps)
    out = [Fraction(0)] * n
    for mask in range(1, 1 << n):
        idx = [i for i in range(n) if mask >> i & 1]
        local = min(Fraction(1), len(idx) * min(ps[i] for i in idx))
        for i in idx:
            out[i] = max(out[i], local)
    return out


def stepdown_adjusted(ps):
    """Capped running maximum of rank-scaled exact levels."""
    n = len(ps)
    order = sorted(range(n), key=lambda i: (ps[i], i))
    out, run = [Fraction(0)] * n, Fraction(0)
    for rank, i in enumerate(order):
        run = min(Fraction(1), max(run, (n - rank) * ps[i]))
        out[i] = run
    return out


def project_ref(a):
    """Correctly rounded binary64 of a/2**1074 via CPython int true division."""
    return pack(">d", a / U)


def lattice_ref(raw):
    q = Fraction(unpack(">d", raw)[0]) * U
    assert q.denominator == 1
    return int(q)


def carrier(vs, labels=None, family="F", revision="r1", origins=None):
    labels = labels or ["h%04d" % i for i in range(len(vs))]
    origins = origins or ["o"] * len(vs)
    return {
        "family": family,
        "revision": revision,
        "members": [
            {"hypothesis": labels[i], "origin": origins[i],
             "p": vs[i] if isinstance(vs[i], bytes) else pack(">d", vs[i])}
            for i in range(len(vs))
        ],
    }


# --------------------------------------------------------------------------
# C1 / C2 / C3  derivation against the primary source
# --------------------------------------------------------------------------
def c1_c2_c3():
    random.seed(SEED)
    alphas = [Fraction(1, 1000), Fraction(1, 100), Fraction(5, 100), Fraction(1, 10),
              Fraction(1, 3), Fraction(1, 2), Fraction(99, 100), Fraction(999, 1000)]

    def rand_p():
        r = random.random()
        if r < 0.15:
            return random.choice([0.0, 1.0, 5e-324, 1.0 - 2 ** -53, 2.0 ** -1022])
        if r < 0.40:
            return random.choice([0.01, 0.02, 0.04, 0.05, 0.25, 0.5])
        return random.random()

    alpha_cases = step_bad = closed_bad = equiv_bad = 0
    for _ in range(1200):
        n = random.randint(1, 9)
        vs = [rand_p() for _ in range(n)]
        adj = [Fraction(a, U) for a in candidate.transform(carrier(vs))["adjusted_lattice"]]
        ps = [Fraction(v) for v in vs]
        step_bad += adj != stepdown_adjusted(ps)
        closed_bad += adj != closed_testing_adjusted(ps)
        for a in alphas:
            alpha_cases += 1
            if scheme1_reject(ps, a) != {i for i in range(n) if adj[i] <= a}:
                equiv_bad += 1
    RESULTS["C1_scheme1_equivalence"] = {
        "families": 1200, "alpha_cases": alpha_cases,
        "alpha_domain": "0 < alpha < 1", "mismatches": equiv_bad}
    RESULTS["C3_closed_testing_agreement"] = {
        "families": 1200, "stepdown_mismatches": step_bad,
        "closed_testing_mismatches": closed_bad}

    # C2: the cap at 1 is only faithful below alpha = 1.
    diverge = []
    for vs in ([0.6, 0.7], [0.9, 0.95, 0.99], [0.75, 1.0]):
        ps = [Fraction(v) for v in vs]
        adj = [Fraction(a, U) for a in candidate.transform(carrier(vs))["adjusted_lattice"]]
        for a in (Fraction(1), Fraction(3, 2)):
            paper = sorted(scheme1_reject(ps, a))
            viaadj = sorted(i for i in range(len(vs)) if adj[i] <= a)
            if paper != viaadj:
                diverge.append({"p": vs, "alpha": str(a),
                                "scheme1_rejects": paper, "adjusted_le_alpha": viaadj})
    RESULTS["C2_alpha_domain_boundary"] = {
        "divergences_at_alpha_ge_1": len(diverge), "examples": diverge[:3],
        "note": "confirms the candidate design's documented exclusion of alpha = 1"}


# --------------------------------------------------------------------------
# C4 / C5  representation
# --------------------------------------------------------------------------
def c4_c5():
    random.seed(SEED + 1)
    probe = [0.0, 5e-324, 1e-320, 2.2250738585072014e-308, 1e-300, 0.05, 0.1, 0.5,
             1.0 - 2 ** -53, 1.0, 2.0 ** -1022, 2.0 ** -52]
    probe += [random.random() for _ in range(10000)]
    probe += [math.ldexp(random.getrandbits(53), -random.randint(53, 1080))
              for _ in range(10000)]
    probe = [v for v in probe if 0.0 <= v <= 1.0]
    bad = sum(candidate.decode(pack(">d", v)) != lattice_ref(pack(">d", v)) for v in probe)
    RESULTS["C4_decode_fidelity"] = {"checks": len(probe), "mismatches": bad}

    n = bad5 = 0

    def cmp(a):
        nonlocal n, bad5
        n += 1
        bad5 += candidate.project(a) != project_ref(a)

    for a in range(0, 1 << 13):                      # exhaustive subnormal band
        cmp(a)
    for base in (1 << 52, 1 << 53):                  # class boundaries
        for d in range(-2048, 2049):
            if 0 <= base + d <= U:
                cmp(base + d)
    for L in range(54, 1076):                        # every binade, both parities,
        s = L - 53                                   # both midpoint directions
        for q in ((1 << 52), (1 << 52) + 1, (1 << 53) - 2, (1 << 53) - 1):
            for r in (0, 1, (1 << (s - 1)) - 1, 1 << (s - 1), (1 << (s - 1)) + 1,
                      (1 << s) - 1):
                a = (q << s) + r
                if 0 <= a <= U:
                    cmp(a)
    for d in range(0, 2049):                         # the cap and its neighbourhood
        cmp(U - d)
    for _ in range(60000):
        cmp(random.randint(0, U))
    RESULTS["C5_projection_round_ties_to_even"] = {"checks": n, "mismatches": bad5}


# --------------------------------------------------------------------------
# C6 / C7 / C8 / C9  admission and identity
# --------------------------------------------------------------------------
def c6_c7_c8_c9():
    domain = {}
    for name, raw in [
        ("negative_zero", pack(">d", -0.0)),
        ("smallest_negative", pack(">d", -5e-324)),
        ("minus_one", pack(">d", -1.0)),
        ("nextafter_one", pack(">d", math.nextafter(1.0, 2.0))),
        ("two", pack(">d", 2.0)),
        ("infinity", pack(">d", math.inf)),
        ("nan", pack(">d", math.nan)),
        ("seven_bytes", b"\x00" * 7),
        ("bytearray_eight", bytearray(8)),
        ("positive_zero", pack(">d", 0.0)),
        ("one", pack(">d", 1.0)),
    ]:
        try:
            candidate.decode(raw)
            domain[name] = "admitted"
        except ValueError as e:
            domain[name] = "refused: %s" % e
    RESULTS["C6_admitted_domain"] = domain

    random.seed(SEED + 2)
    viol = 0
    for _ in range(2000):
        n = random.randint(2, 8)
        base = [random.choice([0.01, 0.02, 0.5, 1e-10]) for _ in range(n)]
        labs = ["h%04d" % i for i in range(n)]
        a1 = dict(zip(labs, candidate.transform(carrier(base, labs))["adjusted_lattice"]))
        perm = list(range(n))
        random.shuffle(perm)
        pl = [labs[p] for p in perm]
        a2 = dict(zip(pl, candidate.transform(
            carrier([base[p] for p in perm], pl))["adjusted_lattice"]))
        viol += a1 != a2
    RESULTS["C7_tie_and_permutation_invariance"] = {"families": 2000, "violations": viol}

    car = carrier([0.1, 0.3])
    good = candidate.transform(car)
    a0 = good["adjusted_lattice"][0]
    collision = candidate.project(a0) == candidate.project(a0 + 1)
    tampered = dict(good)
    tampered["adjusted_lattice"] = [a0 + 1] + list(good["adjusted_lattice"][1:])
    try:
        candidate.check_evidence(car, tampered)
        exact_tamper = "accepted"
    except ValueError as e:
        exact_tamper = "refused: %s" % e
    RESULTS["C8_exact_versus_display"] = {
        "display_collision_available": collision,
        "exact_only_tamper": exact_tamper}

    deep = good
    for _ in range(4000):
        deep = [deep]

    class Hostile:
        def __eq__(self, other):
            raise AssertionError("hostile __eq__ executed")

    cases = {
        "non_dict_evidence": [1, 2, 3],
        "deeply_nested_list": deep,
        "hostile_eq_member": {k: (Hostile() if k == "order" else v) for k, v in good.items()},
        "extra_top_level_key": dict(good, extra=1),
        "missing_key": {k: v for k, v in good.items() if k != "order"},
        "int_where_bytes": dict(good, display=[0, 0]),
        "bool_where_int": dict(good, input_lattice=[True, True]),
    }
    out = {}
    for name, obj in cases.items():
        try:
            candidate.check_evidence(car, obj)
            out[name] = "accepted"
        except ValueError as e:
            out[name] = "refused: %s" % e
        except RecursionError:
            out[name] = "RecursionError"
        except AssertionError as e:
            out[name] = "hostile code ran: %s" % e
    RESULTS["C9_hostile_evidence"] = out


# --------------------------------------------------------------------------
# C10  comparison-budget headroom at the admitted maximum family size
# --------------------------------------------------------------------------
def c10(iterations=6000):
    N, BUDGET = 1024, 10240
    random.seed(SEED + 3)

    def count(perm):
        try:
            return candidate.ordered(range(N), lambda i: perm[i])[1]
        except ValueError:
            return BUDGET + 1

    state = random.sample(range(N), N)
    cur = best = count(state)
    for _ in range(iterations):
        cand = list(state)
        m = random.random()
        if m < 0.55:
            a, b = random.randrange(N), random.randrange(N)
            cand[a], cand[b] = cand[b], cand[a]
        elif m < 0.85:
            a = random.randrange(N)
            b = min(N, a + random.randint(2, 64))
            cand[a:b] = cand[a:b][::-1]
        else:
            a = random.randrange(N)
            b = min(N, a + random.randint(2, 96))
            seg = cand[a:b]
            random.shuffle(seg)
            cand[a:b] = seg
        c = count(cand)
        if c >= cur:
            cur, state = c, cand
            best = max(best, c)
    RESULTS["C10_comparison_budget"] = {
        "family_size": N, "budget": BUDGET, "iterations": iterations,
        "observed_maximum": best, "headroom": BUDGET - best,
        "headroom_percent": round(100.0 * (BUDGET - best) / BUDGET, 2),
        "exceeded": best > BUDGET,
        "note": "search result, not a worst-case bound for the interpreter's sort"}


def main():
    c1_c2_c3()
    c4_c5()
    c6_c7_c8_c9()
    c10(int(os.environ.get("B2_BUDGET_ITERATIONS", "6000")))
    RESULTS["environment"] = {
        "python": sys.version.split()[0],
        "implementation": sys.implementation.name,
        "candidate_module": os.path.relpath(candidate.__file__, ROOT),
        "note": "the candidate pins CPython 3.12.14; C1-C9 are exact integer and "
                "rational checks independent of the interpreter version, while C10 "
                "counts comparisons made by this interpreter's sort",
    }
    here = os.path.dirname(os.path.abspath(__file__))
    with open(os.path.join(here, "RESULTS.json"), "w") as fh:
        json.dump(RESULTS, fh, indent=2, sort_keys=True)
        fh.write("\n")
    print(json.dumps(RESULTS, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
