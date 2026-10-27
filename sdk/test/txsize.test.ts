import { test } from "node:test";
import assert from "node:assert/strict";
import { Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import { zk } from "../src/zk.js";
import { deriveSealKeys } from "../src/keys.js";
import { generateTransferProofs, pubkeyValidityProof } from "../src/proofs.js";
import {
  contextStateSize,
  ixCloseContextState,
  ixConfigureAccount,
  ixCreateAssociatedTokenAccountIdempotent,
  ixDisableNonConfidentialCredits,
  ixReallocate,
  ixTransfer,
  ixVerifyProof,
  ixVerifyPubkeyValidity,
} from "../src/instructions.js";
import { ZK_ELGAMAL_PROOF_PROGRAM_ID } from "../src/constants.js";

const LIMIT = 1232;
const blockhash = new PublicKey(new Uint8Array(32).fill(3)).toBase58();
function size(ixs: TransactionInstruction[], payer: Keypair, signers: Keypair[]): number {
  const tx = new Transaction({ feePayer: payer.publicKey, blockhash, lastValidBlockHeight: 1 }).add(...ixs);
  const m = new Map<string, Keypair>();
  for (const s of [payer, ...signers]) m.set(s.publicKey.toBase58(), s);
  tx.sign(...m.values());
  return tx.serialize().length;
}

test("every transaction of seal and transfer fits the legacy 1232-byte limit", () => {
  const owner = Keypair.generate();
  const mint = Keypair.generate().publicKey;
  const acct = Keypair.generate().publicKey;
  const keys = deriveSealKeys(owner);
  const seal = size(
    [
      ixCreateAssociatedTokenAccountIdempotent(owner.publicKey, owner.publicKey, mint),
      ixReallocate(acct, owner.publicKey, owner.publicKey),
      ixConfigureAccount({ account: acct, mint, owner: owner.publicKey, decryptableZeroBalance: keys.ae.encrypt(0n).toBytes(), maxPendingCredits: 65536n, proofInstructionOffset: 1 }),
      ixVerifyPubkeyValidity(pubkeyValidityProof(keys)),
      ixDisableNonConfidentialCredits(acct, owner.publicKey),
    ],
    owner,
    [],
  );

  const dst = deriveSealKeys(Keypair.generate());
  const p = generateTransferProofs({
    keys,
    currentAvailableCiphertext: keys.elgamal.pubkey().encryptWith(10_000_000n, new zk.PedersenOpening()).toBytes(),
    currentAvailable: 10_000_000n,
    amount: 1_000_000n,
    destinationElGamalPubkey: dst.elgamalPubkey,
  });
  const eq = Keypair.generate(), val = Keypair.generate(), rg = Keypair.generate();
  const ca = (kp: Keypair, len: number) =>
    SystemProgram.createAccount({ fromPubkey: owner.publicKey, newAccountPubkey: kp.publicKey, lamports: 1, space: contextStateSize(len), programId: ZK_ELGAMAL_PROOF_PROGRAM_ID });
  const auth = owner.publicKey;
  const tx1 = size([ca(eq, p.equalityContextLen), ca(rg, p.rangeContextLen), ixVerifyProof("VerifyCiphertextCommitmentEquality", p.equality, { account: eq.publicKey, authority: auth })], owner, [eq, rg]);
  const tx2 = size([ca(val, p.validityContextLen), ixVerifyProof("VerifyBatchedGroupedCiphertext3HandlesValidity", p.validity, { account: val.publicKey, authority: auth })], owner, [val]);
  const tx3 = size([ixVerifyProof("VerifyBatchedRangeProofU128", p.range, { account: rg.publicKey, authority: auth })], owner, []);
  const tx4 = size(
    [
      ixTransfer({
        source: acct, mint, destination: Keypair.generate().publicKey, owner: owner.publicKey,
        newSourceDecryptableAvailableBalance: p.newDecryptableAvailable, auditorCiphertextLo: p.auditorCiphertextLo, auditorCiphertextHi: p.auditorCiphertextHi,
        equality: { contextState: eq.publicKey }, validity: { contextState: val.publicKey }, range: { contextState: rg.publicKey },
      }),
      ixCloseContextState(eq.publicKey, owner.publicKey, auth),
      ixCloseContextState(val.publicKey, owner.publicKey, auth),
      ixCloseContextState(rg.publicKey, owner.publicKey, auth),
    ],
    owner,
    [],
  );

  const payer = Keypair.generate();
  const tx3b = size([ixVerifyProof("VerifyBatchedRangeProofU128", p.range, { account: rg.publicKey, authority: payer.publicKey })], payer, []);
  console.log(`bytes seal=${seal} tx1=${tx1} tx2=${tx2} tx3=${tx3} tx3(payer!=owner)=${tx3b} tx4=${tx4}`);
  for (const n of [seal, tx1, tx2, tx3, tx3b, tx4]) assert.ok(n <= LIMIT, `${n} > ${LIMIT}`);
});
