#!/usr/bin/env bash
# Packs the SDK and everything it depends on into a directory a consumer can install from.
#
# @bkc/* is not on any npm registry, so a consumer installs tarballs. Those tarballs must
# live somewhere stable and inside the consumer's own repository: a path under /tmp is
# wiped on reboot and means nothing on anyone else's machine, and two consumers packed at
# different times silently end up on different versions of the SDK - which defeats the
# point of having one.
#
# Run it once per consumer, from the same build, so every consumer gets the same bytes:
#
#   packages/sdk/scripts/pack-to.sh ~/Desktop/bdasc/bkc-wallet/vendor
#   packages/sdk/scripts/pack-to.sh ~/Desktop/bdasc/bkc-dapp-demo/vendor
set -euo pipefail

DEST="${1:?usage: pack-to.sh <destination-directory>}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
# Every workspace package, in dependency order. The base ones (utils, math, socket,
# stream, json-rpc) used to come from npm as @cosmjs/*; renamed to @bkc/* they are no
# longer published anywhere, so a consumer needs them shipped too.
PACKAGES=(utils math encoding json-rpc socket stream crypto amino proto-signing tendermint-rpc stargate sdk)

mkdir -p "$DEST"
DEST="$(cd "$DEST" && pwd)"

for name in "${PACKAGES[@]}"; do
  # build first: yarn pack ships build/, and a stale build is the one failure mode that
  # produces a tarball which installs cleanly and is missing half its exports
  (cd "$REPO/packages/$name" && yarn build >/dev/null && yarn pack -o "$DEST/$name.tgz" >/dev/null)
  echo "packed $name -> $DEST/$name.tgz"
done

echo
echo "Point the consumer's package.json at them:"
for name in "${PACKAGES[@]}"; do
  echo "  \"@bkc/$name\": \"file:./vendor/$name.tgz\","
done
