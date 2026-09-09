import { bech32 } from "@scure/base";

import { fixUint8Array } from "./uint8array";

export function toBech32(prefix: string, data: Uint8Array, limit?: number): string {
  const address = bech32.encode(prefix, bech32.toWords(data), limit);
  return address;
}

function hasBech32Separator(input: string): input is `${string}1${string}` {
  return input.indexOf("1") !== -1;
}

/**
 * A bech32 address has no length limit in Cosmos, but @scure/base >= 2.1 rejects
 * `Infinity` as a limit, so pass a finite bound far beyond any real address instead.
 * Without this, decoding throws for anyone whose install resolves a newer @scure/base
 * than this repository's lockfile pins.
 */
const noLengthLimit = Number.MAX_SAFE_INTEGER;

export function fromBech32(
  address: string,
  limit = noLengthLimit,
): { readonly prefix: string; readonly data: Uint8Array<ArrayBuffer> } {
  // This extra check can be removed once
  // https://github.com/paulmillr/scure-base/pull/45 is merged and published.
  if (!hasBech32Separator(address)) throw new Error(`No bech32 separator found`);

  const decodedAddress = bech32.decode(address, limit);
  return {
    prefix: decodedAddress.prefix,
    data: fixUint8Array(bech32.fromWords(decodedAddress.words)),
  };
}

/**
 * Takes a bech32 address and returns a normalized (i.e. lower case) representation of it.
 *
 * The input is validated along the way, which makes this significantly safer than
 * using `address.toLowerCase()`.
 */
export function normalizeBech32(address: string): string {
  const { prefix, data } = fromBech32(address);
  return toBech32(prefix, data);
}
