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
