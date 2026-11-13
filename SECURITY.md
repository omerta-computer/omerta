# Security policy

## Supported versions

| Component | Version | Supported |
|---|---|---|
| `sdk/` (`sealed-transfer-sdk`) | 0.1.x | yes |
| Fork patch `chain/patches/ledger-floor.patch` | on Agave `v4.5.0-alpha.4` | yes |
| Genesis configuration `chain/genesis/programs.toml` | current | yes |

## Reporting a vulnerability

Report it privately through GitHub Security Advisories on this repository ("Report a vulnerability" under the
Security tab). Do not open a public issue for a vulnerability. Include the component, the version, the steps to
reproduce and what an attacker gains. We answer within 72 hours and agree on a disclosure date with you.

If the "Report a vulnerability" button is not shown, open a public issue titled "Security contact request" with no
details of the problem. We then open a private advisory on this repository and invite you to it.

## Scope

In scope:
- `sdk/`: key derivation compatible with the `spl-token` CLI, proof construction, transaction assembly, decryption.
  Anything that leaks a secret key, an ElGamal secret, an AES key or a recovery phrase, or lets a
  third party read a sealed amount or balance, is critical.
- `chain/`: the fork patch, the genesis program list and the scripts in `chain/scripts/`.
- The public RPC of the OMERTA chain at `https://omerta.computer` (the RPC URL it lists): an answer that exposes a
  node address or an admin method.

Out of scope:
- Token-2022, the ZK ElGamal Proof program and Agave themselves: report those to their maintainers
  ([solana-program/token-2022](https://github.com/solana-program/token-2022),
  [solana-program/zk-elgamal-proof](https://github.com/solana-program/zk-elgamal-proof),
  [anza-xyz/agave](https://github.com/anza-xyz/agave)). Tell us too if it affects this chain.
- What the design keeps visible on purpose: both accounts and owners of a transfer, the mint, slot and time, the fee
  payer, that a transfer was sealed, the receiver's incoming-transfer counter, and amounts moved between public and
  sealed balance.
- Rate limits of the public RPC and the faucet, and load on them.
