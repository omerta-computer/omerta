# Contributing

Thank you for looking at the code. Issues and pull requests are welcome for the SDK, the scripts and the documents.

## Toolchain

| Tool | Version | Used for |
|---|---|---|
| Node.js | 22.x (`engines.node` >= 20) | SDK build, tests, proof bench |
| npm | 10 or later | `npm ci` from `sdk/package-lock.json` |
| TypeScript | 5.9.3 (from the lockfile) | `tsc` |
| `@solana/zk-sdk` | 0.5.4 (from the lockfile) | proofs, the same WASM a browser loads |
| Agave | `v4.5.0-alpha.4` (commit `ccddd3dffc7edb1d6ed8182ac8e9cbd73b24b159`) | building the fork |
| `spl-token-cli` | 5.7.1 | the scripts in `chain/scripts/` |
| `solana` CLI | 3.0.0 or later | the scripts in `chain/scripts/` |

## Build and test

These are the commands CI runs (`.github/workflows/ci.yml`):

```
cd sdk
npm ci
npm run build
npm run typecheck
npm test
```

`npm test` runs the unit tests in `sdk/test/`. They need no network. The programs in `sdk/e2e/` need a running
chain (`--rpc <url>`) and keypair files; CI does not run them.

Shell scripts are checked with:

```
for f in chain/scripts/*.sh; do bash -n "$f"; done
```

## Building the fork

```
git clone https://github.com/anza-xyz/agave
cd agave
git checkout ccddd3dffc7edb1d6ed8182ac8e9cbd73b24b159
git apply ../chain/patches/ledger-floor.patch
cargo build --release --bin agave-validator --bin solana-genesis --bin solana-keygen --bin solana-faucet --bin solana
```

## Pull requests

- One change per pull request, with a test when the SDK changes.
- No comments in code: names carry the meaning, and documents carry the reasons.
- Keep public interfaces stable: function names in `docs/API.md` are fixed; new options are optional fields.
- Never commit a keypair file, a `.env` file or an RPC URL with a key.
