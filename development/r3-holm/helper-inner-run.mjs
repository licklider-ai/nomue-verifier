// Test adapter for disposable source copies; never imported by a runtime entry.
const { register } = await import("tsx/esm/api");
register();
const { prepareInnerFiles } = await import("./inner-call.ts");
const [python, record, expected] = process.argv.slice(2);
if (process.argv.length !== 5) process.exit(64);
process.stdout.write(
  JSON.stringify(await prepareInnerFiles(record, expected, { python })) + "\n",
);
