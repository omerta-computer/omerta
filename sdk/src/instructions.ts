import { Buffer } from "buffer";
import { PublicKey, SystemProgram, TransactionInstruction, AccountMeta } from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "./constants.js";
import { sealedTokenAccountAddress } from "./keys.js";

const w = (pubkey: PublicKey, isSigner = false): AccountMeta => ({ pubkey, isSigner, isWritable: true });
const r = (pubkey: PublicKey, isSigner = false): AccountMeta => ({ pubkey, isSigner, isWritable: false });

export function ixCreateAssociatedTokenAccountIdempotent(payer: PublicKey, owner: PublicKey, mint: PublicKey): TransactionInstruction {
  const ata = sealedTokenAccountAddress(owner, mint);
  return new TransactionInstruction({
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [w(payer, true), w(ata), r(owner), r(mint), r(SystemProgram.programId), r(TOKEN_2022_PROGRAM_ID)],
    data: Buffer.from([1]),
  });
}
