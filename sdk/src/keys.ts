import { Keypair, PublicKey } from "@solana/web3.js";
import { ed25519 } from "@noble/curves/ed25519";
import { sha3_512 } from "@noble/hashes/sha3";
import { hmac } from "@noble/hashes/hmac";
import { extract, expand } from "@noble/hashes/hkdf";
import { sha512 } from "@noble/hashes/sha512";
import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
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

export function generateRecoveryPhrase(words: 12 | 24 = 12): string {
  return generateMnemonic(wordlist, words === 24 ? 256 : 128);
}

function slip10Ed25519(seed: Uint8Array, path: string): Uint8Array {
  const parts = path.split("/");
  if (parts[0] !== "m") throw new SealedError("InvalidRecoveryPhrase", `bad derivation path ${path}`);
  let I = hmac(sha512, enc.encode("ed25519 seed"), seed);
  let key = I.slice(0, 32);
  let chain = I.slice(32);
  for (const p of parts.slice(1)) {
    if (!p.endsWith("'")) throw new SealedError("InvalidRecoveryPhrase", "ed25519 paths are hardened only");
    const idx = Number(p.slice(0, -1));
    if (!Number.isInteger(idx) || idx < 0 || idx >= 0x80000000) {
      throw new SealedError("InvalidRecoveryPhrase", `bad path index ${p}`);
    }
    const data = new Uint8Array(37);
    data.set(key, 1);
    new DataView(data.buffer).setUint32(33, (idx | 0x80000000) >>> 0, false);
    I = hmac(sha512, chain, data);
    key = I.slice(0, 32);
    chain = I.slice(32);
  }
  return key;
}

export function keypairFromRecoveryPhrase(
  phrase: string,
  opts: { passphrase?: string; derivationPath?: string } = {},
): Keypair {
  const normalized = phrase.trim().toLowerCase().split(/\s+/).join(" ");
  if (!validateMnemonic(normalized, wordlist)) {
    throw new SealedError("InvalidRecoveryPhrase", "not a valid BIP39 English phrase");
  }
  const seed = mnemonicToSeedSync(normalized, opts.passphrase ?? "");
  const secret = opts.derivationPath ? slip10Ed25519(seed, opts.derivationPath) : seed.slice(0, 32);
  return Keypair.fromSeed(secret);
}

export function keypairFromFile(json: string | number[]): Keypair {
  let arr: unknown;
  try {
    arr = typeof json === "string" ? JSON.parse(json) : json;
  } catch {
    throw new SealedError("InvalidKeyFile", "not JSON");
  }
  if (!Array.isArray(arr) || arr.length !== 64 || !arr.every((n) => Number.isInteger(n) && n >= 0 && n < 256)) {
    throw new SealedError("InvalidKeyFile", "expected a JSON array of 64 bytes");
  }
  try {
    return Keypair.fromSecretKey(Uint8Array.from(arr as number[]));
  } catch {
    throw new SealedError("InvalidKeyFile", "secret and public halves do not match");
  }
}

export function keypairToFile(kp: Keypair): string {
  return JSON.stringify(Array.from(kp.secretKey));
}
