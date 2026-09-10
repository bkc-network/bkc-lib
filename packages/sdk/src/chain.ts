/**
 * The facts about the BKC chain that every consumer needs and none should re-derive.
 *
 * These are chain-dependent: point them at your own endpoints, or pass overrides where
 * the helpers accept them.
 */

/** Type URL the deployed chain registers for its EVM-call message. */
export const evmCallTypeUrl = "/bkc.bkc.v1.MsgExecuteEvmCall";

export const bkcChain = {
  chainId: "BKC",
  bech32Prefix: "bkc",
  denom: "bkc",
  displayDenom: "BKC",
  decimals: 18,
  evmChainId: 262144,
  /**
   * Gas the chain needs before the EVM budget is added. An ML-DSA-65 signature is ~3.3 KB
   * and gas is charged per byte, so even a plain transfer costs far more than on a
   * secp256k1 chain: measured 231k-285k for a send, 447k for an undelegate.
   */
  baseGasLimit: BigInt(600000),
  /** Minimum gas price, in the base denom. */
  gasPrice: BigInt(66666666667),
  /** The chain rejects SIGN_MODE_UNSPECIFIED, so gas can never be simulated. */
  isSimulable: false,
} as const;

// No fee helper here on purpose: `calculateFee(gasLimit, gasPrice)` in `@bkc/stargate`
// already turns a gas budget into an StdFee, and it handles amounts past the safe integer
// range. A second one would be the same arithmetic with fewer of the edge cases covered.
