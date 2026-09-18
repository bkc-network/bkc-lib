import { EncodeObject } from "@bkc-network-lib/proto-signing";

import { bkcChain, evmCallTypeUrl } from "./chain";
import { MsgExecuteEvmCall } from "./codec/bkc/bkc/v1/tx";

/**
 * Writing to the EVM on a chain that has no ECDSA keys.
 *
 * BKC signs with ML-DSA-65, so there is no Ethereum transaction to sign:
 * `eth_sendRawTransaction` is disabled and `MsgEthereumTx` is rejected. Every EVM state
 * change is a native Cosmos message instead, and the chain executes it in the EVM and
 * emits an ordinary Ethereum hash, receipt and logs - so everything downstream of the
 * send behaves like any EVM chain.
 *
 * Two rules are easy to get wrong, and both are handled here:
 *  - `callNonce` is the COSMOS account sequence the transaction is signed with, not the
 *    EVM nonce (the handler checks `account.Sequence == call_nonce + 1`)
 *  - the Cosmos gas limit must cover the EVM gas on top of the signature's own cost
 */

/** Headroom over an `eth_estimateGas` result, matching what ethers applies. */
const gasMultiplierPercent = BigInt(130);

export interface EvmCallOptions {
  /** bech32 address that signs, and pays */
  readonly sender: string;
  /** contract to call; omit or leave empty to deploy (CREATE) */
  readonly to?: string;
  /** calldata, or the creation bytecode of a deployment */
  readonly data: Uint8Array;
  /** native coin to attach, in base units */
  readonly value?: string;
  /** EVM gas budget, usually `eth_estimateGas` with headroom */
  readonly gasLimit: bigint;
  /** the Cosmos account sequence this transaction will be signed with */
  readonly sequence: bigint;
}

/** The message to put in a transaction body. */
export function makeEvmCallMessage(options: EvmCallOptions): EncodeObject {
  return {
    typeUrl: evmCallTypeUrl,
    value: MsgExecuteEvmCall.fromPartial({
      sender: options.sender,
      to: options.to ?? "",
      data: options.data,
      value: options.value ?? "",
      gasLimit: options.gasLimit,
      callNonce: options.sequence,
    }),
  };
}

/** EVM gas with the usual headroom applied. */
export function withGasHeadroom(estimatedGas: bigint): bigint {
  return (estimatedGas * gasMultiplierPercent) / BigInt(100);
}

/**
 * Cosmos gas for a transaction carrying an EVM call.
 *
 * The chain rejects the call when its EVM budget exceeds the transaction's gas, so the
 * two are never independent.
 */
export function cosmosGasForEvmCall(
  evmGasLimit: bigint,
  baseGasLimit: bigint = bkcChain.baseGasLimit,
): bigint {
  return baseGasLimit + evmGasLimit;
}

/**
 * The Ethereum hash of an EVM call, taken from the events of the Cosmos transaction that
 * carried it.
 *
 * One transaction has two hashes here, and they are not interchangeable: the REST API
 * answers to the Cosmos one, explorers and `eth_getTransactionReceipt` to this one.
 */
export function findEthereumTxHash(
  events: ReadonlyArray<{
    readonly type: string;
    readonly attributes: ReadonlyArray<{ readonly key: string; readonly value: string }>;
  }>,
): string | null {
  const ethereumTx = events.find((event) => event.type === "ethereum_tx");

  return ethereumTx?.attributes.find((attribute) => attribute.key === "ethereumTxHash")?.value ?? null;
}
