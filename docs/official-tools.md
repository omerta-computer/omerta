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

## 2. A public transfer into a sealed account is refused

The sender first moves some of his own sealed balance to his public balance (this amount is public), then tries a
public transfer. Token-2022 answers `custom program error: 0x31` (`NonConfidentialTransfersDisabled`).

```
spl-token --url $RPC withdraw-confidential-tokens --fee-payer <key.json> --owner <key.json> 5n31rh6t9mgFYZRhoSb8k2xUcdCgmDL5BFZbjvkPLHif 1
spl-token --url $RPC transfer --fee-payer <key.json> --owner <key.json> 5n31rh6t9mgFYZRhoSb8k2xUcdCgmDL5BFZbjvkPLHif 1 <recipient-owner>
```

## 3. A sealed transfer goes through

```
spl-token --url $RPC transfer --fee-payer <key.json> --owner <key.json> 5n31rh6t9mgFYZRhoSb8k2xUcdCgmDL5BFZbjvkPLHif 1 <recipient-owner> --confidential
spl-token --url $RPC apply-pending-balance --owner <key.json> 5n31rh6t9mgFYZRhoSb8k2xUcdCgmDL5BFZbjvkPLHif
spl-token --url $RPC balance --owner <key.json> 5n31rh6t9mgFYZRhoSb8k2xUcdCgmDL5BFZbjvkPLHif
solana --url $RPC confirm -v <the "confidential transfer" signature it prints>
```

The `balance` line prints the public part, which is 0.
