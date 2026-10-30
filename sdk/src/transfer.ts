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
