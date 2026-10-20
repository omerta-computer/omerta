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
