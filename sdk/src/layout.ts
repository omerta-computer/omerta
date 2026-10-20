import { PublicKey } from "@solana/web3.js";

export const CT_ACCOUNT_LEN = 295;

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

export type ConfidentialMintState = {
  authority: PublicKey | null;
  autoApproveNewAccounts: boolean;
  auditorElGamalPubkey: Uint8Array | null;
};

export type MintState = {
  mintAuthority: PublicKey | null;
  supply: bigint;
  decimals: number;
  isInitialized: boolean;
  freezeAuthority: PublicKey | null;
  extensions: Map<number, Uint8Array>;
  confidential: ConfidentialMintState | null;
};

function u64(b: Uint8Array, o: number): bigint {
  return new DataView(b.buffer, b.byteOffset, b.byteLength).getBigUint64(o, true);
}

function parseTlv(data: Uint8Array, start: number): Map<number, Uint8Array> {
  const out = new Map<number, Uint8Array>();
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let o = start;
  while (o + 4 <= data.length) {
    const t = dv.getUint16(o, true);
    const len = dv.getUint16(o + 2, true);
    if (t === 0) break;
    if (o + 4 + len > data.length) break;
    out.set(t, data.subarray(o + 4, o + 4 + len));
    o += 4 + len;
  }
  return out;
}

export function parseConfidentialAccount(v: Uint8Array): ConfidentialAccountState {
  if (v.length < CT_ACCOUNT_LEN) throw new Error("ConfidentialTransferAccount too short");
  return {
    approved: v[0] === 1,
    elgamalPubkey: v.slice(1, 33),
    pendingLo: v.slice(33, 97),
    pendingHi: v.slice(97, 161),
    available: v.slice(161, 225),
    decryptableAvailable: v.slice(225, 261),
    allowConfidentialCredits: v[261] === 1,
    allowNonConfidentialCredits: v[262] === 1,
    pendingCreditCounter: u64(v, 263),
    maxPendingCreditCounter: u64(v, 271),
    expectedPendingCreditCounter: u64(v, 279),
    actualPendingCreditCounter: u64(v, 287),
  };
}
