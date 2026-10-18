import { test } from "node:test";
import assert from "node:assert/strict";
import { Keypair, PublicKey } from "@solana/web3.js";
import { sha3_512 } from "@noble/hashes/sha3";
import { ed25519 } from "@noble/curves/ed25519";
import { zk } from "../src/zk.js";
import { STANDARD_DERIVATION_MESSAGE, deriveSealKeysLegacy, sealKeysFromSignature, deriveSealKeys, deriveSealKeysFromSigner, generateRecoveryPhrase, keypairFromRecoveryPhrase } from "../src/keys.js";

const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");

test("standard derivation matches solana-zk-sdk canonical vectors", () => {
  const k = sealKeysFromSignature(new Uint8Array(64).fill(0x42));
  assert.equal(hex(k.ae.toBytes()), "1b29778a3493dab218c24e87144be43d");
  assert.equal(hex(k.elgamal.secret().toBytes()), "716d2431fa74fc1c48ffb9b9972b0be2f0b29ab755081f2ea35d3c74f442190e");

  const seed = Uint8Array.from([0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff, 0x00,
    0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff, 0x00]);
  const w = deriveSealKeys(Keypair.fromSeed(seed));
  assert.equal(hex(w.ae.toBytes()), "6417eedbcbe9c64a72395719ec98cf6b");
  assert.equal(hex(w.elgamal.secret().toBytes()), "be5cce951f42a2a8677d1a56f03aae7bff795b38cf1c56c8cf3a4dae7d60e205");

  const sig = ed25519.sign(STANDARD_DERIVATION_MESSAGE, seed);
  const ck = zk.ConfidentialKeys.fromSignature(sig);
  assert.equal(hex(ck.ae().toBytes()), hex(w.ae.toBytes()));
  assert.equal(hex(ck.elgamal().pubkey().toBytes()), hex(w.elgamalPubkey));
});

test("signer variant equals keypair variant", async () => {
  const owner = Keypair.generate();
  const a = deriveSealKeys(owner);
  const b = await deriveSealKeysFromSigner(async (msg) => ed25519.sign(msg, owner.secretKey.slice(0, 32)));
  assert.equal(hex(a.elgamalPubkey), hex(b.elgamalPubkey));
  assert.equal(hex(a.ae.toBytes()), hex(b.ae.toBytes()));
});

test("legacy derivation follows the SHA3 KDF of solana-zk-sdk <= 4", () => {
  const L = 2n ** 252n + 27742317777372353535851937790883648493n;
  const le = (b: Uint8Array) => b.reduceRight((acc, x) => (acc << 8n) + BigInt(x), 0n);
  const owner = Keypair.fromSeed(new Uint8Array(32).fill(7));
  const acct = new PublicKey(new Uint8Array(32).fill(9));
  const k = deriveSealKeysLegacy(owner, acct);
  const sk = owner.secretKey.slice(0, 32);
  const egSig = ed25519.sign(Buffer.concat([Buffer.from("ElGamalSecretKey"), acct.toBuffer()]), sk);
  assert.equal(le(k.elgamal.secret().toBytes()), le(sha3_512(sha3_512(egSig))) % L);
});

test("AES round trip and keys differ per wallet", () => {
  const owner = Keypair.generate();
  const k1 = deriveSealKeys(owner);
  const k2 = deriveSealKeys(Keypair.generate());
  assert.notDeepEqual(Buffer.from(k1.elgamalPubkey), Buffer.from(k2.elgamalPubkey));
  const ct = k1.ae.encrypt(123456789n);
  assert.equal(ct.toBytes().length, 36);
  assert.equal(ct.decrypt(k1.ae), 123456789n);
});

test("recovery phrase: BIP39 vector, solana-keygen default and wallet path", () => {
  const phrase = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

  assert.equal(
    keypairFromRecoveryPhrase(phrase, { derivationPath: "m/44'/501'/0'/0'" }).publicKey.toBase58(),
    "HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk",
  );
  const p = generateRecoveryPhrase();
  assert.equal(p.split(" ").length, 12);
  assert.equal(keypairFromRecoveryPhrase(p).publicKey.toBase58(), keypairFromRecoveryPhrase(` ${p.toUpperCase()} `).publicKey.toBase58());
  assert.throws(() => keypairFromRecoveryPhrase("abandon abandon"), /InvalidRecoveryPhrase/);
});
