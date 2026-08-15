#!/usr/bin/env node
"use strict";
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const root = path.join(__dirname, "..");
const tsxCli = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
const cli = path.join(root, "src", "nomue-cli.ts");
const result = spawnSync(process.execPath, [tsxCli, cli, ...process.argv.slice(2)], {
  stdio: "inherit",
  cwd: root,
});
process.exit(result.status === null ? 1 : result.status);
