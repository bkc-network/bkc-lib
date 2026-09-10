/**
 * @bkc/sdk/core - the BKC chain, without a transport.
 *
 * The main entry point brings ethers and a Cosmos client with it, because that is what an
 * application wants. A wallet does not: it already has its own keyring, its own RPC layer
 * with failover, its own approval flow. What it needs from an SDK is the part it must not
 * get wrong - key sizes, address derivation, the chain's own message encoding, the gas
 * rules - and none of that needs a transport.
 *
 * Importing from here pulls in no ethers, no `@bkc/stargate` and no `@bkc/tendermint-rpc`,
 * so a bundle stays the size it was.
 *
 *     import { MsgExecuteEvmCall, makeEvmCallMessage, bkcChain } from "@bkc/sdk/core";
 */

// ---------------------------------------------------------------- the chain itself

export { toBech32Address, toChecksumAddress, toEvmAddress, tryToEvmAddress } from "./address";
export { bkcChain, evmCallTypeUrl } from "./chain";

// ---------------------------------------------------------------- ML-DSA-65

export { isMldsa65Algo, mldsa65Algo, mldsa65RawAddress } from "./mldsa65";

// Owned by the packages below, not restated here. One definition each, so the wallet, the
// SDK and a script cannot disagree about what the chain expects.
export { pubkeyType, rawMldsa65PubkeyToRawAddress } from "@bkc/amino";
export type { Mldsa65Keypair } from "@bkc/crypto";
export { hkdfSha256, keccak256, Mldsa65, mldsa65, sha256 } from "@bkc/crypto";
export { fromBase64, fromBech32, fromHex, fromUtf8, toBase64, toBech32, toHex, toUtf8 } from "@bkc/encoding";
export { deriveMldsa65Seed, mldsa65HkdfSalt, mldsa65PubkeyTypeUrl } from "@bkc/proto-signing";

// ---------------------------------------------------------------- EVM calls

export { MsgExecuteEvmCall, MsgExecuteEvmCallResponse } from "./codec/bkc/bkc/v1/tx";
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
