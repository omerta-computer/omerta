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

## Keys

The ElGamal keypair and the AES key are derived the standard way of solana-zk-sdk >= 7
(`derive_confidential_keys`), which is what `spl-token` CLI >= 5.7.0 and the Token-2022 JS
client use, so a keypair file used in the browser opens the same balance in CLI 5.7.1
(`spl-token balance --confidential`, `apply-pending-balance`). Checked against the canonical
cross-SDK vectors of solana-zk-sdk 8.1.0.

- The owner signs the constant message `solana-conf-bal/v1` once (ed25519, deterministic).
- `prk = HKDF-SHA512-Extract(salt "solana-conf-bal/v1", ikm = signature)`;
  AES key = `Expand(prk, "ae", 16)`; ElGamal secret = `wide-reduce(Expand(prk, "elgamal", 64))`.
- Keys are per wallet: one ElGamal keypair and one AES key for all of the owner's token accounts.
- CLI <= 5.6 used a per-account SHA3 KDF; `deriveSealKeysLegacy(owner, tokenAccount)` opens
  such accounts. New accounts never use it.

```ts
type SealKeys = { elgamal: ElGamalKeypair; ae: AeKey; elgamalPubkey: Uint8Array /*32*/ };

deriveSealKeys(owner: Keypair): SealKeys
deriveSealKeysFromSigner(signMessage: (msg: Uint8Array) => Promise<Uint8Array>): Promise<SealKeys>
sealKeysFromSignature(sig: Uint8Array): SealKeys          // sig over STANDARD_DERIVATION_MESSAGE
deriveSealKeysLegacy(owner: Keypair, tokenAccount: PublicKey): SealKeys
// STANDARD_DERIVATION_MESSAGE = bytes of "solana-conf-bal/v1". A signature over it equals the
// decryption keys: never sign it for, or send it to, anyone else.

generateRecoveryPhrase(words?: 12 | 24): string                  // BIP39, default 12
keypairFromRecoveryPhrase(phrase: string, opts?: { passphrase?: string;
                          derivationPath?: string }): Keypair
// no derivationPath = `solana-keygen recover` default (first 32 bytes of the BIP39 seed);
// derivationPath "m/44'/501'/0'/0'" = the usual browser-wallet path.
keypairFromFile(json: string | number[]): Keypair                // solana-keygen file format
keypairToFile(kp: Keypair): string                               // "[n,n,...]" (64 numbers)
sealedTokenAccountAddress(owner: PublicKey, mint: PublicKey): PublicKey   // Token-2022 ATA
```

Errors: `InvalidRecoveryPhrase`, `InvalidKeyFile`.

## Account: create and seal

```ts
createSealedAccount(p: {
  connection: Connection; payer: Keypair; owner: Keypair; mint: PublicKey;
  maxPendingCredits?: bigint;                     // default DEFAULT_MAX_PENDING_CREDITS
}): Promise<{ tokenAccount: PublicKey; signature: string; keys: SealKeys }>
```
One transaction: create the Token-2022 ATA (idempotent), Reallocate for the
ConfidentialTransferAccount extension, `ConfigureAccount` with a pubkey-validity proof
(ZK proof instruction in the same transaction), `DisableNonConfidentialCredits`.
`payer` may equal `owner`. Re-running on an already sealed account throws
`AlreadySealed` without sending anything.

Instruction builders (exported, for callers who assemble their own transactions):
`ixConfigureAccount`, `ixDisableNonConfidentialCredits`, `ixEnableNonConfidentialCredits`,
`ixDeposit`, `ixApplyPendingBalance`, `ixTransfer`, `ixVerifyPubkeyValidity`,
`ixVerifyProof(kind, data, contextState?)`, `ixCloseContextState`, `ixReallocate`.
