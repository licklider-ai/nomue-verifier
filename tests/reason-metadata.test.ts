import * as fs from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parse as parseYaml } from "yaml";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const hero = JSON.parse(fs.readFileSync(join(root, "display/reason-codes-hero.json"), "utf8"));
const expectedDescription = "One or more declared result quantities differ from the recomputed values beyond the tolerance policy of the applicable check version.";
if (hero["NRS-DECLARED-RESULT-MISMATCH"].description !== expectedDescription) {
  console.error("reason metadata drift");
  process.exit(1);
}
console.log("reason-metadata: OK");
