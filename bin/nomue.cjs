#!/usr/bin/env node
"use strict";
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const root = path.join(__dirname, "..");
const cli = path.join(root, "reference", "verifier", "src", "cli.ts");
const result = spawnSync(process.execPath, ["--import", "tsx", cli, ...process.argv.slice(2)], {
  stdio: "inherit",
  cwd: root,
});
process.exit(result.status === null ? 1 : result.status);
