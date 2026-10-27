import { test } from "node:test";
import assert from "node:assert/strict";
import { Keypair } from "@solana/web3.js";
import { zk } from "../src/zk.js";
import { deriveSealKeys } from "../src/keys.js";
import { generateTransferProofs, verifyTransferProofs, decryptAvailable } from "../src/proofs.js";

const src = deriveSealKeys(Keypair.generate());
const dst = deriveSealKeys(Keypair.generate());

test("transfer proofs verify in WASM and sizes are as expected", () => {
  const balance = 5_000_000_000n;
  const opening = new zk.PedersenOpening();
  const avail = src.elgamal.pubkey().encryptWith(balance, opening).toBytes();
  const amount = 1_234_567n;
  const p = generateTransferProofs({
    keys: src,
    currentAvailableCiphertext: avail,
    currentAvailable: balance,
    amount,
    destinationElGamalPubkey: dst.elgamalPubkey,
  });
  verifyTransferProofs(p);
  assert.equal(p.newAvailable, balance - amount);
  assert.equal(decryptAvailable(src, p.newDecryptableAvailable), balance - amount);
  assert.equal(p.auditorCiphertextLo.length, 64);
  console.log(
    `sizes equality=${p.equality.length}/${p.equalityContextLen} validity=${p.validity.length}/${p.validityContextLen} range=${p.range.length}/${p.rangeContextLen} ms=${p.ms}`,
  );
});

test("insufficient balance is refused before proving", () => {
  assert.throws(
    () =>
      generateTransferProofs({
        keys: src,
        currentAvailableCiphertext: new Uint8Array(64),
        currentAvailable: 10n,
        amount: 11n,
        destinationElGamalPubkey: dst.elgamalPubkey,
      }),
    /InsufficientSealedBalance/,
  );
});
