import { Buffer } from "buffer";
import { PublicKey, SystemProgram, TransactionInstruction, AccountMeta } from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, ExtensionType, TOKEN_2022_PROGRAM_ID, TokenIx } from "./constants.js";
import { sealedTokenAccountAddress } from "./keys.js";

const w = (pubkey: PublicKey, isSigner = false): AccountMeta => ({ pubkey, isSigner, isWritable: true });
const r = (pubkey: PublicKey, isSigner = false): AccountMeta => ({ pubkey, isSigner, isWritable: false });

function bytes(...parts: (Uint8Array | number[])[]): Buffer {
  return Buffer.concat(parts.map((p) => Buffer.from(p as Uint8Array)));
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
