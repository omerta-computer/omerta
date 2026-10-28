import { Commitment } from "@solana/web3.js";
import { SealedError } from "./errors.js";
import { TokenErrorNames } from "./constants.js";

export type SendOptions = {
  commitment?: Commitment;
  timeoutMs?: number;
  pollMs?: number;
};

function toTxError(e: unknown): SealedError {
  const any = e as { message?: string; logs?: string[]; transactionLogs?: string[] };
  const logs = any.logs ?? any.transactionLogs ?? [];
  const msg = any.message ?? String(e);
  const m = /custom program error: (0x[0-9a-f]+)/i.exec(msg + logs.join("\n"));
  const name = m ? TokenErrorNames[parseInt(m[1], 16)] : undefined;
  return new SealedError("TransactionFailed", name ? `${msg} (${name})` : msg, { logs });
}
