import { Buffer } from "buffer";
import { PublicKey, SystemProgram, TransactionInstruction, AccountMeta } from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, CtIx, ExtensionType, ProofIx, ProofKind, SYSVAR_INSTRUCTIONS_ID, TOKEN_2022_PROGRAM_ID, TokenIx, ZK_ELGAMAL_PROOF_PROGRAM_ID } from "./constants.js";
import { sealedTokenAccountAddress } from "./keys.js";

const w = (pubkey: PublicKey, isSigner = false): AccountMeta => ({ pubkey, isSigner, isWritable: true });
const r = (pubkey: PublicKey, isSigner = false): AccountMeta => ({ pubkey, isSigner, isWritable: false });

function bytes(...parts: (Uint8Array | number[])[]): Buffer {
  return Buffer.concat(parts.map((p) => Buffer.from(p as Uint8Array)));
}
function u64le(v: bigint): Uint8Array {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, v, true);
  return b;
}
function i8(v: number): number[] {
  return [v & 0xff];
}
function ct(sub: number, ...rest: (Uint8Array | number[])[]): Buffer {
  return bytes([TokenIx.ConfidentialTransferExtension, sub], ...rest);
}

export function ixCreateAssociatedTokenAccountIdempotent(payer: PublicKey, owner: PublicKey, mint: PublicKey): TransactionInstruction {
  const ata = sealedTokenAccountAddress(owner, mint);
  return new TransactionInstruction({
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [w(payer, true), w(ata), r(owner), r(mint), r(SystemProgram.programId), r(TOKEN_2022_PROGRAM_ID)],
    data: Buffer.from([1]),
  });
}

export function ixReallocate(
  account: PublicKey,
  payer: PublicKey,
  owner: PublicKey,
  extensionTypes: number[] = [ExtensionType.ConfidentialTransferAccount],
): TransactionInstruction {
  const ext = new Uint8Array(extensionTypes.length * 2);
  extensionTypes.forEach((t, i) => new DataView(ext.buffer).setUint16(i * 2, t, true));
  return new TransactionInstruction({
    programId: TOKEN_2022_PROGRAM_ID,
    keys: [w(account), w(payer, true), r(SystemProgram.programId), r(owner, true)],
    data: bytes([TokenIx.Reallocate], ext),
  });
}

export function ixConfigureAccount(p: {
  account: PublicKey;
  mint: PublicKey;
  owner: PublicKey;
  decryptableZeroBalance: Uint8Array;
  maxPendingCredits: bigint;
  proofInstructionOffset: number;
  contextState?: PublicKey;
}): TransactionInstruction {
  const keys = [w(p.account), r(p.mint)];
  if (p.proofInstructionOffset !== 0) keys.push(r(SYSVAR_INSTRUCTIONS_ID));
  else if (p.contextState) keys.push(r(p.contextState));
  else throw new Error("ConfigureAccount needs a proof offset or a context state account");
  keys.push(r(p.owner, true));
  return new TransactionInstruction({
    programId: TOKEN_2022_PROGRAM_ID,
    keys,
    data: ct(CtIx.ConfigureAccount, p.decryptableZeroBalance, u64le(p.maxPendingCredits), i8(p.proofInstructionOffset)),
  });
}

function simpleOwnerIx(sub: number, account: PublicKey, owner: PublicKey): TransactionInstruction {
  return new TransactionInstruction({ programId: TOKEN_2022_PROGRAM_ID, keys: [w(account), r(owner, true)], data: ct(sub) });
}
export const ixDisableNonConfidentialCredits = (a: PublicKey, o: PublicKey) => simpleOwnerIx(CtIx.DisableNonConfidentialCredits, a, o);
export const ixEnableNonConfidentialCredits = (a: PublicKey, o: PublicKey) => simpleOwnerIx(CtIx.EnableNonConfidentialCredits, a, o);
export const ixEnableConfidentialCredits = (a: PublicKey, o: PublicKey) => simpleOwnerIx(CtIx.EnableConfidentialCredits, a, o);
export const ixDisableConfidentialCredits = (a: PublicKey, o: PublicKey) => simpleOwnerIx(CtIx.DisableConfidentialCredits, a, o);

export function ixDeposit(account: PublicKey, mint: PublicKey, owner: PublicKey, amount: bigint, decimals: number): TransactionInstruction {
  return new TransactionInstruction({
    programId: TOKEN_2022_PROGRAM_ID,
    keys: [w(account), r(mint), r(owner, true)],
    data: ct(CtIx.Deposit, u64le(amount), [decimals]),
  });
}

export function ixApplyPendingBalance(
  account: PublicKey,
  owner: PublicKey,
  expectedPendingCreditCounter: bigint,
  newDecryptableAvailableBalance: Uint8Array,
): TransactionInstruction {
  return new TransactionInstruction({
    programId: TOKEN_2022_PROGRAM_ID,
    keys: [w(account), r(owner, true)],
    data: ct(CtIx.ApplyPendingBalance, u64le(expectedPendingCreditCounter), newDecryptableAvailableBalance),
  });
}

export function ixTransfer(p: {
  source: PublicKey;
  mint: PublicKey;
  destination: PublicKey;
  owner: PublicKey;
  newSourceDecryptableAvailableBalance: Uint8Array;
  auditorCiphertextLo: Uint8Array;
  auditorCiphertextHi: Uint8Array;
  equality: { offset: number } | { contextState: PublicKey };
  validity: { offset: number } | { contextState: PublicKey };
  range: { offset: number } | { contextState: PublicKey };
}): TransactionInstruction {
  const off = (x: { offset: number } | { contextState: PublicKey }) => ("offset" in x ? x.offset : 0);
  const offsets = [off(p.equality), off(p.validity), off(p.range)];
  const keys = [w(p.source), r(p.mint), w(p.destination)];
  if (offsets.some((o) => o !== 0)) keys.push(r(SYSVAR_INSTRUCTIONS_ID));
  for (const x of [p.equality, p.validity, p.range]) if ("contextState" in x) keys.push(r(x.contextState));
  keys.push(r(p.owner, true));
  return new TransactionInstruction({
    programId: TOKEN_2022_PROGRAM_ID,
    keys,
    data: ct(
      CtIx.Transfer,
      p.newSourceDecryptableAvailableBalance,
      p.auditorCiphertextLo,
      p.auditorCiphertextHi,
      i8(offsets[0]),
      i8(offsets[1]),
      i8(offsets[2]),
    ),
  });
}

export function ixVerifyProof(
  kind: ProofKind,
  proofData: Uint8Array,
  contextState?: { account: PublicKey; authority: PublicKey },
): TransactionInstruction {
  const keys = contextState ? [w(contextState.account), r(contextState.authority)] : [];
  return new TransactionInstruction({ programId: ZK_ELGAMAL_PROOF_PROGRAM_ID, keys, data: bytes([ProofIx[kind]], proofData) });
}

export const ixVerifyPubkeyValidity = (proofData: Uint8Array) => ixVerifyProof("VerifyPubkeyValidity", proofData);
