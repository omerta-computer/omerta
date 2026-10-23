export type TransferProofs = {
  equality: Uint8Array;
  validity: Uint8Array;
  range: Uint8Array;
  equalityContextLen: number;
  validityContextLen: number;
  rangeContextLen: number;
  auditorCiphertextLo: Uint8Array;
  auditorCiphertextHi: Uint8Array;
  newDecryptableAvailable: Uint8Array;
  newAvailable: bigint;
  ms: number;
};
