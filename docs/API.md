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

## Deposit (public -> sealed, own account only)

```ts
deposit(p: { connection; payer: Keypair; owner: Keypair; tokenAccount: PublicKey;
             mint: PublicKey; amount: bigint; decimals: number }): Promise<string>
```
Lands in pending; follow with `applyPending`.

## Apply pending

```ts
applyPending(p: { connection; payer: Keypair; owner: Keypair; tokenAccount: PublicKey;
                  keys?: SealKeys }): Promise<{ signature: string | null;
                  available: bigint; applied: bigint }>
```
Reads the account, decrypts pending (ElGamal, lo 16 bit + hi 32 bit) and available (AES),
sends `ApplyPendingBalance` with the expected credit counter and the new AES-encrypted
available balance. `signature` is `null` when nothing is pending.
Errors: `NotSealed`, `PendingChanged` (a credit landed between read and apply: re-run).

## Sealed transfer

```ts
type TransferMode = "context-state";

type TransferProgress = {
  step: number; total: number;                       // total = 5 on the context-state path
  stage: "proofs" | "equality" | "validity" | "range" | "transfer" | "cleanup";
  status: "start" | "sent" | "confirmed";
  signature?: string; ms?: number; bytes?: number;   // ms: elapsed for this step
};

sealedTransfer(p: {
  connection: Connection; payer: Keypair; owner: Keypair;
  source: PublicKey;                 // sender's sealed token account
  destination: PublicKey;            // receiver's sealed token account (not the owner wallet)
  amount: bigint;
  keys?: SealKeys;                   // derived from owner if absent
  mode?: TransferMode;               // default "context-state"
  onProgress?: (e: TransferProgress) => void;
  send?: SendOptions;                // commitment, timeout, poll interval
}): Promise<TransferResult>

type TransferResult = {
  signature: string;                 // the transaction holding the Token-2022 Transfer
  signatures: string[];              // every transaction sent, in order
  proofMs: number;                   // proof generation time (all three proofs)
  newAvailable: bigint;
  plan: TransferPlan;
};
planTransfer(p): Promise<TransferPlan>   // proofs and plan only, nothing sent
```

Context-state path: step 1 builds the three proofs locally (about 43 ms in Node, p50; about 62 ms in a browser), then four
transactions, each confirmed before the next (sizes measured offline, legacy limit 1,232):
1. `equality`: create the equality and range context accounts + `VerifyCiphertextCommitmentEquality` (831 B)
2. `validity`: create the validity context account + `VerifyBatchedGroupedCiphertext3HandlesValidity` (902 B)
3. `range`: `VerifyBatchedRangeProofU128` into the range context account (1,205 B)
4. `transfer`: `ConfidentialTransfer::Transfer` referencing the three context accounts + close all
   three (rent back to `payer`) in the same transaction (591 B)
The stock CLI 5.7.1 uses 10 transactions for the same transfer (see `docs/genesis.md`); ours is 4,
with the same proofs. The context-state authority is `payer`. The count is reported in every
progress event. UIs never hard-code it: show `step` of `total`.
Sealing an account is 1 transaction (571 B).

Failure and resume:
```ts
type TransferPlan = {               // JSON-serialisable; keep it until the transfer is done
  v: 1; id: string; source: string; destination: string; mint: string; payer: string;
  amount: string; sourceAvailableCiphertext: string;
  context: { equality: string; validity: string; range: string };        // addresses
  contextSecrets: { equality: string; validity: string; range: string }; // throwaway keys of
      // the three context accounts (they only ever hold rent); no owner, ElGamal or AES key
  proofs: {...}; transferData: {...}; newAvailable: string; proofMs: number;
  done: { stage: string; signature: string; bytes: number }[];
};
resumeTransfer(p: { connection; payer; owner; plan; onProgress?; send? }): Promise<TransferResult>
cleanupTransfer(p: { connection; payer; plan; send? }): Promise<string[]>
```
A failed step throws `TransferStepFailed` with `details.plan` and `details.stage`.
`resumeTransfer` re-reads the chain, skips steps that already landed, and continues; if the
source balance changed since the proofs were built it throws `BalanceChanged` and the caller
runs `cleanupTransfer` (verifies a half-made range context so it can close, then closes every
context account, rent back to `payer`) and starts a new transfer. Context accounts never hold
tokens.

Other errors (`SealedError.code`): `NotSealed`, `InsufficientSealedBalance` (`details.available`),
`AmountTooLarge`, `DestinationNotSealed`, `TransactionFailed` (`details.signature`,
`details.logs`; message names Token-2022 `0x31` NonConfidentialTransfersDisabled),
`ConfirmTimeout`, `DecryptFailed`.

## Decrypt (owner)

```ts
decryptBalances(p: { connection; tokenAccount: PublicKey; keys: SealKeys; verify?: boolean }): Promise<{
  available: bigint;                 // AES (decryptable_available_balance), instant
  availableFromElGamal?: bigint;     // only with verify: true, slow (discrete log)
  pending: bigint;                   // ElGamal lo + hi << 16
  pendingCredits: bigint; slot: number;
}>
decryptPending(keys, lo, hi) / decryptAvailable(keys, aesCiphertext)   // pure, no RPC

// "open your own" for one transfer: the transfer amount sits, as a grouped ciphertext
// with one handle each for source, destination and auditor, in the validity-proof
// instruction (step 2's transaction). Sender or receiver decrypts it locally.
decryptTransferAmount(p: { validityTx: TxLike /* getTransaction result */; keys: SealKeys;
  role: "source" | "destination" }): bigint | null   // null: no such proof or not these keys
```

## Read as an outsider (explorer)

```ts
readSealedAccount(connection, address: PublicKey): Promise<SealedAccountView | null>
type SealedAccountView = {
  address: string; owner: string; mint: string; programId: string;
  publicAmount: bigint;              // the non-confidential balance (0 for sealed accounts)
  sealed: {
    approved: boolean; elgamalPubkey: string;                 // base64
    pendingLo: string; pendingHi: string; available: string;  // ElGamal ciphertexts, base64
    decryptableAvailable: string;                             // AES ciphertext, base64
    allowConfidentialCredits: boolean; allowNonConfidentialCredits: boolean;
    pendingCreditCounter: string; maxPendingCreditCounter: string;
    expectedPendingCreditCounter: string; actualPendingCreditCounter: string;
  } | null;                          // null = Token-2022 account without the extension
  slot: number;
};
decodeSealedInstructions(tx: TxLike): DecodedInstruction[]
type DecodedInstruction = { index: number; program: "Token-2022" | "ZkElGamalProof" | "System" |
  "AssociatedToken" | "ComputeBudget" | "other"; programId: string; name: string; sealed: boolean;
  accounts: string[]; ciphertexts?: Record<string, string>; amount?: string /* public only */ };
```
`name` is e.g. `ConfidentialTransfer.Transfer`, `ConfidentialTransfer.ApplyPendingBalance`,
`ZkProof.VerifyBatchedRangeProofU128`, `ZkProof.CloseContextState`, `System.CreateAccount`.
`amount` is set only where the chain carries a public number (Deposit, Withdraw, MintTo,
System transfer); a sealed transfer has none.
