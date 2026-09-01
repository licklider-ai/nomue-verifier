import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const npmCli = process.env.npm_execpath;
const temporaryRoot = mkdtempSync(join(tmpdir(), "nomue-verifier-package-smoke-"));
const packDirectory = join(temporaryRoot, "pack");
const installDirectory = join(temporaryRoot, "install");
const globalDirectory = join(temporaryRoot, "global");
const execDirectory = join(temporaryRoot, "exec");
const inputDirectory = join(temporaryRoot, "input records");
const expectedPackageName = "@licklider/nomue-verifier";
const expectedBundle = "urn:nomue:bundle:itgc-guarantee:0.2.1-draft.1";
const expectedRuntimeDependencies = {
  "@stdlib/stats-base-dists-t-cdf": "0.2.3",
  "@stdlib/stats-base-dists-t-quantile": "0.2.3",
  ajv: "8.20.0",
  tsx: "4.23.12",
  yaml: "2.9.0",
};
const childEnvironment = { ...process.env };

// `npm publish --dry-run` exports its dry-run setting to lifecycle scripts. This
// smoke test must still create and install a real local tarball, so the nested npm
// commands do not inherit the parent publish simulation flag.
delete childEnvironment.npm_config_dry_run;
delete childEnvironment.NPM_CONFIG_DRY_RUN;

mkdirSync(packDirectory, { recursive: true });
mkdirSync(installDirectory, { recursive: true });
mkdirSync(globalDirectory, { recursive: true });
mkdirSync(execDirectory, { recursive: true });
mkdirSync(inputDirectory, { recursive: true });

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

function runCli(command, args, options = {}) {
  if (process.platform === "win32") {
    const commandParts = [command, ...args];
    if (commandParts.some((part) => part.includes('"'))) {
      fail("Windows package-smoke command contains an unsupported quote character");
    }
    const commandLine = commandParts.map((part) => `"${part}"`).join(" ");
    return run(commandLine, [], { shell: true, ...options });
  }
  return run(command, args, options);
}

function parseJson(label, text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    fail(`${label}: expected JSON output (${error.message})`, { stdout: text });
  }
}

function assertValid(label, result, { allowNpmStderr = false } = {}) {
  if (result.status !== 0) fail(`${label}: expected exit 0, got ${result.status}`, result);
  if (!allowNpmStderr && result.stderr !== "") {
    fail(`${label}: emitted stderr in JSON mode`, result);
  }
  const report = parseJson(label, result.stdout);
  if (report.interpretation_bundle_id !== expectedBundle) {
    fail(`${label}: did not use the exact Release 1 bundle`, result);
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
  const packedBin = packOutput?.[0]?.files?.find((file) => file.path === "bin/nomue.cjs");
  if (process.platform !== "win32" && packedBin?.mode !== 0o755) {
    fail(`packed nomue launcher mode mismatch: expected 0755, got ${String(packedBin?.mode)}`);
  }

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
  for (const [name, expectedVersion] of Object.entries(expectedRuntimeDependencies)) {
    const actualVersion = installedPackage.dependencies?.[name];
    if (actualVersion !== expectedVersion) {
      fail(
        `runtime dependency is not exactly pinned: ${name} expected ${expectedVersion}, got ${String(actualVersion)}`,
      );
    }
  }

  const shimName = process.platform === "win32" ? "nomue.cmd" : "nomue";
  const shimPath = join(installDirectory, "node_modules", ".bin", shimName);
  if (!existsSync(shimPath)) fail(`nomue executable shim is missing: ${shimPath}`);

  const validRecord = join(inputDirectory, "valid record.json");
  const invalidRecord = join(inputDirectory, "invalid result mismatch.json");
  copyFileSync(join(root, "records", "valid.json"), validRecord);
  copyFileSync(join(root, "records", "invalid-result-mismatch.json"), invalidRecord);

  const usage = runCli(shimPath, [], { cwd: installDirectory });
  if (usage.status !== 5) fail(`packed usage error: expected exit 5, got ${usage.status}`, usage);
  if (usage.stdout !== "") fail("packed usage error emitted stdout", usage);
  if (!usage.stderr.startsWith("usage: nomue ")) {
    fail("packed usage error did not name the public nomue command", usage);
  }

  const valid = runCli(
    shimPath,
    ["verify", validRecord, "--format", "json-compact"],
    { cwd: installDirectory },
  );
  assertValid("packed local-shim valid Record", valid);

  const invalid = runCli(
    shimPath,
    ["verify", invalidRecord, "--format", "json-compact"],
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

  const globalInstall = runNpm(
    [
      "install",
      "--global",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--prefix",
      globalDirectory,
      tarball,
    ],
    { cwd: globalDirectory },
  );
  if (globalInstall.status !== 0) fail("global tarball installation failed", globalInstall);

  const globalShim =
    process.platform === "win32"
      ? join(globalDirectory, "nomue.cmd")
      : join(globalDirectory, "bin", "nomue");
  if (!existsSync(globalShim)) fail(`global nomue executable shim is missing: ${globalShim}`);
  assertValid(
    "packed global-shim valid Record",
    runCli(globalShim, ["verify", validRecord, "--format", "json-compact"], {
      cwd: globalDirectory,
    }),
  );

  assertValid(
    "packed npm-exec valid Record",
    runNpm(
      [
        "exec",
        "--yes",
        `--package=${tarball}`,
        "--",
        "nomue",
        "verify",
        validRecord,
        "--format",
        "json-compact",
      ],
      { cwd: execDirectory },
    ),
    { allowNpmStderr: true },
  );

  console.log("package-smoke: OK");
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
