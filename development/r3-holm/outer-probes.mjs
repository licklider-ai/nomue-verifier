// Fixed trusted fault probes; never selected by Record content or controlledCall.
import { spawn } from "node:child_process";
const mode = process.argv[2];
if (mode === "cpu") {
  for (let i = 0; i < 4; i++)
    spawn(process.execPath, ["-e", "while(true) {}"], { stdio: "ignore" });
  setInterval(() => {}, 1000);
} else if (mode === "node-memory") {
  const held = [];
  setInterval(() => held.push(Buffer.alloc(8 * 1024 * 1024, 1)), 1);
} else if (mode === "worker-memory") {
  spawn(
    process.env.NOMUE_EXPERIMENT_PYTHON,
    ["-I", "-c", "x=[]\nwhile True: x.append(bytearray(8*1024*1024))"],
    { stdio: "inherit" },
  );
} else if (mode === "pids") {
  const held = [];
  function more() {
    const p = spawn("/bin/sleep", ["60"]);
    p.on("error", () => {});
    held.push(p);
  }
  setInterval(more, 1);
} else if (mode === "descendant") {
  const p = spawn("/bin/sleep", ["60"], { detached: true, stdio: "ignore" });
  p.unref();
} else if (mode === "stdout" || mode === "stderr") {
  const stream = process[mode];
  const b = Buffer.alloc(65536, 120);
  function write() {
    while (stream.write(b)) {}
    stream.once("drain", write);
  }
  write();
} else if (mode === "invalid") {
  process.stdout.write("{");
} else if (mode === "wrong-nonce" || mode === "corrupt-output") {
  process.stdout.write(
    JSON.stringify({
      nonce:
        mode === "wrong-nonce" ? "0".repeat(64) : process.env.NOMUE_CALL_NONCE,
      payload: "{}",
      sha256: "0".repeat(64),
    }),
  );
} else if (mode === "hang" || mode === "valid-then-hang") {
  if (mode === "valid-then-hang")
    process.stdout.write(JSON.stringify({ kind: "provisional-success" }));
  setInterval(() => {}, 1000);
} else if (mode === "environment") {
  process.stdout.write(JSON.stringify({ env: process.env }));
} else process.exit(70);
