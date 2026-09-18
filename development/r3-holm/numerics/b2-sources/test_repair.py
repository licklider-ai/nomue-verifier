"""Repair checks: same results and refusals as the predecessor, portable admission.

Run from the repository root:

    python3 governance/drafts/release-3-preparation/holm-b2-repair-20260918/test_repair.py

Writes RESULTS.json beside this file. The predecessor is imported read-only and
is never modified.
"""
import importlib.util
import json
import math
import os
import random
import struct
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(HERE))))
PREDECESSOR = os.path.join(ROOT, "governance", "drafts", "release-3-preparation",
                           "holm-experiment-20260911", "candidate.py")


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


old = load("holm_predecessor", PREDECESSOR)
new = load("holm_repair", os.path.join(HERE, "candidate.py"))

SEED = 20260918
RESULTS = {}
checks = 0


def outcome(module, carrier):
    """Result or refusal reason, with the diagnostic counters removed."""
    try:
        return ("ok", module.evidence_view(module.transform(carrier)))
    except ValueError as error:
        return ("refused", str(error))


def random_carrier(rng, n=None, valid=True):
    n = n if n is not None else rng.randint(1, 24)
    members = []
    for i in range(n):
        r = rng.random()
        if r < 0.2:
            p = rng.choice([0.0, 1.0, 5e-324, 1.0 - 2 ** -53, 2.0 ** -1022, 0.05])
        else:
            p = rng.random()
        raw = struct.pack(">d", p)
        label = "h%04d" % (i if valid or rng.random() < 0.7 else rng.randint(0, 3))
        members.append({"hypothesis": label, "origin": "o%d" % rng.randint(0, 3), "p": raw})
    carrier = {"family": "F", "revision": "r1", "members": members}
    if not valid:
        spoil = rng.randrange(7)
        if spoil == 0:
            carrier["members"] = []
        elif spoil == 1 and members:
            members[0]["p"] = b"\x00" * 7
        elif spoil == 2 and members:
            members[0]["p"] = struct.pack(">d", -0.0)
        elif spoil == 3 and members:
            members[0]["hypothesis"] = "bad label!"
        elif spoil == 4 and members:
            members[0]["hypothesis"] = "x" * 65
        elif spoil == 5:
            carrier["extra"] = 1
        elif spoil == 6 and members:
            members[0]["p"] = struct.pack(">d", 2.0)
    return carrier


def c1_equivalence():
    """Identical results and identical refusal reasons across valid and malformed input."""
    global checks
    rng = random.Random(SEED)
    same = diff = refusals = 0
    for _ in range(6000):
        valid = rng.random() < 0.6
        carrier = random_carrier(rng, valid=valid)
        a = outcome(old, carrier)
        b = outcome(new, carrier)
        checks += 1
        if a[0] == "refused":
            refusals += 1
        if old.identical(a[1], b[1]) if a[0] == "ok" and b[0] == "ok" else a == b:
            same += 1
        else:
            diff += 1
            if diff <= 3:
                print("DIVERGENCE", a, b)
    RESULTS["C1_predecessor_equivalence"] = {
        "carriers": 6000, "refusing_carriers": refusals,
        "identical": same, "divergences": diff}


def c2_order_equivalence():
    """The repaired sort returns the predecessor's permutation, ties included."""
    global checks
    rng = random.Random(SEED + 1)
    diff = 0
    for _ in range(3000):
        n = rng.randint(1, 200)
        keys = [rng.randrange(max(n // 4, 1)) for _ in range(n)]
        a, _ = old.ordered(range(n), lambda i: keys[i])
        b, _ = new.ordered(range(n), lambda i: keys[i])
        checks += 1
        diff += a != b
    RESULTS["C2_order_equivalence"] = {"sorts": 3000, "divergences": diff}


def c3_bound_holds():
    """No ordering of any admitted family size exceeds the derived bound."""
    global checks
    rng = random.Random(SEED + 2)
    worst = {}
    violations = 0
    sizes = [1, 2, 3, 7, 8, 9, 63, 64, 65, 120, 512, 1023, 1024]
    for n in sizes:
        bound = new.comparison_bound(n)
        peak = 0
        patterns = []
        patterns.append(list(range(n)))
        patterns.append(list(range(n))[::-1])
        patterns.append([min(i, n - 1 - i) for i in range(n)])
        patterns.append([(i * 37) % n for i in range(n)])
        for b in range(32):
            patterns.append([(i % 32) * n + (i // 32) for i in range(n)])
        for _ in range(120):
            patterns.append(rng.sample(range(n), n))
        for keys in patterns:
            _, count = new.ordered(range(n), lambda i: keys[i])
            checks += 1
            peak = max(peak, count)
            if count > bound:
                violations += 1
        worst[str(n)] = {"bound": bound, "observed_maximum": peak}
    RESULTS["C3_derived_bound"] = {"sizes": worst, "violations": violations}


def c4_no_size_refusal():
    """A maximal family is admitted whatever its ordering, including the orderings
    that drove the predecessor's runtime counter closest to its fixed ceiling."""
    global checks
    rng = random.Random(SEED + 3)
    n = new.LIMIT
    refused_new = refused_old = 0
    old_peak = new_peak = 0
    for _ in range(60):
        perm = rng.sample(range(n), n)
        labels = ["h%04d" % p for p in perm]
        members = [{"hypothesis": labels[i], "origin": "o",
                    "p": struct.pack(">d", (perm[i] + 1) / (n + 1))} for i in range(n)]
        carrier = {"family": "F", "revision": "r1", "members": members}
        checks += 1
        try:
            r = new.transform(carrier)
            new_peak = max(new_peak, r["comparisons"]["identity"], r["comparisons"]["values"])
        except ValueError as e:
            if str(e) == "comparison budget":
                refused_new += 1
            else:
                raise
        try:
            r = old.transform(carrier)
            old_peak = max(old_peak, r["comparisons"]["identity"], r["comparisons"]["values"])
        except ValueError as e:
            if str(e) == "comparison budget":
                refused_old += 1
            else:
                raise
    RESULTS["C4_maximal_family"] = {
        "family_size": n, "orderings": 60,
        "repaired_refusals": refused_new, "predecessor_refusals": refused_old,
        "repaired_peak_comparisons": new_peak, "predecessor_peak_comparisons": old_peak,
        "repaired_bound": new.comparison_bound(n), "predecessor_fixed_ceiling": 10240}


def c5_adjusted_values_unchanged():
    """Published adjusted values are untouched by the repair."""
    global checks
    rng = random.Random(SEED + 4)
    diff = 0
    for _ in range(2000):
        n = rng.randint(1, 60)
        vs = [rng.random() for _ in range(n)]
        members = [{"hypothesis": "h%04d" % i, "origin": "o", "p": struct.pack(">d", vs[i])}
                   for i in range(n)]
        carrier = {"family": "F", "revision": "r1", "members": members}
        checks += 1
        a = old.transform(carrier)
        b = new.transform(carrier)
        if a["adjusted_lattice"] != b["adjusted_lattice"] or a["display"] != b["display"]:
            diff += 1
    RESULTS["C5_adjusted_values_unchanged"] = {"families": 2000, "divergences": diff}


def main():
    c1_equivalence()
    c2_order_equivalence()
    c3_bound_holds()
    c4_no_size_refusal()
    c5_adjusted_values_unchanged()
    RESULTS["totals"] = {"checks": checks}
    RESULTS["environment"] = {
        "python": sys.version.split()[0], "implementation": sys.implementation.name,
        "predecessor": os.path.relpath(PREDECESSOR, ROOT)}
    with open(os.path.join(HERE, "RESULTS.json"), "w") as fh:
        json.dump(RESULTS, fh, indent=2, sort_keys=True)
        fh.write("\n")
    print(json.dumps(RESULTS, indent=2, sort_keys=True))
    bad = (RESULTS["C1_predecessor_equivalence"]["divergences"]
           + RESULTS["C2_order_equivalence"]["divergences"]
           + RESULTS["C3_derived_bound"]["violations"]
           + RESULTS["C4_maximal_family"]["repaired_refusals"]
           + RESULTS["C5_adjusted_values_unchanged"]["divergences"])
    if bad:
        print("FAILED: %d defect(s)" % bad, file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
