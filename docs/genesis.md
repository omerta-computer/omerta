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
