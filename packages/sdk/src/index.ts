/**
 * @bkc-network-lib/sdk - everything needed to build on the BKC post-quantum chain.
 *
 * BKC replaces secp256k1 with ML-DSA-65 (FIPS 204) and runs an EVM over the same account,
 * which breaks two assumptions every off-the-shelf library makes:
 *
 *  - keys, addresses, pubkeys and signatures have post-quantum shapes, so the usual
 *    Cosmos signing stack cannot produce a valid transaction
 *  - the EVM has no ECDSA key to sign with and `eth_sendRawTransaction` is disabled, so
 *    contract calls travel as a Cosmos message instead
 *
 * Both are handled here, and a consumer needs no other BKC-specific package.
 */

// ---------------------------------------------------------------- keys and signing

export { hkdfSha256, keccak256, Mldsa65, mldsa65, Mldsa65Keypair, sha256 } from "@bkc-network-lib/crypto";
export type { AccountData, DirectSignResponse, OfflineDirectSigner } from "@bkc-network-lib/proto-signing";
export type {
  DirectMldsa65HdWalletOptions,
  DirectMldsa65HdWalletSerialization,
} from "@bkc-network-lib/proto-signing";
export {
  deriveMldsa65Seed,
  DirectMldsa65HdWallet,
  DirectMldsa65Wallet,
  makeAuthInfoBytes,
  makeSignBytes,
  makeSignDoc,
  mldsa65HkdfSalt,
  mldsa65PubkeyTypeUrl,
  Registry,
} from "@bkc-network-lib/proto-signing";

// ---------------------------------------------------------------- addresses and pubkeys

export type { Mldsa65Pubkey } from "@bkc-network-lib/amino";
export {
  encodeMldsa65Pubkey,
  encodeMldsa65Signature,
  isMldsa65Pubkey,
  pubkeyType,
  rawMldsa65PubkeyToRawAddress,
} from "@bkc-network-lib/amino";
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

// ---------------------------------------------------------------- talking to a node

// Re-exported so nothing built on BKC ever needs a second package: a consumer installs
// @bkc-network-lib/sdk and has the whole path from a seed to a broadcast transaction.
export type { DeliverTxResponse, StdFee } from "@bkc-network-lib/stargate";
export {
  calculateFee,
  coin,
  coins,
  GasPrice,
  SigningStargateClient,
  StargateClient,
} from "@bkc-network-lib/stargate";

// ---------------------------------------------------------------- in a browser, with a wallet

// A dapp holds no key: the extension does. This turns the injected wallet into the same
// ethers Signer everything else here takes.
export type {
  BkcAccount,
  BkcWalletConnection,
  ConnectBkcWalletOptions,
  InjectedBkcWallet,
  StdSignature,
} from "./browser";
export { connectBkcWallet, getInjectedBkcWallet, walletSigner } from "./browser";

// ---------------------------------------------------------------- contracts, the ethers way

export type { BkcEndpoints } from "./ethers";
export type {
  ContractTransactionReceipt,
  ContractTransactionResponse,
  InterfaceAbi,
  Log,
  Provider,
  Signer,
} from "./ethers";
export {
  BkcProvider,
  BkcSigner,
  Contract,
  ContractFactory,
  formatEther,
  formatUnits,
  id,
  Interface,
  isAddress,
  parseEther,
  parseUnits,
  Typed,
  Wallet,
} from "./ethers";

// What ethers cannot do on this chain, done with the Cosmos side instead.
export type { EvmTransactionCost } from "./fee";
export { getEvmTransactionCost } from "./fee";
export type { EvmLog, PagedLogFilter, PagedLogOptions } from "./logs";
export { getLogsPaged, maxLogBlockRange } from "./logs";
export type { SignedMessage } from "./messages";
export {
  encodeVerifyCall,
  makeAdr36SignBytes,
  mldsaVerifyPrecompile,
  signMessage,
  verifyMessage,
  verifyMessageOnChain,
} from "./messages";

// The raw EIP-1193 provider, for tooling that wants to wire its own stack - a Hardhat
// plugin, viem, or a wallet. A builder never needs this.
export type { BkcEip1193Options, Eip1193Provider } from "./provider";
export { createBkcEip1193Provider } from "./provider";

// ---------------------------------------------------------------- the chain itself

// one implementation of EIP-55, not ethers' and ours side by side under the same name
export { toBech32Address, toChecksumAddress, toEvmAddress, tryToEvmAddress } from "./address";
export { bkcChain, evmCallTypeUrl } from "./chain";
export { MsgExecuteEvmCall, MsgExecuteEvmCallResponse } from "./codec/bkc/bkc/v1/tx";
export type { EvmCallOptions } from "./evmcall";
export { cosmosGasForEvmCall, findEthereumTxHash, makeEvmCallMessage, withGasHeadroom } from "./evmcall";
export { isMldsa65Algo, mldsa65Algo, mldsa65RawAddress } from "./mldsa65";
export { bkcRegistryTypes, makeBkcRegistry } from "./registry";
