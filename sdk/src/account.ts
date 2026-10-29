import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "./constants.js";
import { parseTokenAccount, type TokenAccountState } from "./layout.js";

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
