import { rawMldsa65PubkeyToRawAddress } from "@bkc-network-lib/amino";
import { Algo } from "@bkc-network-lib/proto-signing";

/**
 * ML-DSA-65 on this chain, for anything that holds a key without using the wallets here.
 *
 * Almost nothing lives in this file, and that is the point. The sizes, the HKDF salt, the
 * derivation and the address rule are all defined once in the packages that own them -
 * `@bkc-network-lib/crypto`, `@bkc-network-lib/proto-signing`, `@bkc-network-lib/amino` - and re-exported through the SDK so a
 * consumer needs one import. Restating any of them here would create a second definition
 * that can drift from the one the wallets actually sign with.
 *
 * Re-exported from elsewhere, listed so it is obvious where each thing comes from:
 *
 *   mldsa65            @bkc-network-lib/crypto         byte lengths (seed, pubkey, privkey, signature)
 *   Mldsa65            @bkc-network-lib/crypto         keygen, sign, verify
 *   hkdfSha256         @bkc-network-lib/crypto         the KDF the derivation is built on
 *   mldsa65HkdfSalt    @bkc-network-lib/proto-signing  CHAIN-DEPENDENT salt
 *   deriveMldsa65Seed  @bkc-network-lib/proto-signing  bip39 seed + hd path -> ML-DSA seed
 *   pubkeyType.mldsa65 @bkc-network-lib/amino          amino type name
 *   mldsa65PubkeyTypeUrl @bkc-network-lib/proto-signing protobuf type URL
 */

/** The `algo` value that selects ML-DSA-65 on an account. */
export const mldsa65Algo: Algo = "mldsa65";

/** True when an account's algorithm is ML-DSA-65. */
export function isMldsa65Algo(algo?: string | null): boolean {
  return algo === mldsa65Algo;
}

/**
 * The raw 20 byte account address of a public key.
 *
 * A thin alias for `@bkc-network-lib/amino`'s function, kept only because "raw address" reads better
 * next to the EVM address helpers than "pubkey to raw address" does.
 */
export const mldsa65RawAddress = rawMldsa65PubkeyToRawAddress;
