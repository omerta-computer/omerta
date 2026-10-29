import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { DEFAULT_MAX_PENDING_CREDITS, ExtensionType, TOKEN_2022_PROGRAM_ID } from "./constants.js";
import { SealedError } from "./errors.js";
import { deriveSealKeys, sealedTokenAccountAddress, type SealKeys } from "./keys.js";
import { ixConfigureAccount, ixCreateAssociatedTokenAccountIdempotent, ixDisableNonConfidentialCredits, ixReallocate, ixVerifyPubkeyValidity } from "./instructions.js";
import { parseMint, parseTokenAccount, type MintState, type TokenAccountState } from "./layout.js";
import { pubkeyValidityProof } from "./proofs.js";
import { sendInstructions, type SendOptions } from "./rpc.js";

export async function fetchTokenAccount(
  connection: Connection,
  address: PublicKey,
  minContextSlot?: number,
): Promise<{ state: TokenAccountState; slot: number } | null> {
  const res = await connection.getAccountInfoAndContext(address, { commitment: "confirmed", minContextSlot });
  if (!res.value) return null;
  if (!res.value.owner.equals(TOKEN_2022_PROGRAM_ID)) return null;
  return { state: parseTokenAccount(new Uint8Array(res.value.data)), slot: res.context.slot };
}

export async function fetchMint(connection: Connection, mint: PublicKey): Promise<MintState> {
  const info = await connection.getAccountInfo(mint, "confirmed");
  if (!info || !info.owner.equals(TOKEN_2022_PROGRAM_ID)) throw new SealedError("NotSealed", `mint ${mint.toBase58()} not found`);
  return parseMint(new Uint8Array(info.data));
}

export async function createSealedAccount(p: {
  connection: Connection;
  payer: Keypair;
  owner: Keypair;
  mint: PublicKey;
  maxPendingCredits?: bigint;
  send?: SendOptions;
}): Promise<{ tokenAccount: PublicKey; signature: string; keys: SealKeys; bytes: number }> {
  const tokenAccount = sealedTokenAccountAddress(p.owner.publicKey, p.mint);
  const keys = deriveSealKeys(p.owner);
  const existing = await fetchTokenAccount(p.connection, tokenAccount);
  if (existing?.state.confidential && !existing.state.confidential.allowNonConfidentialCredits) {
    throw new SealedError("AlreadySealed", tokenAccount.toBase58(), { tokenAccount: tokenAccount.toBase58() });
  }
  const ixs = [];
  if (!existing) ixs.push(ixCreateAssociatedTokenAccountIdempotent(p.payer.publicKey, p.owner.publicKey, p.mint));
  if (!existing?.state.confidential) {
    ixs.push(ixReallocate(tokenAccount, p.payer.publicKey, p.owner.publicKey, [ExtensionType.ConfidentialTransferAccount]));
    ixs.push(
      ixConfigureAccount({
        account: tokenAccount,
        mint: p.mint,
        owner: p.owner.publicKey,
        decryptableZeroBalance: keys.ae.encrypt(0n).toBytes(),
        maxPendingCredits: p.maxPendingCredits ?? DEFAULT_MAX_PENDING_CREDITS,
        proofInstructionOffset: 1,
      }),
    );
    ixs.push(ixVerifyPubkeyValidity(pubkeyValidityProof(keys)));
  }
  ixs.push(ixDisableNonConfidentialCredits(tokenAccount, p.owner.publicKey));
  const { signature, bytes } = await sendInstructions(p.connection, ixs, p.payer, [p.owner], p.send);
  return { tokenAccount, signature, keys, bytes };
}
