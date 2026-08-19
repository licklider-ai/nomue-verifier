FROM node:22-bookworm-slim

WORKDIR /opt/nomue-verifier

COPY package.json package-lock.json ./
RUN npm ci

COPY bin/ ./bin/
COPY reference/ ./reference/
COPY schemas/ ./schemas/
COPY registries/ ./registries/
COPY records/ ./records/
COPY NON-CLAIMS.md SOURCE-PIN.json SECURITY.md ./
COPY offline/network-probe.mjs ./offline/network-probe.mjs

RUN npm test --if-present

USER node
