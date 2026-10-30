import { Buffer } from "buffer";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { DEFAULT_MAX_PENDING_CREDITS, ExtensionType, TOKEN_2022_PROGRAM_ID } from "./constants.js";
import { SealedError } from "./errors.js";
import { deriveSealKeys, sealedTokenAccountAddress, type SealKeys } from "./keys.js";
import {
  ixApplyPendingBalance,
  ixConfigureAccount,
  ixCreateAssociatedTokenAccountIdempotent,
  ixDeposit,
  ixDisableNonConfidentialCredits,
  ixReallocate,
  ixVerifyPubkeyValidity,
} from "./instructions.js";
import { parseMint, parseTokenAccount, type MintState, type TokenAccountState } from "./layout.js";
import { decryptAvailable, decryptAvailableElGamal, decryptPending, pubkeyValidityProof } from "./proofs.js";
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

export async function deposit(p: {
  connection: Connection;
  payer: Keypair;
  owner: Keypair;
  tokenAccount: PublicKey;
  mint: PublicKey;
  amount: bigint;
  decimals: number;
  send?: SendOptions;
}): Promise<string> {
  const ix = ixDeposit(p.tokenAccount, p.mint, p.owner.publicKey, p.amount, p.decimals);
  return (await sendInstructions(p.connection, [ix], p.payer, [p.owner], p.send)).signature;
}

export async function applyPending(p: {
  connection: Connection;
  payer: Keypair;
  owner: Keypair;
  tokenAccount: PublicKey;
  keys?: SealKeys;
  send?: SendOptions;
}): Promise<{ signature: string | null; available: bigint; applied: bigint }> {
  const keys = p.keys ?? deriveSealKeys(p.owner);
  const acc = await fetchTokenAccount(p.connection, p.tokenAccount);
  const c = acc?.state.confidential;
  if (!c) throw new SealedError("NotSealed", p.tokenAccount.toBase58());
  const available = decryptAvailable(keys, c.decryptableAvailable);
  if (c.pendingCreditCounter === c.expectedPendingCreditCounter && c.pendingCreditCounter === c.actualPendingCreditCounter) {
    const pending = decryptPending(keys, c.pendingLo, c.pendingHi);
    if (pending === 0n) return { signature: null, available, applied: 0n };
  }
  const pending = decryptPending(keys, c.pendingLo, c.pendingHi);
  const next = available + pending;
  const ix = ixApplyPendingBalance(p.tokenAccount, p.owner.publicKey, c.pendingCreditCounter, keys.ae.encrypt(next).toBytes());
  try {
    const { signature } = await sendInstructions(p.connection, [ix], p.payer, [p.owner], p.send);
    return { signature, available: next, applied: pending };
  } catch (e) {
    const again = await fetchTokenAccount(p.connection, p.tokenAccount);
    if (again?.state.confidential && again.state.confidential.pendingCreditCounter !== c.pendingCreditCounter) {
      throw new SealedError("PendingChanged", "a credit landed during apply; run again");
    }
    throw e;
  }
}

export async function decryptBalances(p: {
  connection: Connection;
  tokenAccount: PublicKey;
  keys: SealKeys;
  verify?: boolean;
}): Promise<{ available: bigint; availableFromElGamal?: bigint; pending: bigint; pendingCredits: bigint; slot: number }> {
  const acc = await fetchTokenAccount(p.connection, p.tokenAccount);
  const c = acc?.state.confidential;
  if (!acc || !c) throw new SealedError("NotSealed", p.tokenAccount.toBase58());
  const out = {
    available: decryptAvailable(p.keys, c.decryptableAvailable),
    pending: decryptPending(p.keys, c.pendingLo, c.pendingHi),
    pendingCredits: c.pendingCreditCounter - c.expectedPendingCreditCounter,
    slot: acc.slot,
  } as { available: bigint; availableFromElGamal?: bigint; pending: bigint; pendingCredits: bigint; slot: number };
  if (p.verify) out.availableFromElGamal = decryptAvailableElGamal(p.keys, c.available);
  return out;
}

const b64 = (b: Uint8Array) => Buffer.from(b).toString("base64");

export type SealedAccountView = {
  address: string;
  owner: string;
  mint: string;
  programId: string;
  publicAmount: bigint;
  sealed: {
    approved: boolean;
    elgamalPubkey: string;
    pendingLo: string;
    pendingHi: string;
    available: string;
    decryptableAvailable: string;
    allowConfidentialCredits: boolean;
    allowNonConfidentialCredits: boolean;
    pendingCreditCounter: string;
    maxPendingCreditCounter: string;
    expectedPendingCreditCounter: string;
    actualPendingCreditCounter: string;
  } | null;
  slot: number;
};

export async function readSealedAccount(connection: Connection, address: PublicKey): Promise<SealedAccountView | null> {
  const acc = await fetchTokenAccount(connection, address);
  if (!acc) return null;
  const c = acc.state.confidential;
  return {
    address: address.toBase58(),
    owner: acc.state.owner.toBase58(),
    mint: acc.state.mint.toBase58(),
    programId: TOKEN_2022_PROGRAM_ID.toBase58(),
    publicAmount: acc.state.amount,
    sealed: c
      ? {
          approved: c.approved,
          elgamalPubkey: b64(c.elgamalPubkey),
          pendingLo: b64(c.pendingLo),
          pendingHi: b64(c.pendingHi),
          available: b64(c.available),
          decryptableAvailable: b64(c.decryptableAvailable),
          allowConfidentialCredits: c.allowConfidentialCredits,
          allowNonConfidentialCredits: c.allowNonConfidentialCredits,
          pendingCreditCounter: c.pendingCreditCounter.toString(),
          maxPendingCreditCounter: c.maxPendingCreditCounter.toString(),
          expectedPendingCreditCounter: c.expectedPendingCreditCounter.toString(),
          actualPendingCreditCounter: c.actualPendingCreditCounter.toString(),
        }
      : null,
    slot: acc.slot,
  };
}
