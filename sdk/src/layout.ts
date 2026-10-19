import { PublicKey } from "@solana/web3.js";

export type ConfidentialAccountState = {
  approved: boolean;
  elgamalPubkey: Uint8Array;
  pendingLo: Uint8Array;
  pendingHi: Uint8Array;
  available: Uint8Array;
  decryptableAvailable: Uint8Array;
  allowConfidentialCredits: boolean;
  allowNonConfidentialCredits: boolean;
  pendingCreditCounter: bigint;
  maxPendingCreditCounter: bigint;
  expectedPendingCreditCounter: bigint;
  actualPendingCreditCounter: bigint;
};

export type TokenAccountState = {
  mint: PublicKey;
  owner: PublicKey;
  amount: bigint;
  state: number;
  extensions: Map<number, Uint8Array>;
  confidential: ConfidentialAccountState | null;
};
