import { zk } from "./zk.js";

export type SealKeys = {
  elgamal: zk.ElGamalKeypair;
  ae: zk.AeKey;
  elgamalPubkey: Uint8Array;
};
