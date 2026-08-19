import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { arch, platform, release } from "node:os";
import { resolve } from "node:path";

function sha256Text(text) {
  return `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`;
}

function sha256File(file) {
  return `sha256:${createHash("sha256").update(readFileSync(file)).digest("hex")}`;
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function npm(args) {
  const npmCli = process.env.npm_execpath;
  if (!npmCli) {
    throw new Error("npm_execpath is not available; run this generator through `npm run rebuild:evidence`");
  }
  return execFileSync(process.execPath, [npmCli, ...args], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  }).trim();
}

function stablePackageEntries(lock) {
  return Object.entries(lock.packages ?? {})
    .filter(([key]) => key !== "")
    .map(([path, meta]) => ({
      path,
      version: meta.version ?? null,
      resolved: meta.resolved ?? null,
      integrity: meta.integrity ?? null,
      license: meta.license ?? null,
      dev: meta.dev === true,
      optional: meta.optional === true,
      os: meta.os ?? null,
      cpu: meta.cpu ?? null,
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

const outDir = resolve(process.argv[2] ?? "rebuild-evidence");
mkdirSync(outDir, { recursive: true });

const packageJsonText = readFileSync("package.json", "utf8");
const packageLockText = readFileSync("package-lock.json", "utf8");
const packageJson = JSON.parse(packageJsonText);
const packageLock = JSON.parse(packageLockText);
const sourcePin = JSON.parse(readFileSync("SOURCE-PIN.json", "utf8"));

const rootLock = packageLock.packages?.[""] ?? {};
if (packageLock.name !== packageJson.name || rootLock.name !== packageJson.name) {
  throw new Error(
    `package-lock name drift: package=${packageJson.name}, lock=${packageLock.name}, root=${rootLock.name}`,
  );
}
if (packageLock.version !== packageJson.version || rootLock.version !== packageJson.version) {
  throw new Error(
    `package-lock version drift: package=${packageJson.version}, lock=${packageLock.version}, root=${rootLock.version}`,
  );
}

const sourceCommit = git(["rev-parse", "HEAD"]);
const tree = git(["rev-parse", "HEAD^{tree}"]);
const status = git(["status", "--porcelain"]);
if (status !== "") throw new Error("rebuild evidence must be generated from a clean working tree");

const packDryRun = JSON.parse(npm(["pack", "--dry-run", "--json"]));
if (!Array.isArray(packDryRun) || packDryRun.length !== 1) {
  throw new Error("npm pack --dry-run --json returned an unexpected shape");
}
const pack = packDryRun[0];
const packedFiles = (pack.files ?? [])
  .map((file) => ({ path: file.path, size: file.size }))
  .sort((a, b) => a.path.localeCompare(b.path));

const environment = {
  schema: "nomue-verifier-rebuild-environment",
  schema_version: "1.0.0",
  source_commit: sourceCommit,
  source_tree: tree,
  protocol_source_commit: sourcePin.protocol_source_commit,
  package_name: packageJson.name,
  package_version: packageJson.version,
  platform: platform(),
  arch: arch(),
  os_release: release(),
  node: process.version,
  npm: npm(["--version"]),
  package_json_sha256: sha256File("package.json"),
  package_lock_sha256: sha256File("package-lock.json"),
  source_pin_sha256: sha256File("SOURCE-PIN.json"),
};

const dependencies = {
  schema: "nomue-verifier-dependency-provenance",
  schema_version: "1.0.0",
  source_commit: sourceCommit,
  lockfile_version: packageLock.lockfileVersion,
  package_lock_sha256: sha256Text(packageLockText),
  packages: stablePackageEntries(packageLock),
};

const packageManifest = {
  schema: "nomue-verifier-package-manifest",
  schema_version: "1.0.0",
  source_commit: sourceCommit,
  package_name: pack.name,
  package_version: pack.version,
  filename: pack.filename,
  entry_count: packedFiles.length,
  files: packedFiles,
};

writeFileSync(resolve(outDir, "environment.json"), `${JSON.stringify(environment, null, 2)}\n`);
writeFileSync(resolve(outDir, "dependency-provenance.json"), `${JSON.stringify(dependencies, null, 2)}\n`);
writeFileSync(resolve(outDir, "package-manifest.json"), `${JSON.stringify(packageManifest, null, 2)}\n`);

console.log(
  JSON.stringify(
    {
      ok: true,
      source_commit: sourceCommit,
      protocol_source_commit: sourcePin.protocol_source_commit,
      package: `${packageJson.name}@${packageJson.version}`,
      dependency_entries: dependencies.packages.length,
      packed_files: packedFiles.length,
      output_dir: outDir,
    },
    null,
    2,
  ),
);
