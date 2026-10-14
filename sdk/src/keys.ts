import { Keypair, PublicKey } from "@solana/web3.js";
import { ed25519 } from "@noble/curves/ed25519";
import { sha3_512 } from "@noble/hashes/sha3";
import { extract, expand } from "@noble/hashes/hkdf";
import { sha512 } from "@noble/hashes/sha512";
import { zk } from "./zk.js";
import { SealedError } from "./errors.js";

export type SealKeys = {
  elgamal: zk.ElGamalKeypair;
  ae: zk.AeKey;
  elgamalPubkey: Uint8Array;
};

const enc = new TextEncoder();

export const STANDARD_DERIVATION_MESSAGE = enc.encode("solana-conf-bal/v1");
const AE_INFO = enc.encode("ae");
const ELGAMAL_INFO = enc.encode("elgamal");

const ED25519_L = 2n ** 252n + 27742317777372353535851937790883648493n;
function leToBigInt(b: Uint8Array): bigint {
  let v = 0n;
  for (let i = b.length - 1; i >= 0; i--) v = (v << 8n) + BigInt(b[i]);
  return v;
}
function bigIntToLe32(v: bigint): Uint8Array {
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}
function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function keysFrom(scalar: bigint, aeBytes: Uint8Array): SealKeys {
  const secret = zk.ElGamalSecretKey.fromBytes(bigIntToLe32(scalar % ED25519_L));
  const elgamal = zk.ElGamalKeypair.fromSecretKey(secret);
  const ae = zk.AeKey.fromBytes(aeBytes);
  return { elgamal, ae, elgamalPubkey: elgamal.pubkey().toBytes() };
}

export function sealKeysFromSignature(signature: Uint8Array): SealKeys {
  if (signature.length < 32) throw new SealedError("InvalidKeyFile", "ikm too short");
  if (signature.every((b) => b === 0)) throw new SealedError("InvalidKeyFile", "default signature refused");
  const prk = extract(sha512, signature, STANDARD_DERIVATION_MESSAGE);
  const ae = expand(sha512, prk, AE_INFO, 16);
  const wide = expand(sha512, prk, ELGAMAL_INFO, 64);
  return keysFrom(leToBigInt(wide), ae);
}

export function deriveSealKeys(owner: Keypair): SealKeys {
  return sealKeysFromSignature(ed25519.sign(STANDARD_DERIVATION_MESSAGE, owner.secretKey.slice(0, 32)));
}

export async function deriveSealKeysFromSigner(signMessage: (msg: Uint8Array) => Promise<Uint8Array>): Promise<SealKeys> {
  return sealKeysFromSignature(await signMessage(STANDARD_DERIVATION_MESSAGE));
}

export function deriveSealKeysLegacy(owner: Keypair, tokenAccount: PublicKey): SealKeys {
  const sk = owner.secretKey.slice(0, 32);
  const seed = tokenAccount.toBytes();
  const egSig = ed25519.sign(concat(enc.encode("ElGamalSecretKey"), seed), sk);
  const aeSig = ed25519.sign(concat(enc.encode("AeKey"), seed), sk);
  return keysFrom(leToBigInt(sha3_512(sha3_512(egSig))), sha3_512(sha3_512(aeSig)).slice(0, 16));
}
