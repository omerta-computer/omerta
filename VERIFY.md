# Verification

## Source history

The source arrived without its original Git database. The initial commit series reconstructs the dependencies and features from that snapshot. Its dates are illustrative. The checks below were recorded at the timestamp in the verification block.

## How it was checked

1. The source SDK's unit tests for the files this folder holds (`test/keys.test.ts`, `test/proofs.test.ts`,
   `test/txsize.test.ts`) ran in place in the project: 11 passed, 0 failed.
2. This folder was copied to an empty temporary directory. In `sdk/`, `npm ci` installed only what `package-lock.json`
   pins, then `npm run build`, `npm run typecheck` and `npm test` ran there with nothing from a parent directory:
   11 passed, 0 failed.
3. `npm audit --omit=dev` in the copy reported 0 vulnerabilities.
4. In the copy, `NODE_PATH=sdk/node_modules node bench/zk_proof_bench.cjs 3` built and verified the three proofs of one
   transfer (1,864 proof bytes).
5. `bash -n` passed for every script in `chain/scripts/`.
6. Each README Mermaid block was parsed and rendered to SVG by mermaid 11.4.1 in Node (jsdom, estimated text metrics,
   no browser).
7. The repository holds no program of its own, so there is no IDL to compare.

Limits: the tests are not an audit. The program in `sdk/e2e/` and the scripts in `chain/scripts/` need a running chain
and keypair files; they were not run by this check. Steps 2 and 3 ran on Node v22.23.5 (the `node:22-bookworm-slim`
container). CI selects the current Node.js 22 release.

<!-- verify -->
date: 2026-11-19T13:41:05Z
toolchain: node v22.23.5; npm 10.9.9; tsc 5.9.3; @solana/zk-sdk 0.5.4; mermaid 11.4.1
build: cd sdk && npm ci && npm run build -> exit=0
build: cd sdk && npm run typecheck -> exit=0
test: cd sdk && npm test -> passed=11 failed=0
total: passed=11 failed=0
parity: original_passed=11 github_passed=11
mermaid: rendered=4/4
<!-- /verify -->
