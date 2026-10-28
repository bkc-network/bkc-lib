/**
 * @bkc-network-lib/sdk/core - the chain without a transport.
 *
 * For a wallet, which already has a keyring, an RPC layer and an approval flow, and needs
 * only the parts it must not get wrong. Pulls in no ethers, no stargate, no tendermint-rpc.
 *
 *     import { MsgExecuteEvmCall, makeEvmCallMessage, bkcChain } from "@bkc-network-lib/sdk/core";
 */

// ---------------------------------------------------------------- the chain itself

export { toBech32Address, toChecksumAddress, toEvmAddress, tryToEvmAddress } from "./address";
export { bkcChain, evmCallTypeUrl } from "./chain";

// ---------------------------------------------------------------- ML-DSA-65

export { isMldsa65Algo, mldsa65Algo, mldsa65RawAddress } from "./mldsa65";

// Owned by the packages below, not restated here. One definition each, so the wallet, the
// SDK and a script cannot disagree about what the chain expects.
export { pubkeyType, rawMldsa65PubkeyToRawAddress } from "@bkc-network-lib/amino";
export type { Mldsa65Keypair } from "@bkc-network-lib/crypto";
export { hkdfSha256, keccak256, Mldsa65, mldsa65, sha256 } from "@bkc-network-lib/crypto";
export {
  fromBase64,
  fromBech32,
  fromHex,
  fromUtf8,
  toBase64,
  toBech32,
  toHex,
  toUtf8,
} from "@bkc-network-lib/encoding";
export { deriveMldsa65Seed, mldsa65HkdfSalt, mldsa65PubkeyTypeUrl } from "@bkc-network-lib/proto-signing";

// ---------------------------------------------------------------- EVM calls

export { MsgExecuteEvmCall, MsgExecuteEvmCallResponse, WrappedEVMLog } from "./codec/bkc/bkc/v1/tx";
export type { EvmCallOptions } from "./evmcall";
export { cosmosGasForEvmCall, findEthereumTxHash, makeEvmCallMessage, withGasHeadroom } from "./evmcall";

// ---------------------------------------------------------------- reads that need care

export type { EvmTransactionCost } from "./fee";
export { getEvmTransactionCost } from "./fee";
export type { EvmLog, PagedLogFilter, PagedLogOptions } from "./logs";
export { getLogsPaged, maxLogBlockRange } from "./logs";

// ---------------------------------------------------------------- signing a message

export type { SignedMessage } from "./messages";
export {
  encodeVerifyCall,
  makeAdr36SignBytes,
  mldsaVerifyPrecompile,
  signMessage,
  verifyMessage,
  verifyMessageOnChain,
} from "./messages";
