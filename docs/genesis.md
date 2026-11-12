# Genesis and network

The OMERTA chain runs a fork of Agave `v4.5.0-alpha.4` (commit `ccddd3dffc7edb1d6ed8182ac8e9cbd73b24b159`) with one
patch, `chain/patches/ledger-floor.patch`: `LEGACY_DEFAULT_MIN_MAX_LEDGER_SHREDS` goes from 50,000,000 to 100,000
shreds so a small network can keep a bounded ledger. Nothing in the transaction path changes.

## Why this base

- The proof verifier in Agave is the crate `solana-zk-sdk`: `v3.0.9` uses 4.0.0, `v4.2.0` uses 5.0.1,
  `v4.5.0-alpha.4` uses 8.1.0.
- `solana-zk-sdk` 5.0.0 changed the proof transcript (a unique domain separator for the ZK ElGamal Proof program and
  the proof context hashed into the transcript). Proofs made by releases before 5 fail on engines with 5 or later, and
  the reverse.
- `spl-token-cli` 5.3.0 is built on `solana-zk-sdk` 2.2.1 and is refused by this chain
  (`SigmaProof(PubkeyValidity, AlgebraicRelation)`); 5.7.1 is built on 7.0.1 and works. `@solana/zk-sdk` 0.5.4 (WASM)
  ships with 8.1.0 and works.
- Transaction format v1 (4,096 bytes, feature `txv1aq4pp281K9um3tnPgkfX8UqtFT6wcVW3hNezGLL`) is active from genesis.

## Programs in genesis

Every program, its loader, its source and its sha256 are in `chain/genesis/programs.toml`. `chain/scripts/genesis.sh`
is the `solana-genesis` invocation that loads them:

```
bash chain/scripts/genesis.sh <agave-bin-dir> <program-dir> <keys-dir> <ledger-dir>
```

`solana-genesis` adds no SPL program by itself, so Token-2022, Associated Token Account and SPL Record are passed with
`--bpf-program` under `BPFLoader2111111111111111111111111111111111` (not upgradeable). The core programs (stake 5.1.0,
address lookup table 3.0.0, config 3.0.0, feature gate 0.0.1) come from the engine's own program binaries and are
loaded with `--upgradeable-program ... none`, so they have no upgrade authority. The legacy SPL Token program
(`TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA`) is not in genesis: associated token accounts and the stock CLI work
without it.

SPL Record is needed because `spl-token-cli` 5.7.1 uploads the range proof through it; without it a CLI transfer fails
with `ProgramAccountNotFound`. Its repository ships no program binary, so the file was dumped from Solana mainnet
(`solana program dump recr1L3PCGKLbckBqMNcJhuuyU1zgo8nBhfLVsJNwr5 spl_record.so`) and its sha256 is recorded.

## Base probe

`chain/scripts/base-probe.sh` runs the whole flow with the stock CLI against one validator started from this genesis:
a confidential mint, two sealed accounts, deposit, apply, a sealed transfer of 123.456789, an exact withdrawal, a
withdrawal of one more that must fail, and a public transfer into a sealed account that must fail with `0x31`.

The probe and `setup-main-asset.sh` fund their keys with `requestAirdrop`, so the validator needs a faucet: run
`solana-faucet --keypair <keys-dir>/faucet.json` (the key `genesis.sh` creates and funds in genesis) and start the
validator with `--rpc-faucet-address <faucet host:port>`.

```
RPC_URL=<validator rpc url> bash chain/scripts/base-probe.sh <work-dir>
```

On the chosen base it printed `sealed_transfer_secs=2.73 fails=0 verdict=PASS`.

## Main asset

`chain/scripts/setup-main-asset.sh` is the recorded setup run in the first slots: the `TEST` mint (6 decimals,
confidential transfer on, auto-approve, no auditor), the reserve account (configured, whole supply deposited and
applied in parts because one deposit is limited to 2^48-1 base units, public credits disabled), then the mint authority
and the confidential-transfer mint authority removed. Anyone can read the result:

```
spl-token --url $RPC display 5n31rh6t9mgFYZRhoSb8k2xUcdCgmDL5BFZbjvkPLHif
```
