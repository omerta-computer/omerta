const zk = require('@solana/zk-sdk');
const now = () => performance.now();
function once() {
  const src = new zk.ElGamalKeypair(), dst = new zk.ElGamalKeypair(), aud = new zk.ElGamalKeypair();
  const amount = 123456789n, lo = amount & 0xffffn, hi = amount >> 16n, newBal = 876543211n;
  const oLo = new zk.PedersenOpening(), oHi = new zk.PedersenOpening(), oBal = new zk.PedersenOpening(), oPad = new zk.PedersenOpening();
  const t0 = now();
  const ct = src.pubkey().encryptU64(newBal);
  const cBal = zk.PedersenCommitment.from(newBal, oBal);
  const eq = new zk.CiphertextCommitmentEqualityProofData(src, ct, cBal, oBal, newBal);
  const t1 = now();
  const gLo = zk.GroupedElGamalCiphertext3Handles.encryptWith(src.pubkey(), dst.pubkey(), aud.pubkey(), lo, oLo);
  const gHi = zk.GroupedElGamalCiphertext3Handles.encryptWith(src.pubkey(), dst.pubkey(), aud.pubkey(), hi, oHi);
  const val = new zk.BatchedGroupedCiphertext3HandlesValidityProofData(src.pubkey(), dst.pubkey(), aud.pubkey(), gLo, gHi, lo, hi, oLo, oHi);
  const t2 = now();
  const cLo = zk.PedersenCommitment.from(lo, oLo), cHi = zk.PedersenCommitment.from(hi, oHi), cPad = zk.PedersenCommitment.from(0n, oPad);
  const rp = new zk.BatchedRangeProofU128Data([cBal, cLo, cHi, cPad], BigUint64Array.from([newBal, lo, hi, 0n]), Uint8Array.from([64, 16, 32, 16]), [oBal, oLo, oHi, oPad]);
  const t3 = now();
  eq.verify(); val.verify(); rp.verify();
  const t4 = now();
  return { equality: t1 - t0, validity: t2 - t1, range: t3 - t2, verify3: t4 - t3, total_prove: t3 - t0,
           bytes: eq.toBytes().length + val.toBytes().length + rp.toBytes().length };
}
const n = Number(process.argv[2] || 20);
once();
const runs = Array.from({ length: n }, once);
const med = (k) => { const v = runs.map((r) => r[k]).sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; };
console.log(JSON.stringify({ runs: n, ms_median: { equality: +med('equality').toFixed(2), validity: +med('validity').toFixed(2), range: +med('range').toFixed(2),
  prove_total: +med('total_prove').toFixed(2), verify_all3: +med('verify3').toFixed(2) }, proof_bytes: runs[0].bytes, node: process.version }));
