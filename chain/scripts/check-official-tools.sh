#!/usr/bin/env bash
set -u
U=${RPC_URL:?set RPC_URL to the public RPC URL}
A=${1:?usage: check-official-tools.sh <sender-keypair.json> <receiver-keypair.json> <out-dir>}
B=${2:?receiver keypair}
D=${3:?output directory}
T22=TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb
MINT=${MINT:-5n31rh6t9mgFYZRhoSb8k2xUcdCgmDL5BFZbjvkPLHif}
mkdir -p "$D"
ST() { spl-token -u "$U" --program-id "$T22" "$@"; }
BA=$(ST address --verbose --owner "$B" --token "$MINT" 2>/dev/null | awk '/ssociated/ {print $NF}' | tail -1)
RB=$(solana-keygen pubkey "$B")
ok=0
ST apply-pending-balance --fee-payer "$A" --owner "$A" "$MINT" > /dev/null 2>&1
{ echo "\$ spl-token --url \$RPC display $BA"; ST display "$BA"; } > "$D/1-read.txt" 2>&1
grep -q "Available Balance" "$D/1-read.txt" && grep -qE "Balance: 0$|^  Balance: 0" "$D/1-read.txt" && ok=$((ok + 1))
{ echo "\$ spl-token --url \$RPC withdraw-confidential-tokens $MINT 1"; ST withdraw-confidential-tokens --fee-payer "$A" --owner "$A" "$MINT" 1
  echo "\$ spl-token --url \$RPC transfer $MINT 1 $RB"; ST transfer --fee-payer "$A" --owner "$A" "$MINT" 1 "$RB"; } > "$D/2-public-refused.txt" 2>&1
grep -q "custom program error: 0x31" "$D/2-public-refused.txt" && ok=$((ok + 1))
{ echo "\$ spl-token --url \$RPC transfer $MINT 1 $RB --confidential"; ST transfer --fee-payer "$A" --owner "$A" "$MINT" 1 "$RB" --confidential; } > "$D/3-sealed.txt" 2>&1
grep -q "confidential transfer:" "$D/3-sealed.txt" && ok=$((ok + 1))
ST deposit-confidential-tokens --fee-payer "$A" --owner "$A" "$MINT" 1 > /dev/null 2>&1
ST apply-pending-balance --fee-payer "$A" --owner "$A" "$MINT" > /dev/null 2>&1
echo "check read=$(grep -q 'Available Balance' "$D/1-read.txt" && echo ok || echo FAIL) public_refused=$(grep -q '0x31' "$D/2-public-refused.txt" && echo ok || echo FAIL) sealed=$(grep -q 'confidential transfer:' "$D/3-sealed.txt" && echo ok || echo FAIL) verdict=$([ $ok -eq 3 ] && echo PASS || echo FAIL)"
[ $ok -eq 3 ]
