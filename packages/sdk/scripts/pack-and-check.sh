#!/usr/bin/env bash
# Packs the SDK and everything it depends on, installs the tarballs into a throwaway
# project with plain npm, and runs a real flow against them.
#
# This is the only way to catch what the workspace hides. Two failures found this way that
# no in-repo test could see:
#   - a published package declaring "@bkc/crypto": "^0.39.0" silently resolves to the
#     UPSTREAM package, which has no ML-DSA-65 - install succeeds, imports succeed, and
#     every custom symbol is undefined
#   - @bkc/encoding passes `Infinity` to bech32.decode, which @scure/base >= 2.1
#     rejects; the repository lockfile pins 2.0.0, so only a fresh install shows it
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
OUT="${OUT:-/tmp/bkcpkg}"
WORK="${WORK:-/tmp/bkc-sdk-consumer}"
# The full dependency closure of @bkc/sdk. Anything missing here is fetched from the
# real registry instead, so the check fails on a 404 rather than on the code.
PACKAGES=(utils math encoding json-rpc socket stream crypto amino proto-signing tendermint-rpc stargate sdk)

rm -rf "$OUT" "$WORK"
mkdir -p "$OUT" "$WORK"

for name in "${PACKAGES[@]}"; do
  (cd "$REPO/packages/$name" && yarn pack -o "$OUT/$name.tgz" >/dev/null)
  echo "packed $name"
done

cd "$WORK"
# Driven by PACKAGES above, so the two lists cannot drift apart again: a package packed
# but not depended on here still resolves from the real registry, and 404s.
NAMES="${PACKAGES[*]}" node -e "
const deps = {};
for (const name of process.env.NAMES.split(' ')) {
  deps['@bkc/' + name] = 'file:$OUT/' + name + '.tgz';
}
require('fs').writeFileSync('package.json', JSON.stringify({ name: 'bkc-sdk-consumer', private: true, dependencies: deps }, null, 2));
"

npm install --silent
cp "$REPO/packages/sdk/scripts/consumer-check.mjs" .
node consumer-check.mjs
