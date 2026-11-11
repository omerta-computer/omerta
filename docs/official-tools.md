# Check it with the official tools

Everything here uses only the official `solana` CLI and `spl-token-cli` 5.7.1 or later against the public RPC URL listed
on [https://omerta.computer](https://omerta.computer) (`$RPC` below). The `TEST` mint is
`5n31rh6t9mgFYZRhoSb8k2xUcdCgmDL5BFZbjvkPLHif`; the Token-2022 program is `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb`.
Older CLI releases build proofs in a format this engine rejects (see [genesis.md](genesis.md)).

## 1. Read any account

Public balance 0; the rest exists only as ciphertext in the confidential transfer extension.

```
spl-token --url $RPC display <token-account>
solana --url $RPC account <token-account> --output json
```
