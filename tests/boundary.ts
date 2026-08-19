import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const manifest = JSON.parse(
  fs.readFileSync(path.join(root, "EXTRACTION-MANIFEST.json"), "utf8"),
) as { files: Array<{ destination: string }> };
const historicalExtractionFiles = new Set(manifest.files.map((f) => f.destination));

// EXTRACTION-MANIFEST.json is immutable historical evidence for the August demo
// extraction. Release 1 operational/rebuild/offline-evidence files added later are
// authorized here explicitly instead of rewriting that historical manifest.
const postExtractionOperationalFiles = new Set([
  "REBUILD.md",
  "scripts/rebuild-evidence.mjs",
  "OFFLINE-VERIFICATION.md",
  "offline/Dockerfile",
  "offline/network-probe.mjs",
]);
const currentAllowlist = new Set([
  ...historicalExtractionFiles,
  ...postExtractionOperationalFiles,
]);

function walk(dir: string, base = ""): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const e of entries) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.name === "node_modules" || e.name === ".git") continue;
    if (e.name.endsWith(".tgz")) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full, rel));
    else out.push(rel.replace(/\\/g, "/"));
  }
  return out;
}

const files = walk(root);
const missing = files.filter((f) => !currentAllowlist.has(f));
const historicalExtra = [...historicalExtractionFiles].filter((f) => !files.includes(f));
const operationalExtra = [...postExtractionOperationalFiles].filter((f) => !files.includes(f));

if (missing.length > 0) {
  console.error("T5 boundary: files outside historical+Release1 allowlist:", missing);
  process.exit(1);
}
if (historicalExtra.length > 0) {
  console.error("T5 boundary: historical extraction entries missing on disk:", historicalExtra);
  process.exit(1);
}
if (operationalExtra.length > 0) {
  console.error("T5 boundary: Release 1 operational entries missing on disk:", operationalExtra);
  process.exit(1);
}

console.log("boundary: OK");
