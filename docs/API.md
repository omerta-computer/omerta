# sealed-transfer-sdk API

TypeScript package in `sdk/`. Does for Token-2022 (v8.0.0) confidential transfers what the
official `spl-token` CLI (5.7.1) does, in Node and in the browser. Built on `@solana/zk-sdk`
0.5.4 (WASM) and hand-assembled Token-2022 / ZK ElGamal proof program instructions.
`@solana/web3.js` is a peer dependency, `>=1.98.4 <2` (1.x API: `Connection`, `Keypair`, `PublicKey`,
`Transaction`); the tests run on 1.99.0.

Names below are fixed; signatures may gain optional fields, never lose or rename one.

Rules the package keeps:
- No key ever leaves the caller: no function sends a secret key, an ElGamal secret, an AES key or
  a recovery phrase over the network or to a log. Only signed transactions go to the RPC.
- Every chain write takes an explicit `Connection` (the caller chooses the cluster; the package
  has no default URL).
- Confirmation is by HTTP polling of `getSignatureStatuses` (no WebSocket), `err` read first.
- Amounts are `bigint` in base units (decimals of the mint, `TEST` = 6). Transfer amounts are
  limited to 48 bits (2^48 - 1 base units), the Token-2022 confidential limit.

```ts
import * as sealed from "sealed-transfer-sdk";       // Node: WASM loads synchronously
await sealed.ready();                                  // browser: call once before anything else
```

## Constants

| name | value |
|---|---|
| `TOKEN_2022_PROGRAM_ID` | `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb` |
| `ZK_ELGAMAL_PROOF_PROGRAM_ID` | `ZkE1Gama1Proof11111111111111111111111111111` |
| `ASSOCIATED_TOKEN_PROGRAM_ID` | `ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL` |
| `MAX_TRANSFER_AMOUNT` | `2n**48n - 1n` |
| `DEFAULT_MAX_PENDING_CREDITS` | `65536n` (the CLI's default `maximum_pending_balance_credit_counter`) |
