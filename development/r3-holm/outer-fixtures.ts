/** Independently specified regression inputs; historical arithmetic targets retained. */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { jcsCanonicalize } from "../../reference/verifier/src/jcs.ts";
const read = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
export function baseRecord(): any {
  const r = JSON.parse(read("example-record.jcs"));
  for (const k of ["$schema", "interpretation_bundle_id", "profile_id"])
    r[k] = r[k].replace("candidate.4", "candidate.5");
  r.payload.contract_id = r.payload.contract_id.replace(
    "candidate.4",
    "candidate.5",
  );
  return r;
}
export const context = () => read("example-expected.json");
export function seal(r: any): Buffer {
  const { integrity, ...rest } = r;
  if (integrity)
    integrity.content_digest =
      "sha256:" +
      createHash("sha256")
        .update("nomue/record-content/v1\n")
        .update(jcsCanonicalize(rest))
        .digest("hex");
  return Buffer.from(jcsCanonicalize(r));
}
export const fixedReply = () => {
  const a = JSON.parse(read("example-record.jcs")).payload.result.adjusted;
  return Buffer.from(
    JSON.stringify({
      adjusted_hex: a.map((r: any) => r.adjusted_hex),
      display_hex: a.map((r: any) => r.display_hex),
    }),
  );
};
