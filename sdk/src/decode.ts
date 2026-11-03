import type { PublicKey } from "@solana/web3.js";

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
