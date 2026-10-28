import { Commitment } from "@solana/web3.js";

export type SendOptions = {
  commitment?: Commitment;
  timeoutMs?: number;
  pollMs?: number;
};
