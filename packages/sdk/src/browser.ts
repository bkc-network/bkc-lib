import { AccountData, DirectSignResponse, OfflineDirectSigner } from "@bkc-network-lib/proto-signing";
import { JsonRpcSigner } from "ethers";

import { toEvmAddress } from "./address";
import { discoverChain } from "./discovery";
import { BkcEndpoints, BkcProvider } from "./ethers";

/**
 * BKC in a browser, where the key lives in a wallet extension.
 *
 * The rest of this SDK signs with a key the process holds. A dapp never does: the key is
 * in the extension, and the page only asks for signatures. That is the same split ethers
 * expresses as `BrowserProvider` + `getSigner()`, so this file ends at the same place -
 * an ordinary ethers `Signer` - and a dapp builder writes no BKC-specific code at all.
 *
 *     const { signer, account } = await connectBkcWallet(endpoints);
 *     const factory = new ContractFactory(abi, bytecode, signer);
 *     const contract = await factory.deploy();
 */

/** A Cosmos signature, in the shape every Keplr-compatible wallet returns. */
export interface StdSignature {
  // eslint-disable-next-line @typescript-eslint/naming-convention -- the wire name Keplr sends
  readonly pub_key: { readonly type: string; readonly value: string };
  readonly signature: string;
}

/**
 * The part of the injected wallet API this SDK uses.
 *
 * BKC Wallet injects a Keplr-compatible provider, so this is a subset of Keplr's own
 * interface rather than anything new to learn.
 */
export interface InjectedBkcWallet {
  enable(chainId: string): Promise<void>;
  getKey(chainId: string): Promise<{
    readonly bech32Address: string;
    /** the account's raw 20 bytes; on BKC these are also the EVM address */
    readonly address?: Uint8Array;
    readonly pubKey: Uint8Array;
    readonly algo: string;
    readonly name: string;
  }>;
  signDirect(
    chainId: string,
    signerAddress: string,
    signDoc: { bodyBytes: Uint8Array; authInfoBytes: Uint8Array; chainId: string; accountNumber: bigint },
    // An injected wallet is plain JS and answers with whatever it serialised: accountNumber
    // comes back as a string or a Long, not the bigint a typed signer hands out. Saying so
    // here is what makes the conversion in walletSigner() necessary rather than redundant.
  ): Promise<{
    readonly signed: {
      readonly bodyBytes: Uint8Array;
      readonly authInfoBytes: Uint8Array;
      readonly chainId: string;
      readonly accountNumber: bigint | string | number;
    };
    readonly signature: StdSignature;
  }>;
  signArbitrary(chainId: string, signerAddress: string, data: string | Uint8Array): Promise<StdSignature>;
  verifyArbitrary(
    chainId: string,
    signerAddress: string,
    data: string | Uint8Array,
    signature: StdSignature,
  ): Promise<boolean>;
}

/** One account, as the wallet reports it. */
export interface BkcAccount {
  /** bech32 form, `bkc1…` */
  readonly address: string;
  /** EVM form of the same account, `0x…` */
  readonly evmAddress: string;
  /** ML-DSA-65 public key, 1952 bytes */
  readonly pubkey: Uint8Array;
  /** `mldsa65` on this chain */
  readonly algo: string;
  /** the name the user gave the account in their wallet */
  readonly name: string;
}

export interface BkcWalletConnection {
  readonly account: BkcAccount;
  /** an ethers signer: pass it to `Contract`, `ContractFactory`, anything */
  readonly signer: JsonRpcSigner;
  /** the ethers provider behind that signer, for reads */
  readonly provider: BkcProvider;
  /** the same account as a Cosmos signer, for `SigningStargateClient` */
  readonly cosmosSigner: OfflineDirectSigner;
  /** the raw injected provider, for what only a wallet can do (`signArbitrary`) */
  readonly wallet: InjectedBkcWallet;
}

interface WalletCarrier {
  bkc?: { providers?: { keplr?: InjectedBkcWallet } };
}

/**
 * The injected provider, once it exists.
 *
 * `window.bkc` only. BKC Wallet claims `window.keplr` just when no other extension owns it,
 * so wherever `window.bkc` is absent that name holds a foreign wallet - whose secp256k1 key
 * cannot sign for an ML-DSA-65 account anyway.
 *
 * An extension injects a moment after the page loads, so looking once would turn a timing
 * detail into "no wallet installed". Poll for a short grace period instead.
 */
export async function getInjectedBkcWallet(timeoutMs = 3000): Promise<InjectedBkcWallet> {
  const carrier = globalThis as unknown as WalletCarrier;
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const wallet = carrier.bkc?.providers?.keplr;

    if (wallet) return wallet;
    if (Date.now() >= deadline) break;

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error("No BKC wallet found. Install the extension and reload the page.");
}

/**
 * The wallet's account as an `OfflineDirectSigner`.
 *
 * Built from `getKey` + `signDirect` rather than the wallet's own `getOfflineSigner`,
 * for two reasons: not every injected provider exposes one, and the ones that do type
 * `algo` as `secp256k1`. That field is what routes public-key encoding downstream, so an
 * account reported as secp256k1 produces a transaction the chain rejects.
 */
export function walletSigner(wallet: InjectedBkcWallet, chainId: string): OfflineDirectSigner {
  return {
    async getAccounts(): Promise<readonly AccountData[]> {
      const key = await wallet.getKey(chainId);

      return [{ address: key.bech32Address, algo: key.algo as AccountData["algo"], pubkey: key.pubKey }];
    },

    async signDirect(signerAddress, signDoc): Promise<DirectSignResponse> {
      const response = await wallet.signDirect(chainId, signerAddress, signDoc);

      // the caller broadcasts whatever `signed` says, so it has to carry the typed shape
      return {
        ...response,
        signed: { ...response.signed, accountNumber: BigInt(response.signed.accountNumber) },
      };
    },
  };
}

/** The account's EVM address, preferring what the wallet reports over a local conversion. */
function evmAddressOf(key: { bech32Address: string; address?: Uint8Array }): string {
  if (key.address?.length === 20) {
    return `0x${Array.from(key.address, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  }

  // older wallets leave the field empty; the bech32 string carries the same 20 bytes
  return toEvmAddress(key.bech32Address);
}

/**
 * Connect to the wallet extension and come back with an ethers signer.
 *
 * This is the whole of what a dapp needs: after this call, `Contract`, `ContractFactory`
 * and `tx.wait()` behave exactly as they do on any EVM chain, and every write is signed
 * with ML-DSA-65 by the user's wallet.
 */
export async function connectBkcWallet(endpoints: BkcEndpoints): Promise<BkcWalletConnection> {
  // The chain id is asked of the node, because the wallet signs it into every transaction
  // and a wrong one refuses to connect. Together with the extension lookup, not after it:
  // neither needs the other's answer, and both run before the approval prompt can appear.
  const [chainId, wallet] = await Promise.all([
    discoverChain(endpoints).then((chain) => chain.chainId),
    getInjectedBkcWallet(),
  ]);

  await wallet.enable(chainId);

  const key = await wallet.getKey(chainId);
  const cosmosSigner = walletSigner(wallet, chainId);
  const provider = await BkcProvider.connect(cosmosSigner, endpoints);

  return {
    account: {
      address: key.bech32Address,
      evmAddress: evmAddressOf(key),
      pubkey: key.pubKey,
      algo: key.algo,
      name: key.name,
    },
    signer: await provider.getSigner(),
    provider,
    cosmosSigner,
    wallet,
  };
}
