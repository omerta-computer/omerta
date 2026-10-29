import { Commitment, Connection, Keypair, Transaction, TransactionInstruction } from "@solana/web3.js";
import { SealedError } from "./errors.js";
import { TokenErrorNames } from "./constants.js";

export type SendOptions = {
  commitment?: Commitment;
  timeoutMs?: number;
  pollMs?: number;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function sendInstructions(
  connection: Connection,
  instructions: TransactionInstruction[],
  feePayer: Keypair,
  signers: Keypair[],
  opts: SendOptions = {},
): Promise<{ signature: string; bytes: number; slot: number }> {
  const commitment = opts.commitment ?? "confirmed";
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash(commitment);
  const tx = new Transaction({ feePayer: feePayer.publicKey, blockhash, lastValidBlockHeight }).add(...instructions);
  const uniq = new Map<string, Keypair>();
  for (const s of [feePayer, ...signers]) uniq.set(s.publicKey.toBase58(), s);
  tx.sign(...uniq.values());
  const raw = tx.serialize();
  let signature: string;
  try {
    signature = await connection.sendRawTransaction(raw, { skipPreflight: false, preflightCommitment: commitment, maxRetries: 0 });
  } catch (e) {
    throw toTxError(e);
  }
  const slot = await confirmByPolling(connection, signature, lastValidBlockHeight, raw, opts);
  return { signature, bytes: raw.length, slot };
}

export async function confirmByPolling(
  connection: Connection,
  signature: string,
  lastValidBlockHeight: number,
  raw: Uint8Array | null,
  opts: SendOptions = {},
): Promise<number> {
  const commitment = opts.commitment ?? "confirmed";
  const deadline = Date.now() + (opts.timeoutMs ?? 60_000);
  const poll = opts.pollMs ?? 400;
  let resendAt = Date.now() + 2_000;
  for (;;) {
    const { value } = await connection.getSignatureStatuses([signature], { searchTransactionHistory: false });
    const st = value[0];
    if (st) {
      if (st.err) {
        const tx = await connection
          .getTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 })
          .catch(() => null);
        throw new SealedError("TransactionFailed", describeErr(st.err), { signature, err: st.err, logs: tx?.meta?.logMessages ?? [] });
      }
      const ok =
        commitment === "processed" ||
        (commitment === "confirmed" && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) ||
        st.confirmationStatus === "finalized";
      if (ok) return st.slot;
    } else {
      const height = await connection.getBlockHeight(commitment).catch(() => 0);
      if (height > lastValidBlockHeight) {
        throw new SealedError("ConfirmTimeout", "blockhash expired before the transaction was seen", { signature });
      }
      if (raw && Date.now() > resendAt) {
        resendAt = Date.now() + 2_000;
        await connection.sendRawTransaction(raw, { skipPreflight: true, maxRetries: 0 }).catch(() => undefined);
      }
    }
    if (Date.now() > deadline) throw new SealedError("ConfirmTimeout", "not confirmed in time", { signature });
    await sleep(poll);
  }
}

function describeErr(err: unknown): string {
  const ie = (err as { InstructionError?: [number, unknown] })?.InstructionError;
  if (ie) {
    const [idx, inner] = ie;
    const custom = (inner as { Custom?: number })?.Custom;
    if (typeof custom === "number") {
      const name = TokenErrorNames[custom];
      return `instruction ${idx}: custom program error 0x${custom.toString(16)}${name ? ` (${name})` : ""}`;
    }
    return `instruction ${idx}: ${JSON.stringify(inner)}`;
  }
  return JSON.stringify(err);
}

function toTxError(e: unknown): SealedError {
  const any = e as { message?: string; logs?: string[]; transactionLogs?: string[] };
  const logs = any.logs ?? any.transactionLogs ?? [];
  const msg = any.message ?? String(e);
  const m = /custom program error: (0x[0-9a-f]+)/i.exec(msg + logs.join("\n"));
  const name = m ? TokenErrorNames[parseInt(m[1], 16)] : undefined;
  return new SealedError("TransactionFailed", name ? `${msg} (${name})` : msg, { logs });
}
