import { zk } from "./zk.js";

export type SealKeys = {
  elgamal: zk.ElGamalKeypair;
  ae: zk.AeKey;
  elgamalPubkey: Uint8Array;
};

const enc = new TextEncoder();

export const STANDARD_DERIVATION_MESSAGE = enc.encode("solana-conf-bal/v1");
