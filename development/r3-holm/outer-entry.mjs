// Native guard before loading the TS loader or schemas. Private child transport only.
if (
  process.version !== "v24.19.0" ||
  process.platform !== "linux" ||
  process.arch !== "x64"
)
  process.exit(78);
try {
  if (
    process.argv.length < 3 ||
    process.argv.length > 4 ||
    !/^[0-9a-f]{64}$/.test(process.env.NOMUE_CALL_NONCE ?? "")
  )
    throw Error("invocation");
  const { register } = await import("tsx/esm/api");
  register();
  const { prepareInnerFiles } = await import("./inner-call.ts");
  const { createBudget } = await import("./execution.ts");
  const budget = createBudget();
  const render = async (result) => {
    const { createHash } = await import("node:crypto");
    const payload = JSON.stringify(result);
    return JSON.stringify({
      nonce: process.env.NOMUE_CALL_NONCE,
      payload,
      sha256: createHash("sha256").update(payload).digest("hex"),
    });
  };
  try {
    const result = await prepareInnerFiles(
      process.argv[2],
      process.argv[3],
      { python: process.env.NOMUE_EXPERIMENT_PYTHON },
      { budget },
    );
    // Never reopen or reserialize the Record. This is still only a proposal.
    const encoded = await render(result);
    if (Buffer.byteLength(encoded) > 4456448) throw Error("transport limit");
    // A late failure cannot emit even a previously complete all-pass proposal.
    budget.checkpoint();
    process.stdout.write(encoded);
  } catch (e) {
    const { InvocationError } = await import("./execution.ts");
    if (!(e instanceof InvocationError)) throw e;
    const { refusal } = await import("./output.ts");
    process.stdout.write(await render({ output: refusal(e.kind) }));
  }
} catch {
  process.exitCode = 70;
}
