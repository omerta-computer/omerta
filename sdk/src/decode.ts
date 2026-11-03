import { Buffer } from "buffer";
import type { PublicKey } from "@solana/web3.js";
import { CtIx, ProofIx, TOKEN_2022_PROGRAM_ID, TokenIx, ZK_ELGAMAL_PROOF_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "./constants.js";

export type DecodedInstruction = {
  index: number;
  program: "Token-2022" | "ZkElGamalProof" | "System" | "AssociatedToken" | "ComputeBudget" | "other";
  programId: string;
  name: string;
  sealed: boolean;
  accounts: string[];
  ciphertexts?: Record<string, string>;
  amount?: string;
};

export type TxLike = {
  transaction: {
    message: {
      staticAccountKeys?: PublicKey[];
      accountKeys?: PublicKey[];
      compiledInstructions?: { programIdIndex: number; accountKeyIndexes: number[]; data: Uint8Array }[];
      instructions?: { programIdIndex: number; accounts: number[]; data: string }[];
    };
  };
  meta?: { loadedAddresses?: { writable: PublicKey[]; readonly: PublicKey[] } } | null;
};

const ctNames = Object.fromEntries(Object.entries(CtIx).map(([k, v]) => [v, k]));
const proofNames = Object.fromEntries(Object.entries(ProofIx).map(([k, v]) => [v, k]));
const b64 = (b: Uint8Array) => Buffer.from(b).toString("base64");
const u64 = (b: Uint8Array, o: number) => new DataView(b.buffer, b.byteOffset, b.byteLength).getBigUint64(o, true).toString();

const BS58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function bs58decode(s: string): Uint8Array {
  let n = 0n;
  for (const c of s) {
    const i = BS58.indexOf(c);
    if (i < 0) throw new Error("bad base58");
    n = n * 58n + BigInt(i);
  }
  const bytes: number[] = [];
  while (n > 0n) {
    bytes.unshift(Number(n & 0xffn));
    n >>= 8n;
  }
  for (const c of s) {
    if (c !== "1") break;
    bytes.unshift(0);
  }
  return Uint8Array.from(bytes);
}

function normalized(tx: TxLike): { keys: string[]; ixs: { programIdIndex: number; accounts: number[]; data: Uint8Array }[] } {
  const m = tx.transaction.message;
  const statics = (m.staticAccountKeys ?? m.accountKeys ?? []).map((k) => k.toBase58());
  const loaded = tx.meta?.loadedAddresses;
  const keys = [...statics, ...(loaded?.writable ?? []).map((k) => k.toBase58()), ...(loaded?.readonly ?? []).map((k) => k.toBase58())];
  const ixs = m.compiledInstructions
    ? m.compiledInstructions.map((i) => ({ programIdIndex: i.programIdIndex, accounts: i.accountKeyIndexes, data: new Uint8Array(i.data) }))
    : (m.instructions ?? []).map((i) => ({ programIdIndex: i.programIdIndex, accounts: i.accounts, data: bs58decode(i.data) }));
  return { keys, ixs };
}

export function decodeSealedInstructions(tx: TxLike): DecodedInstruction[] {
  const { keys, ixs } = normalized(tx);
  return ixs.map((ix, index) => {
    const programId = keys[ix.programIdIndex];
    const accounts = ix.accounts.map((a) => keys[a]);
    const d = ix.data;
    const base = { index, programId, accounts, sealed: false };
    if (programId === TOKEN_2022_PROGRAM_ID.toBase58()) {
      if (d[0] === TokenIx.ConfidentialTransferExtension) {
        const sub = d[1];
        const name = `ConfidentialTransfer.${ctNames[sub] ?? `Unknown(${sub})`}`;
        const out: DecodedInstruction = { ...base, program: "Token-2022", name, sealed: true };
        if (sub === CtIx.Transfer && d.length >= 2 + 36 + 128) {
          out.ciphertexts = {
            newSourceDecryptableBalance: b64(d.subarray(2, 38)),
            auditorAmountLo: b64(d.subarray(38, 102)),
            auditorAmountHi: b64(d.subarray(102, 166)),
          };
        } else if (sub === CtIx.ApplyPendingBalance && d.length >= 46) {
          out.ciphertexts = { newDecryptableAvailableBalance: b64(d.subarray(10, 46)) };
        } else if ((sub === CtIx.Deposit || sub === CtIx.Withdraw) && d.length >= 10) {
          out.amount = u64(d, 2);
          out.sealed = false;
        }
        return out;
      }
      const names: Record<number, string> = { 3: "Transfer", 7: "MintTo", 12: "TransferChecked", 14: "MintToChecked", 20: "InitializeMint2", 29: "Reallocate", 1: "InitializeAccount", 18: "InitializeAccount3" };
      const out: DecodedInstruction = { ...base, program: "Token-2022", name: names[d[0]] ?? `Instruction(${d[0]})` };
      if ([3, 7, 12, 14].includes(d[0]) && d.length >= 9) out.amount = u64(d, 1);
      return out;
    }
    if (programId === ZK_ELGAMAL_PROOF_PROGRAM_ID.toBase58()) {
      return { ...base, program: "ZkElGamalProof", name: `ZkProof.${proofNames[d[0]] ?? `Unknown(${d[0]})`}`, sealed: true };
    }
    if (programId === "11111111111111111111111111111111") {
      const t = d.length >= 4 ? new DataView(d.buffer, d.byteOffset).getUint32(0, true) : -1;
      const names: Record<number, string> = { 0: "CreateAccount", 2: "Transfer", 8: "Allocate" };
      const out: DecodedInstruction = { ...base, program: "System", name: `System.${names[t] ?? `Instruction(${t})`}` };
      if (t === 2 && d.length >= 12) out.amount = u64(d, 4);
      return out;
    }
    if (programId === ASSOCIATED_TOKEN_PROGRAM_ID.toBase58()) {
      return { ...base, program: "AssociatedToken", name: d.length === 0 || d[0] === 0 ? "AssociatedToken.Create" : "AssociatedToken.CreateIdempotent" };
    }
    if (programId === "ComputeBudget111111111111111111111111111111") {
      return { ...base, program: "ComputeBudget", name: "ComputeBudget" };
    }
    return { ...base, program: "other", name: "unknown" };
  });
}
