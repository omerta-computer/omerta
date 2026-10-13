import * as zk from "@solana/zk-sdk";

export { zk };

let initialized = false;

export async function ready(opts: { wasmUrl?: string | URL } = {}): Promise<void> {
  if (initialized) return;
  const init = (zk as unknown as { default?: unknown }).default;
  if (typeof init === "function") {
    await (init as (o: unknown) => Promise<unknown>)(opts.wasmUrl ? { module_or_path: opts.wasmUrl } : undefined);
  }
  const o = new zk.PedersenOpening();
  o.free();
  initialized = true;
}
