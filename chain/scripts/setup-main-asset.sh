#!/usr/bin/env bash
set -u
U=${RPC_URL:?set RPC_URL}
MINTK=${1:?usage: setup-main-asset.sh <mint-keypair.json> <reserve-owner-keypair.json> <out.json>}
FK=${2:?reserve owner keypair}
OUTJ=${3:?output record}
T22=TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb
SPL=${SPL_TOKEN:-spl-token}
SUPPLY=${TEST_SUPPLY:-1000000000}
GAS_RESERVE_LAMPORTS=${GAS_RESERVE_LAMPORTS:-500000000000000}
MINT=$(solana-keygen pubkey "$MINTK"); FA=$(solana-keygen pubkey "$FK")
OUT=${OUTJ%.json}.log; : > "$OUT"
steps=(); fail=0
st() { local name=$1; shift; echo "+ $name: $*" >> "$OUT"; local o; o=$("$@" 2>&1); local rc=$?; echo "$o" >> "$OUT"; echo "  rc=$rc" >> "$OUT"
  local sig; sig=$(printf '%s' "$o" | grep -oE 'Signature: [1-9A-HJ-NP-Za-km-z]{60,}' | awk '{print $2}' | tr '\n' ',')
  steps+=("{\"step\":\"$name\",\"rc\":$rc,\"signatures\":\"${sig%,}\"}"); [ $rc -eq 0 ] || fail=$((fail + 1)); return $rc; }
ST() { "$SPL" -u "$U" --program-id "$T22" "$@"; }
r=$(curl -s -m 10 -X POST -H 'content-type: application/json' -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"requestAirdrop\",\"params\":[\"$FA\",$GAS_RESERVE_LAMPORTS]}" "$U")
echo "+ gas-reserve: $r" >> "$OUT"; printf '%s' "$r" | grep -q '"result"' && steps+=("{\"step\":\"gas-reserve\",\"rc\":0,\"signatures\":\"$(printf '%s' "$r" | python3 -c 'import json,sys; print(json.load(sys.stdin)["result"])')\"}") || fail=$((fail + 1))
sleep 2
st create-mint ST create-token --fee-payer "$FK" --mint-authority "$FK" --decimals 6 --enable-confidential-transfers auto "$MINTK"
st reserve-account ST create-account --fee-payer "$FK" --owner "$FK" "$MINT"
st reserve-configure ST configure-confidential-transfer-account --fee-payer "$FK" --owner "$FK" "$MINT"
ATA=$(ST address --verbose --owner "$FK" --token "$MINT" 2>/dev/null | awk '/ssociated/ {print $NF}' | tail -1)
st mint-supply ST mint --fee-payer "$FK" --mint-authority "$FK" "$MINT" "$SUPPLY" "$ATA"
PART=${RESERVE_PART:-250000000}; left=$SUPPLY; i=0
while [ "$left" -gt 0 ]; do i=$((i + 1)); a=$PART; [ "$left" -lt "$a" ] && a=$left
  st "reserve-deposit-$i" ST deposit-confidential-tokens --fee-payer "$FK" --owner "$FK" "$MINT" "$a"
  st "reserve-apply-$i" ST apply-pending-balance --fee-payer "$FK" --owner "$FK" "$MINT"
  left=$((left - a)); done
st reserve-disable-public ST disable-non-confidential-credits --fee-payer "$FK" --owner "$FK" "$MINT"
st mint-authority-removed ST authorize --fee-payer "$FK" --authority "$FK" "$MINT" mint --disable
st ct-authority-removed ST authorize --fee-payer "$FK" --authority "$FK" "$MINT" confidential-transfer-mint --disable || true
st display-mint ST display "$MINT"
st display-reserve ST display "$ATA"
python3 -I -c 'import json,sys,datetime; print(json.dumps({"at":datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),"mint":sys.argv[1],"decimals":6,"supply":sys.argv[2],"reserve_owner":sys.argv[3],"reserve_account":sys.argv[4],"cli":sys.argv[5],"steps":[json.loads(s) for s in sys.argv[6:]]},indent=1))' \
  "$MINT" "$SUPPLY" "$FA" "$ATA" "$("$SPL" --version)" "${steps[@]}" > "$OUTJ"
echo "setup-main-asset mint=$MINT reserve=$ATA supply=$SUPPLY fails=$fail verdict=$([ $fail -eq 0 ] && echo PASS || echo FAIL)"
