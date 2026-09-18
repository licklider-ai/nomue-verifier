// Trusted test-only entry selected by fixed supervisor --probe names. Never a normal call.
if (
  process.version !== "v24.19.0" ||
  process.platform !== "linux" ||
  process.arch !== "x64"
)
  process.exit(78);
try {
  if (
    process.argv.length < 4 ||
    process.argv.length > 5 ||
    !/^[0-9a-f]{64}$/.test(process.env.NOMUE_CALL_NONCE ?? "")
  )
    throw Error("invocation");
  const { register } = await import("tsx/esm/api");
  register();
  const { prepareInnerFiles } = await import("./inner-call.ts");
  const { faultHarness } = await import("./fault-injections.ts");
  const result = await prepareInnerFiles(
    process.argv[3],
    process.argv[4],
    { python: process.env.NOMUE_EXPERIMENT_PYTHON },
    faultHarness(process.argv[2]),
  );
  const { createHash } = await import("node:crypto");
  const payload = JSON.stringify(result);
  process.stdout.write(
    JSON.stringify({
      nonce: process.env.NOMUE_CALL_NONCE,
      payload,
      sha256: createHash("sha256").update(payload).digest("hex"),
    }),
  );
} catch {
  process.exitCode = 70;
}
