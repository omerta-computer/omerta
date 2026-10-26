import { zk } from "./zk.js";
import { SealedError } from "./errors.js";
import { MAX_TRANSFER_AMOUNT, RANGE_PROOF_PADDING_BIT_LENGTH, REMAINING_BALANCE_BIT_LENGTH, TRANSFER_AMOUNT_HI_BITS, TRANSFER_AMOUNT_LO_BITS } from "./constants.js";
import type { SealKeys } from "./keys.js";

export type TransferProofs = {
  equality: Uint8Array;
  validity: Uint8Array;
  range: Uint8Array;
  equalityContextLen: number;
  validityContextLen: number;
  rangeContextLen: number;
  auditorCiphertextLo: Uint8Array;
  auditorCiphertextHi: Uint8Array;
  newDecryptableAvailable: Uint8Array;
  newAvailable: bigint;
  ms: number;
};

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

export function defaultAuditorPubkey(): zk.ElGamalPubkey {
  return zk.ElGamalPubkey.fromBytes(new Uint8Array(32));
}

export function generateTransferProofs(p: {
  keys: SealKeys;
  currentAvailableCiphertext: Uint8Array;
  currentAvailable: bigint;
  amount: bigint;
  destinationElGamalPubkey: Uint8Array;
  auditorElGamalPubkey?: Uint8Array | null;
}): TransferProofs {
  const t0 = now();
  if (p.amount <= 0n) throw new SealedError("AmountTooLarge", "amount must be positive");
  if (p.amount > MAX_TRANSFER_AMOUNT) throw new SealedError("AmountTooLarge", "amount exceeds 48 bits");
  if (p.amount > p.currentAvailable) {
    throw new SealedError("InsufficientSealedBalance", "not enough sealed balance", { available: p.currentAvailable });
  }
  const amountLo = p.amount & 0xffffn;
  const amountHi = p.amount >> 16n;

  const srcPk = p.keys.elgamal.pubkey();
  const dstPk = zk.ElGamalPubkey.fromBytes(p.destinationElGamalPubkey);
  const audPk = p.auditorElGamalPubkey ? zk.ElGamalPubkey.fromBytes(p.auditorElGamalPubkey) : defaultAuditorPubkey();

  const openingLo = new zk.PedersenOpening();
  const openingHi = new zk.PedersenOpening();
  const groupedLo = zk.GroupedElGamalCiphertext3Handles.encryptWith(srcPk, dstPk, audPk, amountLo, openingLo);
  const groupedHi = zk.GroupedElGamalCiphertext3Handles.encryptWith(srcPk, dstPk, audPk, amountHi, openingHi);

  const newAvailable = p.currentAvailable - p.amount;
  const newOpening = new zk.PedersenOpening();
  const newCommitment = zk.PedersenCommitment.from(newAvailable, newOpening);

  const current = zk.ElGamalCiphertext.fromBytes(p.currentAvailableCiphertext);
  if (!current) throw new SealedError("DecryptFailed", "bad available-balance ciphertext");
  const srcLo = groupedLo.toElGamalCiphertext(0);
  const srcHi = groupedHi.toElGamalCiphertext(0);
  const newAvailableCiphertext = current.subtract(zk.ElGamalCiphertext.combineLoHi(srcLo, srcHi, TRANSFER_AMOUNT_LO_BITS));

  const eq = new zk.CiphertextCommitmentEqualityProofData(p.keys.elgamal, newAvailableCiphertext, newCommitment, newOpening, newAvailable);
  const val = new zk.BatchedGroupedCiphertext3HandlesValidityProofData(
    srcPk,
    dstPk,
    audPk,
    groupedLo,
    groupedHi,
    amountLo,
    amountHi,
    openingLo,
    openingHi,
  );
  const paddingOpening = new zk.PedersenOpening();
  const paddingCommitment = zk.PedersenCommitment.from(0n, paddingOpening);
  const range = new zk.BatchedRangeProofU128Data(
    [newCommitment, srcLo.commitment(), srcHi.commitment(), paddingCommitment],
    new BigUint64Array([newAvailable, amountLo, amountHi, 0n]),
    new Uint8Array([REMAINING_BALANCE_BIT_LENGTH, TRANSFER_AMOUNT_LO_BITS, TRANSFER_AMOUNT_HI_BITS, RANGE_PROOF_PADDING_BIT_LENGTH]),
    [newOpening, openingLo, openingHi, paddingOpening],
  );

  const out: TransferProofs = {
    equality: eq.toBytes(),
    validity: val.toBytes(),
    range: range.toBytes(),
    equalityContextLen: eq.context().toBytes().length,
    validityContextLen: val.context().toBytes().length,
    rangeContextLen: range.context().toBytes().length,
    auditorCiphertextLo: groupedLo.toElGamalCiphertext(2).toBytes(),
    auditorCiphertextHi: groupedHi.toElGamalCiphertext(2).toBytes(),
    newDecryptableAvailable: p.keys.ae.encrypt(newAvailable).toBytes(),
    newAvailable,
    ms: 0,
  };
  for (const o of [eq, val, range, groupedLo, groupedHi, current, newAvailableCiphertext, srcLo, srcHi]) o.free();
  out.ms = Math.round(now() - t0);
  return out;
}

export function verifyTransferProofs(p: TransferProofs): void {
  zk.CiphertextCommitmentEqualityProofData.fromBytes(p.equality).verify();
  zk.BatchedGroupedCiphertext3HandlesValidityProofData.fromBytes(p.validity).verify();
  zk.BatchedRangeProofU128Data.fromBytes(p.range).verify();
}

export function pubkeyValidityProof(keys: SealKeys): Uint8Array {
  const d = new zk.PubkeyValidityProofData(keys.elgamal);
  const b = d.toBytes();
  d.free();
  return b;
}

export function decryptPending(keys: SealKeys, pendingLo: Uint8Array, pendingHi: Uint8Array): bigint {
  const lo = zk.ElGamalCiphertext.fromBytes(pendingLo);
  const hi = zk.ElGamalCiphertext.fromBytes(pendingHi);
  if (!lo || !hi) throw new SealedError("DecryptFailed", "bad pending ciphertext");
  const s = keys.elgamal.secret();
  const vLo = s.decrypt(lo);
  const vHi = s.decrypt(hi);
  return vLo + (vHi << BigInt(TRANSFER_AMOUNT_LO_BITS));
}

export function decryptAvailable(keys: SealKeys, decryptable: Uint8Array): bigint {
  const c = zk.AeCiphertext.fromBytes(decryptable);
  const v = c?.decrypt(keys.ae);
  if (v === undefined || v === null) throw new SealedError("DecryptFailed", "AES ciphertext does not open with this key");
  return v;
}
