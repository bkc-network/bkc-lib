/**
 * The facts about the BKC chain that every consumer needs and none should re-derive.
 *
 * Everything here is the same on a localnet, a rebuilt testnet and mainnet. The chain ids
 * and the gas price are not, so they live in ./discovery and are asked of the node.
 */

/** Type URL the deployed chain registers for its EVM-call message. */
export const evmCallTypeUrl = "/bkc.bkc.v1.MsgExecuteEvmCall";

export const bkcChain = {
  bech32Prefix: "bkc",
  denom: "bkc",
  displayDenom: "BKC",
  decimals: 18,
  /**
   * Gas to assume when not simulating. An ML-DSA-65 signature is ~3.3 KB and gas is charged
   * per byte, so a plain transfer costs 231k-285k and an undelegate 447k; this covers the
   * heaviest of them.
   */
  baseGasLimit: BigInt(600000),
} as const;

// No fee helper here on purpose: `calculateFee` in `@bkc-network-lib/stargate` already does
// it, and handles amounts past the safe integer range.
