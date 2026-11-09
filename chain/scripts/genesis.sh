#!/usr/bin/env bash
set -eu
usage() { echo "usage: genesis.sh <agave-bin-dir> <program-dir> <keys-dir> <ledger-dir>"; exit 2; }
[ $# -eq 4 ] || usage
B=$1; P=$2; K=$3; L=$4
L2=BPFLoader2111111111111111111111111111111111
L3=BPFLoaderUpgradeab1e11111111111111111111111
for k in id1 vote1 stake1 faucet; do
  [ -f "$K/$k.json" ] || "$B/solana-keygen" new --no-bip39-passphrase -s -o "$K/$k.json" >/dev/null
done
BLS=()
"$B/solana-genesis" --help 2>/dev/null | grep -q -- "--bootstrap-validator-bls-pubkey" \
  && BLS=(--bootstrap-validator-bls-pubkey "$("$B/solana-keygen" bls-pubkey "$K/id1.json")")
"$B/solana-genesis" --ledger "$L" "${BLS[@]}" \
  --bpf-program TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb "$L2" "$P/spl_token_2022-8.0.0.so" \
  --bpf-program ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL "$L2" "$P/spl_associated_token_account-1.1.2.so" \
  --bpf-program recr1L3PCGKLbckBqMNcJhuuyU1zgo8nBhfLVsJNwr5 "$L2" "$P/spl_record.so" \
  --upgradeable-program Stake11111111111111111111111111111111111111 "$L3" "$P/core_bpf_stake-5.1.0.so" none \
  --upgradeable-program AddressLookupTab1e1111111111111111111111111 "$L3" "$P/core_bpf_address_lookup_table-3.0.0.so" none \
  --upgradeable-program Config1111111111111111111111111111111111111 "$L3" "$P/core_bpf_config-3.0.0.so" none \
  --upgradeable-program Feature111111111111111111111111111111111111 "$L3" "$P/core_bpf_feature_gate-0.0.1.so" none \
  --bootstrap-validator "$K/id1.json" "$K/vote1.json" "$K/stake1.json" \
  --bootstrap-validator-lamports 500000000000 --bootstrap-validator-stake-lamports 25000000000 \
  --faucet-pubkey "$K/faucet.json" --faucet-lamports 1000000000000000 \
  --cluster-type development --hashes-per-tick sleep --enable-warmup-epochs
