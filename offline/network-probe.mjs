import { networkInterfaces, platform, release, arch } from "node:os";

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

const nonLoopback = nonLoopbackInterfaces();
const result = {
  schema: "nomue-offline-network-probe",
  schema_version: "1.0.0",
  platform: platform(),
  os_release: release(),
  arch: arch(),
  node: process.version,
  non_loopback_interfaces: nonLoopback,
  isolation_observed: nonLoopback.length === 0,
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (!result.isolation_observed) process.exitCode = 1;
