#!/usr/bin/env node
"use strict";
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const root = path.join(__dirname, "..");
const cli = path.join(root, "reference", "verifier", "src", "cli.ts");
const args = process.argv.slice(2);

if (args.length < 2) {
  process.stderr.write(
    "usage: nomue <verify|canonicalize|digest> <record.json> [--format json|json-compact|human]\n",
  );
  process.exit(5);
}

const result = spawnSync(process.execPath, ["--import", "tsx", cli, ...args], {
  stdio: "inherit",
  cwd: root,
});

if (result.error) {
  process.stderr.write(`nomue: failed to start verifier: ${result.error.message}\n`);
  process.exit(5);
}
if (result.signal) {
  process.stderr.write(`nomue: verifier terminated by signal ${result.signal}\n`);
  process.exit(5);
}
process.exit(result.status === null ? 5 : result.status);
