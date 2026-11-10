#!/usr/bin/env bash
set -u
U=${RPC_URL:?set RPC_URL}
A=${SENDER_KEY:?set SENDER_KEY to a keypair file whose TEST account is sealed and funded}
B=${RECEIVER_KEY:?set RECEIVER_KEY to a keypair file whose TEST account is sealed}
T22=TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb
MINT=${MINT:-5n31rh6t9mgFYZRhoSb8k2xUcdCgmDL5BFZbjvkPLHif}
ST() { spl-token -u "$U" --program-id "$T22" "$@"; }
kind=${1:?usage: measure.sh sealed|public txs|bytes|cu|fee|secs}; metric=${2:?metric}
t0=$(date +%s.%N)
if [ "$kind" = sealed ]; then
  o=$(ST transfer --fee-payer "$A" --owner "$A" "$MINT" 1 "$(solana-keygen pubkey "$B")" --confidential 2>&1); rc=$?
  sigs=$(printf '%s\n' "$o" | grep -E '^  [a-z].*: [1-9A-HJ-NP-Za-km-z]{80,90}$' | awk '{print $NF}')
else
  o=$(solana -u "$U" -k "$A" transfer --allow-unfunded-recipient "$(solana-keygen pubkey "$B")" 0.001 2>&1); rc=$?
  sigs=$(printf '%s\n' "$o" | grep -oE 'Signature: [1-9A-HJ-NP-Za-km-z]{80,90}' | awk '{print $2}')
fi
t1=$(date +%s.%N)
[ $rc -eq 0 ] && [ -n "$sigs" ] || { printf '%s\n' "$o" | tail -3 >&2; echo "measure verdict=FAIL"; exit 1; }
python3 -I -c '
import base64, json, sys, time, urllib.request
u, metric, t0, t1, *sigs = sys.argv[1:]
def rpc(m, p):
    r = urllib.request.Request(u, data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": m, "params": p}).encode(), headers={"content-type": "application/json"})
    return json.load(urllib.request.urlopen(r, timeout=10))["result"]
tot = {"txs": 0, "bytes": 0, "cu": 0, "fee": 0}
for s in sigs:
    tx = None
    for _ in range(20):
        tx = rpc("getTransaction", [s, {"encoding": "base64", "maxSupportedTransactionVersion": 0, "commitment": "confirmed"}])
        if tx: break
        time.sleep(0.5)
    if not tx or tx["meta"]["err"] is not None:
        print("measure tx %s missing or failed" % s); sys.exit(1)
    tot["txs"] += 1; tot["bytes"] += len(base64.b64decode(tx["transaction"][0]))
    tot["cu"] += tx["meta"].get("computeUnitsConsumed") or 0; tot["fee"] += tx["meta"]["fee"]
tot["secs"] = round(float(t1) - float(t0), 3)
print("txs=%d bytes=%d cu=%d fee=%d secs=%.3f" % (tot["txs"], tot["bytes"], tot["cu"], tot["fee"], tot["secs"]))
print("value=%s" % tot[metric])
' "$U" "$metric" "$t0" "$t1" $sigs
