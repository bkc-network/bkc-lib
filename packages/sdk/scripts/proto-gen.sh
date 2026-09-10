#!/usr/bin/env bash
# Regenerates src/codec from proto/.
#
# The chain's own protos live in ../qrt-chain/proto and pull their annotation imports
# (gogoproto, cosmos_proto, amino) from the Buf registry. Those annotations carry no
# bytes, so proto/ here holds a trimmed copy that generates offline - see the note at the
# top of proto/bkc/bkc/v1/tx.proto for the two deliberate differences.
set -euo pipefail

command -v protoc >/dev/null || { echo "protoc not found"; exit 1; }

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLUGIN="$(command -v protoc-gen-ts_proto || echo "$DIR/node_modules/.bin/protoc-gen-ts_proto")"

[ -x "$PLUGIN" ] || { echo "protoc-gen-ts_proto not found; run: npm i -g ts-proto"; exit 1; }

protoc \
  --plugin=protoc-gen-ts_proto="$PLUGIN" \
  -I "$DIR/proto" \
  --ts_proto_out="$DIR/src/codec" \
  --ts_proto_opt=esModuleInterop=true,forceLong=bigint,useOptionals=messages,outputServices=false,outputJsonMethods=false,useExactTypes=false \
  "$DIR"/proto/bkc/bkc/v1/*.proto

echo "generated into src/codec"
