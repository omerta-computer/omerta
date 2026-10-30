import { Buffer } from "buffer";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { SealedError } from "./errors.js";
import { deriveSealKeys, type SealKeys } from "./keys.js";
import { fetchMint, fetchTokenAccount } from "./account.js";
import { decryptAvailable, generateTransferProofs } from "./proofs.js";

export type TransferMode = "context-state";
export type TransferStage = "proofs" | "equality" | "validity" | "range" | "transfer" | "cleanup";

export type TransferProgress = {
  step: number;
  total: number;
  stage: TransferStage;
  status: "start" | "sent" | "confirmed";
  signature?: string;
  ms?: number;
  bytes?: number;
};

export type TransferPlan = {
  v: 1;
  id: string;
  source: string;
  destination: string;
  mint: string;
  payer: string;
  amount: string;
  sourceAvailableCiphertext: string;
  context: { equality: string; validity: string; range: string };
  contextSecrets: { equality: string; validity: string; range: string };
  proofs: { equality: string; validity: string; range: string; eqLen: number; valLen: number; rangeLen: number };
  transferData: { newDecryptable: string; auditorLo: string; auditorHi: string };
  newAvailable: string;
  proofMs: number;
  done: { stage: TransferStage; signature: string; bytes: number }[];
};

export type TransferResult = {
  signature: string;
  signatures: string[];
  proofMs: number;
  newAvailable: bigint;
  plan: TransferPlan;
};

const b64 = (b: Uint8Array) => Buffer.from(b).toString("base64");

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

export async function planTransfer(p: {
  connection: Connection;
  payer: Keypair;
  owner: Keypair;
  source: PublicKey;
  destination: PublicKey;
  amount: bigint;
  keys?: SealKeys;
}): Promise<TransferPlan> {
  const keys = p.keys ?? deriveSealKeys(p.owner);
  const [src, dst] = await Promise.all([fetchTokenAccount(p.connection, p.source), fetchTokenAccount(p.connection, p.destination)]);
  const sc = src?.state.confidential;
  if (!src || !sc) throw new SealedError("NotSealed", `source ${p.source.toBase58()} is not a sealed account`);
  if (!src.state.owner.equals(p.owner.publicKey)) throw new SealedError("NotSealed", "source is not owned by this owner");
  const dc = dst?.state.confidential;
  if (!dst || !dc || !dc.approved || !dc.allowConfidentialCredits) {
    throw new SealedError("DestinationNotSealed", `destination ${p.destination.toBase58()} cannot receive sealed transfers`);
  }
  if (!dst.state.mint.equals(src.state.mint)) throw new SealedError("DestinationNotSealed", "destination is for another mint");
  if (Buffer.compare(Buffer.from(sc.elgamalPubkey), Buffer.from(keys.elgamalPubkey)) !== 0) {
    throw new SealedError("NotSealed", "these keys do not open the source account (wrong derivation or owner)");
  }
  const mint = await fetchMint(p.connection, src.state.mint);
  const available = decryptAvailable(keys, sc.decryptableAvailable);
  const proofs = generateTransferProofs({
    keys,
    currentAvailableCiphertext: sc.available,
    currentAvailable: available,
    amount: p.amount,
    destinationElGamalPubkey: dc.elgamalPubkey,
    auditorElGamalPubkey: mint.confidential?.auditorElGamalPubkey ?? null,
  });
  const ctx = { equality: Keypair.generate(), validity: Keypair.generate(), range: Keypair.generate() };
  return {
    v: 1,
    id: `${Date.now().toString(36)}-${ctx.equality.publicKey.toBase58().slice(0, 8)}`,
    source: p.source.toBase58(),
    destination: p.destination.toBase58(),
    mint: src.state.mint.toBase58(),
    payer: p.payer.publicKey.toBase58(),
    amount: p.amount.toString(),
    sourceAvailableCiphertext: b64(sc.available),
    context: {
      equality: ctx.equality.publicKey.toBase58(),
      validity: ctx.validity.publicKey.toBase58(),
      range: ctx.range.publicKey.toBase58(),
    },
    contextSecrets: { equality: b64(ctx.equality.secretKey), validity: b64(ctx.validity.secretKey), range: b64(ctx.range.secretKey) },
    proofs: {
      equality: b64(proofs.equality),
      validity: b64(proofs.validity),
      range: b64(proofs.range),
      eqLen: proofs.equalityContextLen,
      valLen: proofs.validityContextLen,
      rangeLen: proofs.rangeContextLen,
    },
    transferData: {
      newDecryptable: b64(proofs.newDecryptableAvailable),
      auditorLo: b64(proofs.auditorCiphertextLo),
      auditorHi: b64(proofs.auditorCiphertextHi),
    },
    newAvailable: proofs.newAvailable.toString(),
    proofMs: proofs.ms,
    done: [],
  };
}
