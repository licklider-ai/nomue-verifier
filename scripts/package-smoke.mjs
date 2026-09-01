import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const npmCli = process.env.npm_execpath;
const temporaryRoot = mkdtempSync(join(tmpdir(), "nomue-verifier-package-smoke-"));
const packDirectory = join(temporaryRoot, "pack");
const installDirectory = join(temporaryRoot, "install");
const expectedPackageName = "@licklider/nomue-verifier";
const expectedBundle = "urn:nomue:bundle:itgc-guarantee:0.2.1-draft.1";
const childEnvironment = { ...process.env };

// `npm publish --dry-run` exports its dry-run setting to lifecycle scripts. This
// smoke test must still create and install a real local tarball, so the nested npm
// commands do not inherit the parent publish simulation flag.
delete childEnvironment.npm_config_dry_run;
delete childEnvironment.NPM_CONFIG_DRY_RUN;

mkdirSync(packDirectory, { recursive: true });
mkdirSync(installDirectory, { recursive: true });

function fail(message, result) {
  console.error(message);
  if (result?.error) console.error(result.error);
  if (result?.stdout) console.error(result.stdout);
  if (result?.stderr) console.error(result.stderr);
  process.exitCode = 1;
  throw new Error(message);
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    env: childEnvironment,
    ...options,
  });
}

function runNpm(args, options = {}) {
  if (!npmCli) fail("npm_execpath is unavailable; run this check through npm");
  return run(process.execPath, [npmCli, ...args], options);
}

function parseJson(label, text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    fail(`${label}: expected JSON output (${error.message})`, { stdout: text });
  }
}

try {
  const packResult = runNpm([
    "pack",
    "--json",
    "--pack-destination",
    packDirectory,
  ]);
  if (packResult.status !== 0) fail("npm pack failed", packResult);

  const packOutput = parseJson("npm pack", packResult.stdout);
  const filename = packOutput?.[0]?.filename;
  if (typeof filename !== "string" || filename.length === 0) {
    fail("npm pack did not return a tarball filename", packResult);
  }
  const tarball = join(packDirectory, filename);
  if (!existsSync(tarball)) fail(`packed tarball is missing: ${tarball}`);

  const installResult = runNpm(
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--prefix",
      installDirectory,
      tarball,
    ],
    { cwd: installDirectory },
  );
  if (installResult.status !== 0) fail("tarball installation failed", installResult);

  const installedRoot = join(
    installDirectory,
    "node_modules",
    "@licklider",
    "nomue-verifier",
  );
  const installedPackage = parseJson(
    "installed package.json",
    readFileSync(join(installedRoot, "package.json"), "utf8"),
  );
  if (installedPackage.name !== expectedPackageName) {
    fail(
      `installed package name mismatch: expected ${expectedPackageName}, got ${String(installedPackage.name)}`,
    );
  }

  const shimName = process.platform === "win32" ? "nomue.cmd" : "nomue";
  const shimPath = join(installDirectory, "node_modules", ".bin", shimName);
  if (!existsSync(shimPath)) fail(`nomue executable shim is missing: ${shimPath}`);

  const launcher = join(installedRoot, "bin", "nomue.cjs");
  const executable = process.platform === "win32" ? process.execPath : shimPath;
  const launcherArgs = process.platform === "win32" ? [launcher] : [];
  const validRecord = join(root, "records", "valid.json");
  const invalidRecord = join(root, "records", "invalid-result-mismatch.json");

  const valid = run(
    executable,
    [...launcherArgs, "verify", validRecord, "--format", "json-compact"],
    { cwd: installDirectory },
  );
  if (valid.status !== 0) fail(`packed valid Record: expected exit 0, got ${valid.status}`, valid);
  if (valid.stderr !== "") fail("packed valid Record emitted stderr in JSON mode", valid);
  const validReport = parseJson("packed valid Record", valid.stdout);
  if (validReport.interpretation_bundle_id !== expectedBundle) {
    fail("packed valid Record did not use the exact Release 1 bundle", valid);
  }

  const invalid = run(
    executable,
    [...launcherArgs, "verify", invalidRecord, "--format", "json-compact"],
    { cwd: installDirectory },
  );
  if (invalid.status !== 2) {
    fail(`packed mismatched Record: expected exit 2, got ${invalid.status}`, invalid);
  }
  if (invalid.stderr !== "") fail("packed mismatched Record emitted stderr in JSON mode", invalid);
  const invalidReport = parseJson("packed mismatched Record", invalid.stdout);
  if (!JSON.stringify(invalidReport).includes("NRS-DECLARED-RESULT-MISMATCH")) {
    fail("packed mismatched Record omitted NRS-DECLARED-RESULT-MISMATCH", invalid);
  }

  console.log("package-smoke: OK");
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
