import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "./constants.js";
import { SealedError } from "./errors.js";
import { parseMint, parseTokenAccount, type MintState, type TokenAccountState } from "./layout.js";

export async function fetchTokenAccount(
  connection: Connection,
  address: PublicKey,
  minContextSlot?: number,
): Promise<{ state: TokenAccountState; slot: number } | null> {
  const res = await connection.getAccountInfoAndContext(address, { commitment: "confirmed", minContextSlot });
  if (!res.value) return null;
  if (!res.value.owner.equals(TOKEN_2022_PROGRAM_ID)) return null;
  return { state: parseTokenAccount(new Uint8Array(res.value.data)), slot: res.context.slot };
}

export async function fetchMint(connection: Connection, mint: PublicKey): Promise<MintState> {
  const info = await connection.getAccountInfo(mint, "confirmed");
  if (!info || !info.owner.equals(TOKEN_2022_PROGRAM_ID)) throw new SealedError("NotSealed", `mint ${mint.toBase58()} not found`);
  return parseMint(new Uint8Array(info.data));
}
