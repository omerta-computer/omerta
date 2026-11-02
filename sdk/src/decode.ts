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
