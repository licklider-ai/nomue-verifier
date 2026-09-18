"""One trusted invocation per supervisor process; Linux cgroup v2 research candidate."""
import argparse
import base64
import ctypes
import hashlib
import json
import math
import os
from pathlib import Path
import platform
import selectors
import shutil
import signal
import subprocess
import sys
import tempfile
import time
import uuid

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
OUT_CAP = 4 * 1024 * 1024 + 262144
ERR_CAP = 65536
POLICY = {"memory.max": "536870912", "memory.swap.max": "0",
          "memory.oom.group": "1", "pids.max": "64", "cpu.max": "100000 100000"}
CANCELLED = False


def kv(file):
    return {k: int(v) for k, v in (line.split() for line in file.read_text().splitlines())}


def digest(file):
    h = hashlib.sha256()
    with open(file, "rb") as f:
        for b in iter(lambda: f.read(65536), b""):
            h.update(b)
    return h.hexdigest()


def delta(before, after):
    if any(after.get(k, -1) < v for k, v in before.items()):
        raise ValueError("counter regressed")
    return {k: v - before.get(k, 0) for k, v in after.items()}


def category(flags):
    # Private execution vocabulary; not Protocol reasons. All observed causes retained.
    for name in ["cleanup_failed", "memory_enforced", "pids_enforced", "cancelled",
                 "deadline", "output_overflow", "unsupported_host", "setup_failed",
                 "invalid_input", "abnormal_exit", "completed_invalid_output"]:
        if flags.get(name):
            return name
    return "completed_valid"


def strict_json(raw):
    def pairs(items):
        value = {}
        for k, v in items:
            if k in value:
                raise ValueError("duplicate transport key")
            value[k] = v
        return value
    def invalid(_):
        raise ValueError("nonfinite transport")
    def integer(text):
        if text == '-0':
            raise ValueError('negative zero transport')
        number = int(text)
        try:
            finite = math.isfinite(float(number))
        except OverflowError:
            finite = False
        if not finite:
            raise ValueError('ineligible transport integer')
        return number
    # Generated trusted output only. Record bytes are never reparsed here.
    value = json.loads(raw.decode("utf-8"), object_pairs_hook=pairs,
                       parse_constant=invalid, parse_int=integer)
    pending = [value]
    while pending:
        item = pending.pop()
        if isinstance(item, str):
            item.encode('utf-8', errors='strict')
        elif isinstance(item, float):
            if not math.isfinite(item) or (item == 0 and math.copysign(1, item) < 0):
                raise ValueError('ineligible transport number')
        elif isinstance(item, dict):
            pending.extend(item.keys())
            pending.extend(item.values())
        elif isinstance(item, list):
            pending.extend(item)
    return value


def strict_transport(raw, nonce):
    value = strict_json(raw)
    if not isinstance(value, dict) or set(value) != {'nonce', 'payload', 'sha256'}:
        raise ValueError('completion envelope')
    if value['nonce'] != nonce or not isinstance(value['payload'], str):
        raise ValueError('completion identity')
    payload = value['payload'].encode('utf-8')
    if hashlib.sha256(payload).hexdigest() != value['sha256']:
        raise ValueError('completion corruption')
    result = strict_json(payload)
    if not isinstance(result, dict) or set(result) not in ({'output'}, {'output', 'proposed_record_base64'}):
        raise ValueError('transport fields')
    output = result['output']
    if (not isinstance(output, dict) or output.get('protocol') != 'unissued-holm-output/0.3.0-candidate.5'
            or output.get('kind') not in ('report', 'refusal')):
        raise ValueError('output identity')
    if len(json.dumps(output, separators=(',', ':'), ensure_ascii=False).encode()) > 262144:
        raise ValueError('output cap')
    if 'proposed_record_base64' in result:
        text = result['proposed_record_base64']
        if not isinstance(text, str) or len(text) > 3145728:
            raise ValueError('snapshot cap')
        record = base64.b64decode(text, validate=True)
        if base64.b64encode(record).decode() != text or len(record) > 2359296:
            raise ValueError('snapshot encoding')
        rows = output.get('conformance', []) + output.get('verification', [])
        if output['kind'] != 'report' or len(rows) != 7 or any(
                c.get('execution') != 'completed' or c.get('outcome') != 'pass' for c in rows):
            raise ValueError('snapshot without all checks')
    return result


def supported(parent, node, python):
    if platform.system() != "Linux" or platform.machine() != "x86_64":
        raise ValueError("Linux x64 required")
    if sys.version_info[:3] != (3, 12, 14):
        raise ValueError("pinned Python 3.12.14 required")
    if python.resolve() != Path(sys.executable).resolve():
        raise ValueError("worker and supervisor interpreter identity required")
    # The actual cgroup2 mount, not merely proc/cgroups or a namespace-root spelling.
    mounts = [line.split() for line in Path("/proc/mounts").read_text().splitlines()]
    if not any(m[1] == "/sys/fs/cgroup" and m[2] == "cgroup2" and "rw" in m[3].split(",") for m in mounts):
        raise ValueError("writable cgroup2 mount required")
    parent = parent.resolve(strict=True)
    parent.relative_to(Path("/sys/fs/cgroup"))
    if parent == Path("/sys/fs/cgroup"):
        raise ValueError("explicit dedicated delegation required")
    for branch in [parent, parent / "calls"]:
        if (branch / "cgroup.type").read_text().strip() != "domain":
            raise ValueError("domain cgroup required")
        if (branch / "cgroup.procs").read_text().strip():
            raise ValueError("internal processes in controller-distribution node")
        for file in ["cgroup.controllers", "cgroup.subtree_control"]:
            if not {"memory", "cpu", "pids"}.issubset((branch / file).read_text().split()):
                raise ValueError("controllers not enabled at both distribution levels")
    if not (parent / "supervisor" / "cgroup.procs").is_file():
        raise ValueError("supervisor sibling required")
    for p in [node, python]:
        if not p.is_absolute() or not p.is_file() or not os.access(p, os.X_OK):
            raise ValueError("absolute executable required")
    pins = json.loads((HERE / "outer-runtime.json").read_text())
    for row in pins["runtime"]:
        if digest(ROOT / row["path"]) != row["sha256"]:
            raise ValueError("runtime source drift")
    return parent


def bootstrap():
    leaf = Path(sys.argv[2])
    # Single-threaded bootstrap, before Node startup, input reading or child generation.
    (leaf / "cgroup.procs").write_text(str(os.getpid()))
    Path("/proc/self/oom_score_adj").write_text("0")
    os.execv(sys.argv[3], sys.argv[3:])


def run(args):
    global CANCELLED
    CANCELLED = False
    started = time.monotonic()
    flags, info = {}, {"kernel": platform.release(), "architecture": platform.machine(), "nonce": args.nonce, "probe": args.probe, "runtime_manifest_sha256": digest(HERE / "outer-runtime.json")}
    leaf = temporary = process = selector = None
    streams = {"stdout": bytearray(), "stderr": bytearray()}
    counts = {"stdout": 0, "stderr": 0}
    reaped = []
    before = None
    leader_code = None
    clean = {"populated_zero": False, "echild": False, "cgroup_removed": False, "temporary_removed": False}
    def cancelled(signum, frame):
        global CANCELLED
        CANCELLED = True
    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, cancelled)
    def pump(timeout):
        for key, _ in selector.select(timeout):
            b = os.read(key.fd, 65536)
            if not b:
                selector.unregister(key.fileobj)
                key.fileobj.close()
                continue
            name = key.data
            counts[name] += len(b)
            cap = OUT_CAP if name == "stdout" else ERR_CAP
            if counts[name] > cap:
                flags["output_overflow"] = True
            room = max(0, cap - len(streams[name]))
            streams[name].extend(b[:room])
    try:
        try:
            parent = supported(Path(args.delegation), Path(args.node), Path(args.python))
            libc = ctypes.CDLL(None, use_errno=True)
            if libc.prctl(36, 1, 0, 0, 0) != 0:  # PR_SET_CHILD_SUBREAPER
                raise OSError(ctypes.get_errno(), "subreaper")
            (parent / "supervisor" / "cgroup.procs").write_text(str(os.getpid()))
            leaf = parent / "calls" / ("call-" + uuid.uuid4().hex)
            leaf.mkdir()
            for name, value in {**POLICY, "memory.max": str(args.memory), "pids.max": str(args.tasks)}.items():
                (leaf / name).write_text(value)
                if " ".join((leaf / name).read_text().split()) != value:
                    raise ValueError("control readback")
            for f in ["cgroup.kill", "memory.events.local", "pids.events", "cgroup.events", "cpu.stat"]:
                if not (leaf / f).is_file():
                    raise ValueError("missing control interface")
            # Test writability without signalling any tasks: the fresh leaf is empty.
            (leaf / "cgroup.kill").write_text("1")
            before = (kv(leaf / "memory.events.local"), kv(leaf / "pids.events"))
            if not {"max", "oom", "oom_kill"}.issubset(before[0]) or "max" not in before[1]:
                raise ValueError("required counters absent")
            info.update({"delegation": str(parent), "supervisor": str(parent / "supervisor"),
                         "leaf": str(leaf), "controls": {n: (leaf / n).read_text().strip() for n in POLICY},
                         "node_sha256": digest(args.node), "python_sha256": digest(args.python),
                         "proc_swaps": Path("/proc/swaps").read_text(), "subreaper": True})
        except Exception as e:
            flags["unsupported_host"] = True
            info["preflight_error"] = type(e).__name__ + ": " + str(e)
            raise RuntimeError("unsupported preflight")
        temporary = Path(tempfile.mkdtemp(prefix="holm-call-"))
        info["temporary"] = str(temporary)
        env = {"PATH": "/usr/bin:/bin", "TMPDIR": str(temporary),
               "NOMUE_EXPERIMENT_PYTHON": args.python, "NOMUE_CALL_NONCE": args.nonce, "LANG": "C.UTF-8"}
        command = [args.node, str(HERE / "outer-entry.mjs"), args.record]
        if args.expected is not None:
            command.append(args.expected)
        # Test-only replacement entry is a trusted CLI argument, never a Record field.
        if args.probe:
            command = [args.node, str(HERE / "outer-probes.mjs"), args.probe]
        process = subprocess.Popen([args.python, "-I", str(HERE / "outer-supervisor.py"), "--bootstrap", str(leaf), *command],
                                   cwd=ROOT, env=env, stdin=subprocess.DEVNULL,
                                   stdout=subprocess.PIPE, stderr=subprocess.PIPE, close_fds=True)
        selector = selectors.DefaultSelector()
        for file, name in [(process.stdout, "stdout"), (process.stderr, "stderr")]:
            os.set_blocking(file.fileno(), False)
            selector.register(file, selectors.EVENT_READ, name)
        while True:
            if CANCELLED:
                flags["cancelled"] = True
            if time.monotonic() - started >= args.deadline:
                flags["deadline"] = True
            if flags:
                break
            pump(0.01)
            leader_code = process.poll()
            if leader_code is not None:
                break
    except Exception as e:
        if not flags.get("unsupported_host"):
            flags["setup_failed"] = True
        info["exception"] = type(e).__name__
    finally:
        # A leader exiting during the last selector wait still consumed that wall time.
        if process is not None and time.monotonic() - started >= args.deadline:
            flags['deadline'] = True
        # Even an exit-zero leader can leave grandchildren and temporary files.
        if leaf is not None:
            cleanup_start = time.monotonic()
            try:
                (leaf / "cgroup.kill").write_text("1")
                # Bootstrap can still be outside the leaf if launch failed early.
                if process is not None and process.poll() is None:
                    process.kill()
                while time.monotonic() - cleanup_start < args.cleanup:
                    (leaf / "cgroup.kill").write_text("1")
                    if process is not None:
                        rc = process.poll()
                        if leader_code is None and rc is not None:
                            leader_code = rc
                    try:
                        while True:
                            pid, status = os.waitpid(-1, os.WNOHANG)
                            if pid == 0:
                                break
                            if process is not None and pid == process.pid:
                                leader_code = os.waitstatus_to_exitcode(status)
                                process.returncode = leader_code
                            reaped.append({"pid": pid, "status": status})
                    except ChildProcessError:
                        clean["echild"] = True
                    clean["populated_zero"] = kv(leaf / "cgroup.events")["populated"] == 0
                    if selector:
                        pump(0.01)
                    if clean["populated_zero"] and clean["echild"] and (not selector or not selector.get_map()):
                        break
                    time.sleep(0.005)
                if before:
                    memory = delta(before[0], kv(leaf / "memory.events.local"))
                    pids = delta(before[1], kv(leaf / "pids.events"))
                    info.update({"memory_events_delta": memory, "pids_events_delta": pids,
                                 "cpu_stat": kv(leaf / "cpu.stat")})
                    flags["memory_enforced"] = any(memory.get(k, 0) > 0 for k in ("max", "oom", "oom_kill", "oom_group_kill"))
                    flags["pids_enforced"] = pids.get("max", 0) > 0
                    for f in ("memory.peak", "pids.peak"):
                        info[f] = int((leaf / f).read_text()) if (leaf / f).exists() else None
                if not (clean["populated_zero"] and clean["echild"]) or (selector and selector.get_map()):
                    raise RuntimeError("cleanup deadline")
                leaf.rmdir()
                clean["cgroup_removed"] = True
                if temporary:
                    shutil.rmtree(temporary)
                    clean["temporary_removed"] = not temporary.exists()
                else:
                    clean["temporary_removed"] = True
            except Exception as e:
                flags["cleanup_failed"] = True
                info["cleanup_error"] = type(e).__name__ + ": " + str(e)
            info["cleanup_seconds"] = time.monotonic() - cleanup_start
        if selector:
            for key in list(selector.get_map().values()):
                key.fileobj.close()
            selector.close()
        info.update({"cleanup": clean, "reaped_descendants": reaped, "leader_exit": leader_code,
                     "bytes_observed": counts, "bytes_buffered": {k: len(v) for k, v in streams.items()},
                     "elapsed_seconds": time.monotonic() - started})
    flags["cancelled"] = CANCELLED
    if leader_code == 78:
        flags["unsupported_host"] = True
    flags["invalid_input"] = leader_code == 65
    flags["abnormal_exit"] = leader_code != 0
    result = None
    if not any(flags.values()):
        try:
            if streams["stderr"]:
                raise ValueError("unexpected stderr")
            result = strict_transport(streams["stdout"], args.nonce)
        except Exception:
            flags["completed_invalid_output"] = True
    receipt = {"kind": "unissued-holm-controlled/0.3.0-candidate.5", "category": category(flags),
               "causes": {k: v for k, v in flags.items() if v}, "evidence": info}
    if receipt["category"] == "completed_valid":
        receipt["result"] = result
    return receipt


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "--bootstrap":
        bootstrap()
        return
    p = argparse.ArgumentParser()
    p.add_argument("--delegation", required=True)
    p.add_argument("--nonce", required=True)
    p.add_argument("--node", required=True)
    p.add_argument("--python", required=True)
    p.add_argument("--memory", type=int, default=536870912)
    p.add_argument("--tasks", type=int, default=64)
    p.add_argument("--deadline", type=float, default=30)
    p.add_argument("--cleanup", type=float, default=3)
    p.add_argument("--probe", choices=["checkpoint-timeout", "node-memory", "worker-memory", "pids", "descendant", "stdout", "stderr", "hang", "cpu", "invalid", "environment", "valid-then-hang", "wrong-nonce", "corrupt-output"])
    p.add_argument("record")
    p.add_argument("expected", nargs="?")
    args = p.parse_args()
    if len(args.nonce) != 64 or any(c not in "0123456789abcdef" for c in args.nonce):
        p.error("nonce")
    if not (8 * 1024 * 1024 <= args.memory <= 1024 * 1024 * 1024 and 8 <= args.tasks <= 128 and 0 < args.deadline <= 60 and 0 < args.cleanup <= 10):
        p.error("research bounds")
    receipt = run(args)
    # Final serialization belongs to the separately bounded trusted presentation.
    # A supervisor killed before stdout completion yields no acceptable completion.
    encoded = json.dumps(receipt, separators=(',', ':'), ensure_ascii=False)
    if len(encoded.encode()) > 6 * 1024 * 1024:
        raise RuntimeError('receipt cap')
    print(encoded)


if __name__ == "__main__":
    main()
