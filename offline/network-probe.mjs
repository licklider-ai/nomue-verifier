import { networkInterfaces, platform, release, arch } from "node:os";
import net from "node:net";

function nonLoopbackInterfaces() {
  const interfaces = networkInterfaces();
  const out = [];
  for (const [name, addresses] of Object.entries(interfaces)) {
    for (const address of addresses ?? []) {
      if (!address.internal) {
        out.push({ name, address: address.address, family: address.family });
      }
    }
  }
  return out;
}

function outboundAttempt() {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "1.1.1.1", port: 443 });
    const timer = setTimeout(() => {
      socket.destroy();
      resolve({ connected: false, result: "timeout" });
    }, 1500);
    socket.once("connect", () => {
      clearTimeout(timer);
      socket.destroy();
      resolve({ connected: true, result: "connected" });
    });
    socket.once("error", (error) => {
      clearTimeout(timer);
      resolve({ connected: false, result: "error", code: error.code ?? null, message: error.message });
    });
  });
}

const nonLoopback = nonLoopbackInterfaces();
const outbound = await outboundAttempt();
const result = {
  schema: "nomue-offline-network-probe",
  schema_version: "1.0.0",
  platform: platform(),
  os_release: release(),
  arch: arch(),
  node: process.version,
  non_loopback_interfaces: nonLoopback,
  outbound_tcp_probe: outbound,
  isolation_observed: nonLoopback.length === 0 && outbound.connected === false,
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (!result.isolation_observed) process.exitCode = 1;
