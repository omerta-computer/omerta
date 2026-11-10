#!/usr/bin/env bash
set -u
U=${RPC_URL:?set RPC_URL to a validator started from chain/scripts/genesis.sh}
W=${1:?usage: base-probe.sh <work-dir>}
T22=TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb
SPL=${SPL_TOKEN:-spl-token}
K=$W/keys-$(date -u +%H%M%S); mkdir -p "$K"
for k in payer alice bob mint; do solana-keygen new --no-bip39-passphrase -s -o "$K/$k.json" >/dev/null; done
log=$W/probe.log; : > "$log"
t0=$(date +%s)
st() { echo "+ $*" >> "$log"; "$@" >> "$log" 2>&1; local rc=$?; echo "  rc=$rc" >> "$log"; return $rc; }
echo "cli: $("$SPL" --version)" >> "$log"
ST() { "$SPL" -u "$U" --program-id "$T22" "$@"; }
ata() { ST address --verbose --owner "$1" --token "$MINT" 2>/dev/null | awk '/Associated token address/ {print $NF}'; }
fail=()
air() { local r; r=$(curl -s -m 10 -X POST -H 'content-type: application/json' -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"requestAirdrop\",\"params\":[\"$1\",$2]}" "$U"); echo "+ airdrop $1 $2: $r" >> "$log"; printf '%s' "$r" | grep -q '"result"'; }
for k in payer alice bob; do air "$(solana-keygen pubkey "$K/$k.json")" 50000000000 || fail+=("fund-$k"); done
sleep 3
MINT=$(solana-keygen pubkey "$K/mint.json")
st ST create-token --fee-payer "$K/payer.json" --mint-authority "$K/payer.json" --decimals 6 --enable-confidential-transfers auto "$K/mint.json" || fail+=(create-token)
for k in alice bob; do
  st ST create-account --fee-payer "$K/$k.json" --owner "$K/$k.json" "$MINT" || fail+=("ata-$k")
  st ST configure-confidential-transfer-account --fee-payer "$K/$k.json" --owner "$K/$k.json" "$MINT" || fail+=("configure-$k")
done
st ST mint --fee-payer "$K/payer.json" --mint-authority "$K/payer.json" "$MINT" 1000 "$(ata "$K/alice.json")" || fail+=(mint)
st ST deposit-confidential-tokens --fee-payer "$K/alice.json" --owner "$K/alice.json" "$MINT" 1000 || fail+=(deposit)
st ST apply-pending-balance --fee-payer "$K/alice.json" --owner "$K/alice.json" "$MINT" || fail+=(apply-alice)
for k in alice bob; do st ST disable-non-confidential-credits --fee-payer "$K/$k.json" --owner "$K/$k.json" "$MINT" || fail+=("disable-$k"); done
BOB=$(solana-keygen pubkey "$K/bob.json")
x0=$(date +%s.%N)
st ST transfer --fee-payer "$K/alice.json" --owner "$K/alice.json" "$MINT" 123.456789 "$BOB" --confidential || fail+=(sealed-transfer)
x1=$(date +%s.%N)
st ST apply-pending-balance --fee-payer "$K/bob.json" --owner "$K/bob.json" "$MINT" || fail+=(apply-bob)
st ST withdraw-confidential-tokens --fee-payer "$K/bob.json" --owner "$K/bob.json" "$MINT" 123.456789 || fail+=(withdraw-exact)
if st ST withdraw-confidential-tokens --fee-payer "$K/bob.json" --owner "$K/bob.json" "$MINT" 1; then fail+=(withdraw-extra-succeeded); fi
if st ST transfer --fee-payer "$K/bob.json" --owner "$K/bob.json" "$MINT" 1 "$(solana-keygen pubkey "$K/alice.json")"; then fail+=(public-transfer-accepted); fi
grep -q "0x31" "$log" || fail+=(no-0x31)
st ST balance --owner "$K/alice.json" "$MINT"
st ST display "$(ata "$K/alice.json")"
st solana -u "$U" account TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA
st solana -u "$U" account txv1aq4pp281K9um3tnPgkfX8UqtFT6wcVW3hNezGLL
xs=$(awk -v a="$x0" -v b="$x1" 'BEGIN { printf "%.2f", b - a }')
echo "base-probe sealed_transfer_secs=$xs fails=${#fail[@]} [${fail[*]}] secs=$(( $(date +%s) - t0 )) verdict=$([ ${#fail[@]} -eq 0 ] && echo PASS || echo FAIL)" | tee -a "$log"
