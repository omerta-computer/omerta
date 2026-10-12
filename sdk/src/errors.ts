export type SealedErrorCode =
  | "InvalidRecoveryPhrase"
  | "InvalidKeyFile"
  | "AlreadySealed"
  | "NotSealed"
  | "PendingChanged"
  | "InsufficientSealedBalance"
  | "AmountTooLarge"
  | "DestinationNotSealed"
  | "BalanceChanged"
  | "TransferStepFailed"
  | "TransactionFailed"
  | "ConfirmTimeout"
  | "RpcError"
  | "DecryptFailed"
  | "InvalidProof";

export class SealedError extends Error {
  readonly code: SealedErrorCode;
  readonly details: Record<string, unknown>;
  constructor(code: SealedErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(`${code}: ${message}`);
    this.name = "SealedError";
    this.code = code;
    this.details = details;
  }
}
