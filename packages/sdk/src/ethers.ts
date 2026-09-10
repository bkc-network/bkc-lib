import { DirectMldsa65HdWallet, DirectMldsa65Wallet, OfflineDirectSigner } from "@bkc/proto-signing";
import { GasPrice } from "@bkc/stargate";
import { BrowserProvider, JsonRpcSigner, Network } from "ethers";

import { bkcChain } from "./chain";
import { createBkcEip1193Provider } from "./provider";

/**
 * BKC for people who already know ethers.
 *
 * A builder should not have to learn what makes this chain unusual - that its keys are
 * ML-DSA-65, that an EVM write is really a Cosmos message, that EIP-1193 exists at all.
 * These two classes are ordinary ethers `Provider` and `Signer` objects, so everything
 * downstream - `Contract`, `ContractFactory`, `tx.wait()`, event filters - is the ethers
 * you already use.
 *
 *     const signer = await BkcSigner.fromMnemonic(mnemonic, endpoints);
 *     const contract = new Contract(address, abi, signer);
 *     await (await contract.set(42)).wait();
 */

export interface BkcEndpoints {
  /** EVM JSON-RPC of the chain, for reads */
  readonly evmRpcUrl: string;
  /** Tendermint RPC of the same chain, where writes are broadcast */
  readonly cosmosRpcUrl: string;
  /** pay above the chain minimum, if you want to */
  readonly gasPrice?: GasPrice;
}

/**
 * An ethers provider backed by BKC.
 *
 * Reads go straight to the node. Writes are signed by the account this provider was built
 * with, the way an injected wallet signs for a dapp - which is why `getSigner()` needs no
 * key of its own.
 */
export class BkcProvider extends BrowserProvider {
  /** Builds a provider that signs with `signer`. */
  public static async connect(signer: OfflineDirectSigner, endpoints: BkcEndpoints): Promise<BkcProvider> {
    const eip1193 = await createBkcEip1193Provider({
      evmRpcUrl: endpoints.evmRpcUrl,
      cosmosRpcUrl: endpoints.cosmosRpcUrl,
      signer,
      gasPrice: endpoints.gasPrice,
    });

    // the chain id is known, so ethers need not ask for it on every call
    const network = new Network(bkcChain.chainId, BigInt(bkcChain.evmChainId));

    return new BkcProvider(eip1193, network, { staticNetwork: network });
  }
}

/**
 * The account that signs, as an ethers `Signer`.
 *
 * `BkcSigner` is not a class you instantiate: the three factories return a plain
 * `JsonRpcSigner`, so nothing about it is special to hold or pass around.
 */
// eslint-disable-next-line @typescript-eslint/naming-convention -- reads as a type at the call site: BkcSigner.fromSeed(...)
export const BkcSigner = {
  /** From a 32 byte ML-DSA-65 generation seed. */
  async fromSeed(seed: Uint8Array, endpoints: BkcEndpoints): Promise<JsonRpcSigner> {
    return BkcSigner.fromWallet(await DirectMldsa65Wallet.fromSeed(seed, bkcChain.bech32Prefix), endpoints);
  },

  /** From a BIP-39 mnemonic, using the chain's HD derivation. */
  async fromMnemonic(mnemonic: string, endpoints: BkcEndpoints): Promise<JsonRpcSigner> {
    return BkcSigner.fromWallet(
      await DirectMldsa65HdWallet.fromMnemonic(mnemonic, { prefix: bkcChain.bech32Prefix }),
      endpoints,
    );
  },

  /** From a wallet you already hold - a keystore you decrypted, say. */
  async fromWallet(wallet: OfflineDirectSigner, endpoints: BkcEndpoints): Promise<JsonRpcSigner> {
    const provider = await BkcProvider.connect(wallet, endpoints);

    return provider.getSigner();
  },
};

// Re-exported so a builder imports from one place. These are ethers' own, unmodified:
// there is no BKC-specific ABI encoding, and there should not be.
export type {
  ContractTransactionReceipt,
  ContractTransactionResponse,
  InterfaceAbi,
  Log,
  Provider,
  Signer,
} from "ethers";
export {
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
  // an ECDSA wallet cannot sign for this chain; exported only so the mismatch is a clear
  // error at the call site rather than a missing import
  Wallet,
} from "ethers";
