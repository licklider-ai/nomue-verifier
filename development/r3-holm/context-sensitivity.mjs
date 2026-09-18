/** Mutate disposable copies only; never change the source worktree. */
import {
  mkdtempSync,
  cpSync,
  symlinkSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const source = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const root = mkdtempSync(join(tmpdir(), "r3-context-sensitivity-"));
const mutations = [
  [
    "accept-mismatching-context",
    "local-checks.ts",
    "jcsCanonicalize(actual) === jcsCanonicalize(value)",
    "true",
  ],
  [
    "drop-propagated-reasons",
    "dependencies.ts",
    "[...new Set(blocking.flatMap((item) => item.reasons))]",
    "[...new Set(blocking.flatMap((item) => item.reasons))].slice(0, 1)",
  ],
  [
    "read-context-after-schema-failure",
    "local-checks.ts",
    "return { reference, evaluations };",
    "{ acquireExpected(); return { reference, evaluations }; }",
  ],
  [
    "drop-context-blocker",
    "dependencies.ts",
    "blocking.map((item) => item.checkId)",
    'blocking.filter((item) => item.stage !== "C").map((item) => item.checkId)',
  ],
];
const results = [];
for (const [name, file, from, to] of mutations) {
  const dest = join(root, name);
  for (const path of [
    "development",
    "reference",
    "package.json",
    "package-lock.json",
  ])
    cpSync(join(source, path), join(dest, path), { recursive: true });
  symlinkSync(
    join(source, "node_modules"),
    join(dest, "node_modules"),
    process.platform === "win32" ? "junction" : "dir",
  );
  const path = join(dest, "development/r3-holm", file);
  const text = readFileSync(path, "utf8");
  if (text.split(from).length !== 2)
    throw Error("mutation anchor not unique: " + name);
  writeFileSync(path, text.replace(from, to));
  const run = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--test",
      "--test-reporter=tap",
      "development/r3-holm/context-matrix.test.ts",
    ],
    { cwd: dest, encoding: "utf8", env: process.env, timeout: 30000 },
  );
  writeFileSync(
    join(dest, "mutation.tap"),
    (run.stdout ?? "") + (run.stderr ?? ""),
  );
  const fail = Number(run.stdout?.match(/^# fail (\d+)$/m)?.[1] ?? 0);
  const tests = Number(run.stdout?.match(/^# tests (\d+)$/m)?.[1] ?? 0);
  results.push({
    name,
    exit: run.status,
    tests,
    fail,
    log: join(dest, "mutation.tap"),
  });
  if (run.status !== 1 || tests !== 114 || fail === 0)
    throw Error(JSON.stringify(results));
}
const summary = {
  status: "inner test sensitivity only, not controlled-host corruption",
  root,
  results,
};
writeFileSync(
  join(root, "RESULTS.json"),
  JSON.stringify(summary, null, 2) + "\n",
);
console.log(JSON.stringify(summary, null, 2));
