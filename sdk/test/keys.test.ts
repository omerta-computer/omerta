import { test } from "node:test";
import assert from "node:assert/strict";
import { Keypair } from "@solana/web3.js";
import { ed25519 } from "@noble/curves/ed25519";
import { zk } from "../src/zk.js";
import { STANDARD_DERIVATION_MESSAGE, sealKeysFromSignature, deriveSealKeys, deriveSealKeysFromSigner } from "../src/keys.js";

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
