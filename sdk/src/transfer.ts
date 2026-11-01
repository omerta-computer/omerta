import { Buffer } from "buffer";
import { Connection, Keypair, PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import { ZK_ELGAMAL_PROOF_PROGRAM_ID } from "./constants.js";
import { SealedError, isSealedError } from "./errors.js";
import { deriveSealKeys, type SealKeys } from "./keys.js";
import { contextStateSize, ixCloseContextState, ixTransfer, ixVerifyProof } from "./instructions.js";
import { fetchMint, fetchTokenAccount } from "./account.js";
import { decryptAvailable, generateTransferProofs } from "./proofs.js";
import { sendInstructions, type SendOptions } from "./rpc.js";

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
const unb64 = (s: string) => new Uint8Array(Buffer.from(s, "base64"));
const STEPS: TransferStage[] = ["equality", "validity", "range", "transfer"];
const TOTAL = STEPS.length + 1;

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

async function contextVerified(connection: Connection, address: PublicKey, authority: PublicKey): Promise<"missing" | "allocated" | "verified"> {
  const info = await connection.getAccountInfo(address, "confirmed");
  if (!info || info.lamports === 0) return "missing";
  if (!info.owner.equals(ZK_ELGAMAL_PROOF_PROGRAM_ID)) return "missing";
  const d = new Uint8Array(info.data);
  return d.length >= 32 && Buffer.compare(Buffer.from(d.subarray(0, 32)), authority.toBuffer()) === 0 ? "verified" : "allocated";
}

async function runPlan(p: {
  connection: Connection;
  payer: Keypair;
  owner: Keypair;
  plan: TransferPlan;
  onProgress?: (e: TransferProgress) => void;
  send?: SendOptions;
}): Promise<TransferResult> {
  const { connection, payer, owner, plan } = p;
  if (plan.payer !== payer.publicKey.toBase58()) throw new SealedError("TransferStepFailed", "plan was made with another payer");
  const ctxKp = {
    equality: Keypair.fromSecretKey(unb64(plan.contextSecrets.equality)),
    validity: Keypair.fromSecretKey(unb64(plan.contextSecrets.validity)),
    range: Keypair.fromSecretKey(unb64(plan.contextSecrets.range)),
  };
  const authority = payer.publicKey;
  const rent = async (len: number) => connection.getMinimumBalanceForRentExemption(contextStateSize(len));
  const create = async (kp: Keypair, len: number): Promise<TransactionInstruction> =>
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: kp.publicKey,
      lamports: await rent(len),
      space: contextStateSize(len),
      programId: ZK_ELGAMAL_PROOF_PROGRAM_ID,
    });
  const ctxInfo = (kp: Keypair) => ({ account: kp.publicKey, authority });
  const isDone = (s: TransferStage) => plan.done.some((d) => d.stage === s);

  const steps: Record<Exclude<TransferStage, "proofs" | "cleanup">, () => Promise<{ ixs: TransactionInstruction[]; signers: Keypair[] } | null>> = {
    equality: async () => {
      const [eq, rg] = await Promise.all([
        contextVerified(connection, ctxKp.equality.publicKey, authority),
        contextVerified(connection, ctxKp.range.publicKey, authority),
      ]);
      if (eq === "verified" && rg !== "missing") return null;
      if (eq === "allocated") throw new SealedError("TransferStepFailed", "equality context allocated but not verified");
      const ixs = [await create(ctxKp.equality, plan.proofs.eqLen)];
      const signers = [ctxKp.equality];
      if (rg === "missing") {
        ixs.push(await create(ctxKp.range, plan.proofs.rangeLen));
        signers.push(ctxKp.range);
      }
      ixs.push(ixVerifyProof("VerifyCiphertextCommitmentEquality", unb64(plan.proofs.equality), ctxInfo(ctxKp.equality)));
      return { ixs, signers };
    },
    validity: async () => {
      const st = await contextVerified(connection, ctxKp.validity.publicKey, authority);
      if (st === "verified") return null;
      if (st === "allocated") throw new SealedError("TransferStepFailed", "validity context allocated but not verified");
      return {
        ixs: [
          await create(ctxKp.validity, plan.proofs.valLen),
          ixVerifyProof("VerifyBatchedGroupedCiphertext3HandlesValidity", unb64(plan.proofs.validity), ctxInfo(ctxKp.validity)),
        ],
        signers: [ctxKp.validity],
      };
    },
    range: async () => {
      const st = await contextVerified(connection, ctxKp.range.publicKey, authority);
      if (st === "verified") return null;
      if (st === "missing") throw new SealedError("TransferStepFailed", "range context missing");
      return { ixs: [ixVerifyProof("VerifyBatchedRangeProofU128", unb64(plan.proofs.range), ctxInfo(ctxKp.range))], signers: [] };
    },
    transfer: async () => {
      const src = await fetchTokenAccount(connection, new PublicKey(plan.source));
      const sc = src?.state.confidential;
      if (!sc) throw new SealedError("NotSealed", "source vanished");
      if (b64(sc.available) !== plan.sourceAvailableCiphertext) {
        throw new SealedError("BalanceChanged", "the source balance changed since the proofs were built; clean up and start again", { plan });
      }
      return {
        ixs: [
          ixTransfer({
            source: new PublicKey(plan.source),
            mint: new PublicKey(plan.mint),
            destination: new PublicKey(plan.destination),
            owner: owner.publicKey,
            newSourceDecryptableAvailableBalance: unb64(plan.transferData.newDecryptable),
            auditorCiphertextLo: unb64(plan.transferData.auditorLo),
            auditorCiphertextHi: unb64(plan.transferData.auditorHi),
            equality: { contextState: ctxKp.equality.publicKey },
            validity: { contextState: ctxKp.validity.publicKey },
            range: { contextState: ctxKp.range.publicKey },
          }),
          ixCloseContextState(ctxKp.equality.publicKey, payer.publicKey, authority),
          ixCloseContextState(ctxKp.validity.publicKey, payer.publicKey, authority),
          ixCloseContextState(ctxKp.range.publicKey, payer.publicKey, authority),
        ],
        signers: [owner],
      };
    },
  };

  for (const [i, stage] of STEPS.entries()) {
    if (isDone(stage)) continue;
    const step = i + 2;
    p.onProgress?.({ step, total: TOTAL, stage, status: "start" });
    const t = now();
    let built;
    try {
      built = await steps[stage as keyof typeof steps]();
    } catch (e) {
      if (isSealedError(e, "BalanceChanged")) throw e;
      throw new SealedError("TransferStepFailed", `step ${stage}: ${(e as Error).message}`, { plan, stage, cause: e });
    }
    if (!built) {
      plan.done.push({ stage, signature: "", bytes: 0 });
      p.onProgress?.({ step, total: TOTAL, stage, status: "confirmed", ms: 0 });
      continue;
    }
    try {
      const r = await sendInstructions(connection, built.ixs, payer, built.signers, p.send);
      plan.done.push({ stage, signature: r.signature, bytes: r.bytes });
      p.onProgress?.({ step, total: TOTAL, stage, status: "confirmed", signature: r.signature, ms: Math.round(now() - t), bytes: r.bytes });
    } catch (e) {
      throw new SealedError("TransferStepFailed", `step ${stage}: ${(e as Error).message}`, { plan, stage, cause: e });
    }
  }
  const sigs = plan.done.map((d) => d.signature).filter(Boolean);
  return {
    signature: plan.done.find((d) => d.stage === "transfer")?.signature ?? "",
    signatures: sigs,
    proofMs: plan.proofMs,
    newAvailable: BigInt(plan.newAvailable),
    plan,
  };
}
