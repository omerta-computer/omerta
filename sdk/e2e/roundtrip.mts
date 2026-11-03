import { Buffer } from "buffer";

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import * as s from "../src/index.js";

const arg = (k: string, d?: string) => {
  const i = process.argv.indexOf(`--${k}`);
  if (i > 0) return process.argv[i + 1];
  if (d !== undefined) return d;
  throw new Error(`missing --${k}`);
};
const RPC = arg("rpc");
const CLI = arg("cli");
const KEYS = arg("keys");
const OUT = arg("out");
const MINT_ARG = arg("mint");
mkdirSync(join(OUT, "sdk"), { recursive: true });
const LOG = join(OUT, "sdk", "roundtrip.log");
writeFileSync(LOG, "");
const log = (m: string) => {
  const line = `${new Date().toISOString()} ${m}`;
  console.log(line);
  appendFileSync(LOG, line + "\n");
};

function keyFile(name: string): string {
  const f = join(KEYS, `omerta-sdk-e2e-${name}.json`);
  if (!existsSync(f)) execFileSync("solana-keygen", ["new", "--no-bip39-passphrase", "--silent", "--outfile", f], { stdio: "ignore" });
  return f;
}
const load = (f: string) => s.keypairFromFile(readFileSync(f, "utf8"));
const cli = (...a: string[]) => {
  const out = execFileSync(CLI, ["--url", RPC, ...a], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return out.trim();
};
const ui = (base: bigint, dec = 6) => `${base / 10n ** BigInt(dec)}.${(base % 10n ** BigInt(dec)).toString().padStart(dec, "0")}`;
const t = () => performance.now();

const result: Record<string, unknown> = { startedAt: new Date().toISOString(), steps: [] as unknown[] };
const step = (name: string, data: Record<string, unknown>) => {
  (result.steps as unknown[]).push({ name, ...data });
  log(`${name} ${JSON.stringify(data, (_, v) => (typeof v === "bigint" ? v.toString() : v))}`);
};

async function airdropIfLow(c: Connection, pk: PublicKey) {
  const bal = await c.getBalance(pk, "confirmed");
  if (bal >= 2 * LAMPORTS_PER_SOL) return;
  const sig = await c.requestAirdrop(pk, 10 * LAMPORTS_PER_SOL);
  const { lastValidBlockHeight } = await c.getLatestBlockhash("confirmed");
  await s.confirmByPolling(c, sig, lastValidBlockHeight, null);
}

async function main() {
  const c = new Connection(RPC, "confirmed");
  const fA = keyFile("a"), fB = keyFile("b");
  const A = load(fA), B = load(fB);
  log(`A=${A.publicKey.toBase58()} B=${B.publicKey.toBase58()} genesis=${await c.getGenesisHash()}`);
  const va = await c.getVoteAccounts();
  result.voteAccountsAtRun = `${va.current.length} current, ${va.delinquent.length} delinquent`;
  result.genesis = await c.getGenesisHash();
  await airdropIfLow(c, A.publicKey);
  await airdropIfLow(c, B.publicKey);

  const mint = new PublicKey(MINT_ARG);
  step("mint", { mint: mint.toBase58() });

  let t0 = t();
  const sa = await s.createSealedAccount({ connection: c, payer: A, owner: A, mint });
  step("sdk.createSealedAccount", { account: sa.tokenAccount.toBase58(), sig: sa.signature, bytes: sa.bytes, ms: Math.round(t() - t0) });
  cli("create-account", mint.toBase58(), "--owner", fB, "--fee-payer", fB);
  cli("configure-confidential-transfer-account", "--owner", fB, "--fee-payer", fB, mint.toBase58());
  cli("disable-non-confidential-credits", "--owner", fB, "--fee-payer", fB, mint.toBase58());
  const bAcct = s.sealedTokenAccountAddress(B.publicKey, mint);
  const bView = await s.readSealedAccount(c, bAcct);
  const bKeysSdk = s.deriveSealKeys(B);
  const keysMatch = bView?.sealed?.elgamalPubkey === Buffer.from(bKeysSdk.elgamalPubkey).toString("base64");
  step("cli.seal B", { account: bAcct.toBase58(), sdkDerivedKeyMatchesCli: keysMatch, nonConfidentialCredits: bView?.sealed?.allowNonConfidentialCredits });
  if (!keysMatch) throw new Error("FAIL: SDK-derived ElGamal key differs from the CLI's");

  const amt1 = 12_345_678n;
  const progress: unknown[] = [];
  t0 = t();
  const tr = await s.sealedTransfer({ connection: c, payer: A, owner: A, source: sa.tokenAccount, destination: bAcct, amount: amt1, keys: sa.keys, onProgress: (e) => progress.push(e) });
  step("sdk.sealedTransfer A->B", { sig: tr.signature, txCount: tr.signatures.length, proofMs: tr.proofMs, totalMs: Math.round(t() - t0), progress });

  const valSig = tr.plan.done.find((d) => d.stage === "validity")!.signature;
  const valTx = await c.getTransaction(valSig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
  const trTx = await c.getTransaction(tr.signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
  const names = s.decodeSealedInstructions(trTx!).map((d) => d.name);
  const asDst = s.decryptTransferAmount({ validityTx: valTx!, keys: bKeysSdk, role: "destination" });
  const asSrc = s.decryptTransferAmount({ validityTx: valTx!, keys: sa.keys, role: "source" });
  const asOther = s.decryptTransferAmount({ validityTx: valTx!, keys: s.deriveSealKeys(Keypair.generate()), role: "destination" });
  const okDecode = names[0] === "ConfidentialTransfer.Transfer" && asDst === amt1 && asSrc === amt1 && asOther === null;
  step("decode+decryptTransferAmount", { names, asDst, asSrc, asOther, ok: okDecode });

  let failedPlan: s.TransferPlan | null = null;
  try {
    await s.sealedTransfer({ connection: c, payer: A, owner: A, source: sa.tokenAccount, destination: bAcct, amount: 1000n, keys: sa.keys,
      onProgress: (e) => { if (e.stage === "equality" && e.status === "confirmed") throw new Error("simulated drop"); } });
  } catch (e) {
    failedPlan = (e as s.SealedError).details?.plan as s.TransferPlan;
  }
  const doneBeforeResume = failedPlan?.done.length ?? -1;
  const resumed = await s.resumeTransfer({ connection: c, payer: A, owner: A, plan: failedPlan! });

  let plan2: s.TransferPlan | null = null;
  try {
    await s.sealedTransfer({ connection: c, payer: A, owner: A, source: sa.tokenAccount, destination: bAcct, amount: 1000n, keys: sa.keys,
      onProgress: (e) => { if (e.stage === "validity" && e.status === "confirmed") throw new Error("simulated drop"); } });
  } catch (e) {
    plan2 = (e as s.SealedError).details?.plan as s.TransferPlan;
  }
  const cleaned = await s.cleanupTransfer({ connection: c, payer: A, plan: plan2! });
  const left = await Promise.all(Object.values(plan2!.context).map((a) => c.getAccountInfo(new PublicKey(a), "confirmed")));
  const okResume = !!failedPlan && doneBeforeResume === 1 && !!resumed.signature && cleaned.length >= 1 && left.every((x) => x === null);
  step("resume+cleanup", { resumedSig: resumed.signature, resumedTx: resumed.signatures.length, cleanupTx: cleaned.length, contextLeft: left.filter(Boolean).length, ok: okResume });
  const amtExtra = 1000n;

  cli("apply-pending-balance", "--owner", fB, "--fee-payer", fB, mint.toBase58());
  const bBal = cli("balance", mint.toBase58(), "--owner", fB, "--decrypt");
  const bSdk = await s.decryptBalances({ connection: c, tokenAccount: bAcct, keys: bKeysSdk });
  const ok1 = bBal.includes(ui(amt1 + amtExtra).replace(/0+$/, "")) && bSdk.available === amt1 + amtExtra && okDecode && okResume;
  step("cli reads B", { cli: bBal.replace(/\n/g, " | "), sdkAvailable: bSdk.available, ok: ok1 });

  const amt2 = 1_500_000n;
  t0 = t();
  const cliOut = cli("transfer", mint.toBase58(), ui(amt2), A.publicKey.toBase58(), "--confidential", "--owner", fB, "--fee-payer", fB);
  step("cli.transfer B->A --confidential", { ms: Math.round(t() - t0), out: cliOut.split("\n").slice(-3).join(" | ") });
  const ap2 = await s.applyPending({ connection: c, payer: A, owner: A, tokenAccount: sa.tokenAccount, keys: sa.keys });
  const aBal = await s.decryptBalances({ connection: c, tokenAccount: sa.tokenAccount, keys: sa.keys });
  const aCli = cli("balance", mint.toBase58(), "--owner", fA, "--decrypt");
  const ok2 = ap2.applied === amt2;
  step("sdk reads A", { applied: ap2.applied, available: aBal.available, cli: aCli.replace(/\n/g, " | "), ok: ok2 });

  let refused = "";
  try {
    cli("transfer", mint.toBase58(), "0.000001", A.publicKey.toBase58(), "--owner", fB, "--fee-payer", fB);
  } catch (e) {
    refused = String((e as { stderr?: string }).stderr ?? e).split("\n").filter((l) => l.trim()).filter((l) => /0x31|NonConfidential|custom program error|Error/i.test(l)).slice(-2).join(" | ") || "refused (no error text)";
  }
  step("public transfer to sealed account", { refused });

  const allOk = ok1 && ok2 && keysMatch && /0x31|NonConfidential/i.test(refused);
  result.finishedAt = new Date().toISOString();
  result.verdict = allOk ? "PASS" : "FAIL";
  writeFileSync(join(OUT, "sdk", "roundtrip.json"), JSON.stringify(result, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2));
  log(`roundtrip verdict=${result.verdict}`);
  process.exit(allOk ? 0 : 1);
}

main().catch((e) => {
  log(`roundtrip ERROR ${e?.message ?? e} ${JSON.stringify(e?.details ?? {}, (_, v) => (typeof v === "bigint" ? v.toString() : v)).slice(0, 2000)}`);
  process.exit(1);
});
