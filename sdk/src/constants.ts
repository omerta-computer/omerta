import { PublicKey } from "@solana/web3.js";

export const TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
export const ZK_ELGAMAL_PROOF_PROGRAM_ID = new PublicKey("ZkE1Gama1Proof11111111111111111111111111111");
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
export const SYSVAR_INSTRUCTIONS_ID = new PublicKey("Sysvar1nstructions1111111111111111111111111");

export const TRANSFER_AMOUNT_LO_BITS = 16;
export const TRANSFER_AMOUNT_HI_BITS = 32;
export const MAX_TRANSFER_AMOUNT = (1n << 48n) - 1n;
