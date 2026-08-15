import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const manifest = JSON.parse(
  fs.readFileSync(path.join(root, "EXTRACTION-MANIFEST.json"), "utf8"),
) as { files: Array<{ destination: string }> };
const allowlist = new Set(manifest.files.map((f) => f.destination));

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
const missing = files.filter((f) => !allowlist.has(f));
const extra = [...allowlist].filter((f) => !files.includes(f));

if (missing.length > 0) {
  console.error("T5 boundary: files not in manifest:", missing);
  process.exit(1);
}
if (extra.length > 0) {
  console.error("T5 boundary: manifest entries missing on disk:", extra);
  process.exit(1);
}

console.log("boundary: OK");
