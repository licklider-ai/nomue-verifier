// Development reproduction adapter, not the released CLI. Absolute caller paths only.
if (
  process.version !== "v24.19.0" ||
  process.platform !== "linux" ||
  process.arch !== "x64"
)
  process.exit(78);
const { register } = await import("tsx/esm/api");
register();
const { controlledCall } = await import("./controlled-call.ts");
const { writeFileSync } = await import("node:fs");
const [delegation, python, record, expected, evidence] = process.argv.slice(2);
if (process.argv.length !== 7) process.exit(64);
const controller = new AbortController();
for (const s of ["SIGTERM", "SIGINT"]) process.on(s, () => controller.abort());
const result = await controlledCall(
  record,
  expected === "-" ? undefined : expected,
  {
    delegation,
    python,
    signal: controller.signal,
    onReceipt: (r) =>
      writeFileSync(evidence, JSON.stringify(r, null, 2) + "\n"),
  },
);
process.stdout.write(JSON.stringify(result) + "\n");
