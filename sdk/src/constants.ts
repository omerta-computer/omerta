import { PublicKey } from "@solana/web3.js";

export const TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
export const ZK_ELGAMAL_PROOF_PROGRAM_ID = new PublicKey("ZkE1Gama1Proof11111111111111111111111111111");
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
export const SYSVAR_INSTRUCTIONS_ID = new PublicKey("Sysvar1nstructions1111111111111111111111111");

export const TRANSFER_AMOUNT_LO_BITS = 16;
export const TRANSFER_AMOUNT_HI_BITS = 32;
export const REMAINING_BALANCE_BIT_LENGTH = 64;
export const RANGE_PROOF_PADDING_BIT_LENGTH = 16;
export const MAX_TRANSFER_AMOUNT = (1n << 48n) - 1n;
export const DEFAULT_MAX_PENDING_CREDITS = 65536n;

export const TokenIx = {
  InitializeMint2: 20,
  MintToChecked: 14,
  ConfidentialTransferExtension: 27,
  Reallocate: 29,
} as const;

export const CtIx = {
  InitializeMint: 0,
  UpdateMint: 1,
  ConfigureAccount: 2,
  ApproveAccount: 3,
  EmptyAccount: 4,
  Deposit: 5,
  Withdraw: 6,
  Transfer: 7,
  ApplyPendingBalance: 8,
  EnableConfidentialCredits: 9,
  DisableConfidentialCredits: 10,
  EnableNonConfidentialCredits: 11,
  DisableNonConfidentialCredits: 12,
  TransferWithFee: 13,
  ConfigureAccountWithRegistry: 14,
} as const;

export const ProofIx = {
  CloseContextState: 0,
  VerifyZeroCiphertext: 1,
  VerifyCiphertextCiphertextEquality: 2,
  VerifyCiphertextCommitmentEquality: 3,
  VerifyPubkeyValidity: 4,
  VerifyPercentageWithCap: 5,
  VerifyBatchedRangeProofU64: 6,
  VerifyBatchedRangeProofU128: 7,
  VerifyBatchedRangeProofU256: 8,
  VerifyGroupedCiphertext2HandlesValidity: 9,
  VerifyBatchedGroupedCiphertext2HandlesValidity: 10,
  VerifyGroupedCiphertext3HandlesValidity: 11,
  VerifyBatchedGroupedCiphertext3HandlesValidity: 12,
} as const;
export type ProofKind = keyof typeof ProofIx;

export const ExtensionType = {
  ConfidentialTransferMint: 4,
  ConfidentialTransferAccount: 5,
  ImmutableOwner: 7,
} as const;
