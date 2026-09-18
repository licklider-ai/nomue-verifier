"""Real host reproduction on an explicitly delegated subtree or disposable CI host.
No fake cgroup/filesystem fallback. Root controllers are never enabled here.
"""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import tempfile
import time

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]
NODE=shutil.which('node')
PYTHON=sys.executable
rows=[]
NONCE='a'*64

def run_checked(command, **kwargs):
    return subprocess.run(command,capture_output=True,cwd=ROOT,timeout=50,**kwargs)

def probe(delegation, mode, extra=(), cancel=False):
    cmd=[PYTHON,'-I',str(HERE/'outer-supervisor.py'),'--delegation',str(delegation),
         '--node',NODE,'--python',PYTHON,'--nonce',NONCE,'--probe',mode,*extra,'/missing/record']
    if cancel:
        p=subprocess.Popen(cmd,stdout=subprocess.PIPE,stderr=subprocess.PIPE,cwd=ROOT)
        time.sleep(.4);p.send_signal(signal.SIGTERM);out,err=p.communicate(timeout=15)
        assert p.returncode==0,err
    else:
        p=run_checked(cmd);out,err=p.stdout,p.stderr
        assert p.returncode==0,err
    return json.loads(out)

def check(name, fn):
    try: rows.append({'name':name,'pass':True,'evidence':fn()})
    except Exception as e: rows.append({'name':name,'pass':False,'error':repr(e)})

def tests(delegation, artifact):
    inputs=artifact/'inputs'
    p=run_checked([NODE,'--import','tsx',str(HERE/'outer-cases.ts'),str(inputs)])
    assert p.returncode==0,p.stderr
    cases=json.loads((inputs/'cases.json').read_text())
    for case in cases:
        def evaluate(case=case):
            name=case['id']; receipt=artifact/(name+'.receipt.json')
            p=run_checked([NODE,str(HERE/'outer-run.mjs'),str(delegation),PYTHON,
                           case['record'],case['expected'] if case['expected'] is not None else '-',str(receipt)])
            assert p.returncode==0,p.stderr
            result=json.loads(p.stdout);(artifact/(name+'.result.json')).write_bytes(p.stdout)
            r=json.loads(receipt.read_text())
            assert r['category']=='completed_valid',r
            assert all(r['evidence']['cleanup'].values()),r
            assert not Path(r['evidence']['leaf']).exists()
            assert not Path(r['evidence']['temporary']).exists()
            output=result['output']
            if case['refusal']:
                assert output['kind']=='refusal' and output['refusal_kind']==case['refusal'],output
            else:
                assert output['kind']=='report',output
                by_stage={row['stage']:row for row in output['conformance']+output['verification']}
                for stage,want in case['checks'].items():
                    row=by_stage[stage]
                    assert (row.get('outcome') if row['execution']=='completed' else row['execution'])==want,(stage,row,want)
                for stage,want in case.get('reasons',{}).items():
                    assert by_stage[stage]['reasons']==want,(stage,by_stage[stage],want)
                if 'reference_digest' in case:
                    assert output['record_reference']['stored_projection_digest']==case['reference_digest'],output
                if case['id']=='R3D-42':
                    # Fixed prerequisite order and union, independent of dependency implementation.
                    ids=lambda names:['candidate:holm:0.3.0-candidate.5:'+n for n in names]
                    assert by_stage['H']['blockers']==ids(['D'])
                    assert by_stage['I']['blockers']==ids(['K'])
                    assert by_stage['A']['blockers']==ids(['K','D','H','I','C'])
                    expected_reasons=list(dict.fromkeys(by_stage['K']['reasons']+by_stage['D']['reasons']+by_stage['C']['reasons']))
                    assert by_stage['H']['reasons']==by_stage['D']['reasons']
                    assert by_stage['I']['reasons']==by_stage['K']['reasons']
                    assert by_stage['A']['reasons']==expected_reasons
            assert ('verified_record_base64' in result)==case['forward'],result
            if case['forward']:
                assert base64.b64decode(result['verified_record_base64'],validate=True)==Path(case['record']).read_bytes()
            return {'receipt':receipt.name,'result':name+'.result.json','expectations':case['checks'],
                    'original_byte_forward':case['forward']}
        check(case['id'],evaluate)
    # Retain the path setup description, not a cyclic link in the upload archive.
    (inputs/'record-loop').unlink()
    # These run the real file/inner/worker/output/lifecycle path with a trusted
    # replacement entry. Probe receipts are never accepted by controlledCall.
    fault_plan=[]
    for mode in ['fault-a-pass','fault-s-pass','fault-swap','fault-duplicate','fault-omit',
                 'fault-error-outcome','fault-notrun-outcome','fault-generic-reason',
                 'fault-missing-blocker','fault-unrelated-blocker','fault-missing-reason',
                 'fault-late-budget','fault-schema-budget','fault-worker-output']:
        schema=mode in ['fault-s-pass','fault-schema-budget']
        absent=mode in ['fault-a-pass','fault-error-outcome','fault-notrun-outcome','fault-generic-reason',
                        'fault-missing-blocker','fault-unrelated-blocker','fault-missing-reason']
        fault_plan.append({'mode':mode,'record':str(inputs/('R3D-07.record' if schema else 'R3D-01.record')),
                           'expected':None if absent else str(inputs/'R3D-01.expected'),
                           'refusal':'resource_limit' if 'budget' in mode else 'internal_error'})
    (artifact/'fault-plan.json').write_text(json.dumps(fault_plan,indent=2)+'\n')
    for plan in fault_plan:
        def injection(plan=plan):
            cmd=[PYTHON,'-I',str(HERE/'outer-supervisor.py'),'--delegation',str(delegation),
                 '--node',NODE,'--python',PYTHON,'--nonce',NONCE,'--probe',plan['mode'],plan['record']]
            if plan['expected'] is not None:cmd.append(plan['expected'])
            p=run_checked(cmd);assert p.returncode==0,p.stderr
            r=json.loads(p.stdout)
            (artifact/(plan['mode']+'.receipt.json')).write_bytes(p.stdout)
            assert r['category']=='completed_valid',r
            assert r['evidence']['probe']==plan['mode']
            assert all(r['evidence']['cleanup'].values()),r
            assert not Path(r['evidence']['leaf']).exists()
            assert not Path(r['evidence']['temporary']).exists()
            assert set(r['result'])=={'output'},r
            output=r['result']['output']
            assert output['kind']=='refusal' and output['refusal_kind']==plan['refusal'],r
            assert 'conformance' not in output and 'verification' not in output
            return {'receipt':plan['mode']+'.receipt.json','refusal':plan['refusal'],
                    'entry':'trusted fault injection; not normal controlledCall'}
        check(plan['mode'],injection)
    expected=[('node-memory','memory_enforced',['--memory','67108864','--deadline','2']),
              ('worker-memory','memory_enforced',['--memory','67108864','--deadline','2']),
              ('cpu','deadline',['--deadline','2']),
              ('pids','pids_enforced',['--tasks','16','--deadline','2']),
              ('descendant','completed_invalid_output',[]),('stdout','output_overflow',[]),
              ('stderr','output_overflow',[]),('hang','deadline',['--deadline','.5']),
              ('valid-then-hang','deadline',['--deadline','.5']),('wrong-nonce','completed_invalid_output',[]),
              ('corrupt-output','completed_invalid_output',[]),('invalid','completed_invalid_output',[])]
    for mode,want,extra in expected:
        def fault(mode=mode,want=want,extra=extra):
            r=probe(delegation,mode,extra);(artifact/(mode+'.receipt.json')).write_text(json.dumps(r,indent=2)+'\n')
            assert r['category']==want,r
            if mode=='cpu':assert r['evidence']['cpu_stat'].get('nr_throttled',0)>0,r
            assert 'result' not in r
            assert all(r['evidence']['cleanup'].values()),r
            assert not Path(r['evidence']['leaf']).exists()
            return {'category':r['category'],'receipt':mode+'.receipt.json'}
        check('host-'+mode,fault)
    def cancellation():
        r=probe(delegation,'hang',cancel=True)
        (artifact/'cancelled.receipt.json').write_text(json.dumps(r,indent=2)+'\n')
        assert r['category']=='cancelled' and 'result' not in r,r
        assert all(r['evidence']['cleanup'].values()),r
        return {'category':r['category']}
    check('host-cancellation',cancellation)


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--delegation');parser.add_argument('--provision-ci',action='store_true');parser.add_argument('--output',required=True)
    args=parser.parse_args();artifact=Path(args.output).resolve();artifact.mkdir(parents=True,exist_ok=True)
    if bool(args.delegation)==bool(args.provision_ci):parser.error('exactly one explicit delegation mode')
    owned=None
    try:
        if args.provision_ci:
            root=Path('/sys/fs/cgroup')
            if not {'cpu','memory','pids'}.issubset((root/'cgroup.subtree_control').read_text().split()):
                raise RuntimeError('CI host lacks delegation; root controllers unchanged')
            owned=root/('nomue-r3-successor-'+str(os.getpid()));owned.mkdir()
            (owned/'supervisor').mkdir();(owned/'calls').mkdir()
            (owned/'cgroup.subtree_control').write_text('+cpu +memory +pids')
            (owned/'calls'/'cgroup.subtree_control').write_text('+cpu +memory +pids')
            delegation=owned
        else:delegation=Path(args.delegation).resolve()
        tests(delegation,artifact)
    finally:
        if owned and owned.exists():
            (owned/'cgroup.kill').write_text('1')
            deadline=time.monotonic()+5
            while 'populated 1' in (owned/'cgroup.events').read_text() and time.monotonic()<deadline:time.sleep(.02)
            for path,_,_ in os.walk(owned,topdown=False):Path(path).rmdir()
        data={'status':'actual cgroup suite; author evidence, not host qualification',
              'node':subprocess.check_output([NODE,'--version'],text=True).strip(),'python':sys.version,
              'passed':sum(r['pass'] for r in rows),'total':len(rows),'rows':rows}
        (artifact/'RESULTS.json').write_text(json.dumps(data,indent=2)+'\n')
        print(json.dumps({'passed':data['passed'],'total':data['total']}))
    if not rows or not all(r['pass'] for r in rows):raise SystemExit(1)

if __name__=='__main__':main()
