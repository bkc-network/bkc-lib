import { rawMldsa65PubkeyToRawAddress } from "@bkc-network-lib/amino";
import { Algo } from "@bkc-network-lib/proto-signing";

/**
 * ML-DSA-65 on this chain.
 *
 * Almost nothing lives here on purpose: the sizes, the salt, the derivation and the
 * address rule belong to the crypto, proto-signing and amino packages, and are re-exported
 * from the entry points. A second definition here could drift from what wallets sign with.
 */

/** The `algo` value that selects ML-DSA-65 on an account. */
export const mldsa65Algo: Algo = "mldsa65";

/** True when an account's algorithm is ML-DSA-65. */
export function isMldsa65Algo(algo?: string | null): boolean {
  return algo === mldsa65Algo;
}

/** The raw 20 byte account address of a public key. An alias, for a name that reads better. */
export const mldsa65RawAddress = rawMldsa65PubkeyToRawAddress;
