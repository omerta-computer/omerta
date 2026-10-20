import { PublicKey } from "@solana/web3.js";
import { ExtensionType } from "./constants.js";

const ACCOUNT_BASE = 165;
const MINT_BASE = 82;
const ACCOUNT_TYPE_MINT = 1;
const ACCOUNT_TYPE_ACCOUNT = 2;

export const CT_ACCOUNT_LEN = 295;
export const CT_MINT_LEN = 65;

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

const isZero = (b: Uint8Array) => b.every((x) => x === 0);

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

export function parseTokenAccount(data: Uint8Array): TokenAccountState {
  if (data.length < ACCOUNT_BASE) throw new Error("not a token account");
  const extensions =
    data.length > ACCOUNT_BASE && data[ACCOUNT_BASE] === ACCOUNT_TYPE_ACCOUNT
      ? parseTlv(data, ACCOUNT_BASE + 1)
      : new Map<number, Uint8Array>();
  const ct = extensions.get(ExtensionType.ConfidentialTransferAccount);
  return {
    mint: new PublicKey(data.slice(0, 32)),
    owner: new PublicKey(data.slice(32, 64)),
    amount: u64(data, 64),
    state: data[108],
    extensions,
    confidential: ct ? parseConfidentialAccount(ct) : null,
  };
}

export function parseMint(data: Uint8Array): MintState {
  if (data.length < MINT_BASE) throw new Error("not a mint");
  const coption = (o: number) =>
    new DataView(data.buffer, data.byteOffset).getUint32(o, true) === 1 ? new PublicKey(data.slice(o + 4, o + 36)) : null;
  const extensions =
    data.length > ACCOUNT_BASE && data[ACCOUNT_BASE] === ACCOUNT_TYPE_MINT
      ? parseTlv(data, ACCOUNT_BASE + 1)
      : new Map<number, Uint8Array>();
  const ct = extensions.get(ExtensionType.ConfidentialTransferMint);
  return {
    mintAuthority: coption(0),
    supply: u64(data, 36),
    decimals: data[44],
    isInitialized: data[45] === 1,
    freezeAuthority: coption(46),
    extensions,
    confidential: ct
      ? {
          authority: isZero(ct.subarray(0, 32)) ? null : new PublicKey(ct.slice(0, 32)),
          autoApproveNewAccounts: ct[32] === 1,
          auditorElGamalPubkey: isZero(ct.subarray(33, 65)) ? null : ct.slice(33, 65),
        }
      : null,
  };
}

