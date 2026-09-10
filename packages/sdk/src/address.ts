import { keccak256 } from "@bkc/crypto";
import { fromBech32, fromHex, toBech32, toHex, toUtf8 } from "@bkc/encoding";

import { bkcChain } from "./chain";

/**
 * One account, two spellings.
 *
 * BKC runs a Cosmos stack and an EVM on the same account: the 20 bytes carried by the
 * bech32 string are exactly the EVM address. Neither side derives from the other - both
 * are views of the same account - so converting is lossless and needs no key material.
 */

/**
 * EIP-55 checksumming: the mixed-case spelling of an EVM address.
 *
 * Every wallet and explorer displays addresses this way, and some inputs reject a
 * lowercase one outright, so a converted address has to arrive in the same form the user
 * would have copied from anywhere else.
 */
export function toChecksumAddress(evmAddress: string): string {
  const hex = (evmAddress.startsWith("0x") ? evmAddress.slice(2) : evmAddress).toLowerCase();

  if (!/^[0-9a-f]{40}$/.test(hex)) {
    throw new Error(`Not a 20 byte EVM address: ${evmAddress}`);
  }

  const digest = toHex(keccak256(toUtf8(hex)));
  let cased = "";
  for (let index = 0; index < hex.length; index += 1) {
    cased += parseInt(digest[index], 16) >= 8 ? hex[index].toUpperCase() : hex[index];
  }

  return `0x${cased}`;
}

/**
 * The EVM form (`0x…`) of a bech32 account address.
 *
 * Pass `checksum` to get the EIP-55 mixed-case spelling instead of plain lowercase.
 */
export function toEvmAddress(
  bech32Address: string,
  expectedPrefix: string = bkcChain.bech32Prefix,
  checksum = false,
): string {
  const { prefix, data } = fromBech32(bech32Address);

  if (prefix !== expectedPrefix) {
    throw new Error(`Expected a ${expectedPrefix} address, got ${prefix}`);
  }
  if (data.length !== 20) {
    throw new Error(`Expected 20 address bytes, got ${data.length}`);
  }

  const hex = `0x${toHex(data)}`;

  return checksum ? toChecksumAddress(hex) : hex;
}

/** The bech32 form of an EVM address. */
export function toBech32Address(evmAddress: string, prefix: string = bkcChain.bech32Prefix): string {
  const hex = evmAddress.startsWith("0x") ? evmAddress.slice(2) : evmAddress;

  if (!/^[0-9a-fA-F]{40}$/.test(hex)) {
    throw new Error(`Not a 20 byte EVM address: ${evmAddress}`);
  }

  const bytes = fromHex(hex);

  return toBech32(prefix, bytes);
}

/**
 * The EVM form when the input is bech32 under `prefix`, otherwise null.
 *
 * For accepting either spelling in a recipient field: a bech32 address of another chain
 * (`cosmos1…`) decodes to 20 plausible bytes too, and converting that would send funds to
 * an address nobody holds the key to.
 */
export function tryToEvmAddress(
  address: string,
  prefix: string = bkcChain.bech32Prefix,
  checksum = false,
): string | null {
  if (!address.startsWith(`${prefix}1`)) return null;

  try {
    return toEvmAddress(address, prefix, checksum);
  } catch {
    return null;
  }
}
