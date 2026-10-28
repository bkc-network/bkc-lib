import { fromHex, toHex } from "@bkc-network-lib/encoding";
import { OfflineDirectSigner } from "@bkc-network-lib/proto-signing";
import {
  type SequenceResponse,
  calculateFee,
  GasPrice,
  SigningStargateClient,
} from "@bkc-network-lib/stargate";
import { TxRaw } from "cosmjs-types/cosmos/tx/v1beta1/tx";

import { toEvmAddress } from "./address";
import { bkcChain } from "./chain";
import { type DiscoveredChain, discoverChain } from "./discovery";
import { cosmosGasForEvmCall, findEthereumTxHash, makeEvmCallMessage, withGasHeadroom } from "./evmcall";
import { makeBkcRegistry } from "./registry";

/**
 * An EIP-1193 provider for BKC, so ethers, viem and Hardhat work here unchanged.
 *
 * Everything an EVM library does is `request({ method, params })`. On this chain exactly
 * one of those methods cannot be served the usual way: `eth_sendTransaction`. There is no
 * ECDSA key to sign an Ethereum transaction with, and the node refuses
 * `eth_sendRawTransaction`, so a write is wrapped in the Cosmos message
 * `/bkc.bkc.v1.MsgExecuteEvmCall`, signed with ML-DSA-65, and broadcast through the Cosmos
 * side. The chain then executes it in the EVM and emits an ordinary Ethereum hash,
 * receipt and logs - which is why everything downstream (`tx.wait()`, event filters,
 * explorers) keeps working.
 *
 * Every other method is forwarded to the node untouched.
 *
 *     const provider = new BrowserProvider(await createBkcEip1193Provider({ ... }));
 *     const contract = new Contract(address, abi, await provider.getSigner());
 *     await (await contract.set(42)).wait();
 */

export interface BkcEip1193Options {
  /** EVM JSON-RPC, for reads and gas estimation */
  readonly evmRpcUrl: string;
  /** Tendermint RPC of the same chain, where writes are broadcast */
  readonly cosmosRpcUrl: string;
  /** the ML-DSA-65 account that signs */
  readonly signer: OfflineDirectSigner;
  readonly gasPrice?: GasPrice;
  /** Cosmos gas covering the signature itself, before the EVM budget is added */
  readonly baseGasLimit?: bigint;
}

export interface Eip1193Provider {
  request(args: { readonly method: string; readonly params?: readonly unknown[] | object }): Promise<unknown>;
}

interface EvmTransactionRequest {
  readonly from?: string;
  readonly to?: string;
  readonly data?: string;
  readonly value?: string;
  readonly gas?: string;
}

const hexToBytes = (hex?: string): Uint8Array =>
  hex ? fromHex(hex.startsWith("0x") ? hex.slice(2) : hex) : new Uint8Array();

/** How long a prefetched account stays usable. A sequence only moves on a broadcast. */
const prefetchTtlMs = 5000;

/** The node refuses a wider window than this, and answers with an opaque error. */
const maxLogBlockRange = 10000;

/**
 * An EIP-1193 shaped failure.
 *
 * A plain Error coming out of `request()` reaches the developer as ethers' "could not
 * coalesce error", which says nothing. Carrying a numeric `code` lets the message survive
 * the trip.
 */
class Eip1193Error extends Error {
  public readonly code: number;

  public constructor(message: string, code: number) {
    super(message);
    this.code = code;
  }
}

/**
 * Guards the one read that quietly breaks here.
 *
 * `contract.queryFilter(filter)` with no block range asks for everything since genesis.
 * The node caps a log query at 10,000 blocks, so the request fails with an error no
 * caller can act on. Better to say what the limit is and how to stay inside it.
 */
function assertLogRangeIsQueryable(
  filter: { fromBlock?: unknown; toBlock?: unknown },
  latestBlock: number,
): void {
  const parse = (value: unknown, whenAbsent: number): number => {
    // absent is not the same as "latest": ethers fills both ends in before it calls, but a
    // caller reaching the provider directly can leave fromBlock out, and that means genesis
    if (value === undefined || value === null) return whenAbsent;
    if (value === "latest" || value === "pending") return latestBlock;
    if (value === "earliest") return 0;
    return typeof value === "string" ? Number(BigInt(value)) : Number(value);
  };

  const from = parse(filter.fromBlock, 0);
  const to = parse(filter.toBlock, latestBlock);

  if (to - from >= maxLogBlockRange) {
    throw new Eip1193Error(
      `This node answers eth_getLogs over at most ${maxLogBlockRange} blocks, and ${to - from + 1} were requested. ` +
        `Pass an explicit range - contract.queryFilter(filter, fromBlock, toBlock) - and page backwards if you need more history.`,
      -32000,
    );
  }
}

/** Builds the provider, connecting to the Cosmos side up front so writes are ready. */
export async function createBkcEip1193Provider(options: BkcEip1193Options): Promise<Eip1193Provider> {
  const { evmRpcUrl, cosmosRpcUrl, signer } = options;

  // A measurement of how large an ML-DSA-65 signature is, not a parameter the chain
  // publishes, so a constant is the honest place for it.
  const baseGasLimit = options.baseGasLimit ?? bkcChain.baseGasLimit;

  /**
   * The chain id and gas price, on the first write rather than here: fetching them up front
   * would put a round trip in front of every connect for answers a read never uses. Cached
   * per pair of endpoints, so a dapp that built a reader has already paid.
   */
  const chain = (): Promise<DiscoveredChain> => discoverChain({ evmRpcUrl, cosmosRpcUrl });

  const cosmos = await SigningStargateClient.connectWithSigner(cosmosRpcUrl, signer, {
    registry: makeBkcRegistry(),
  });

  const [account] = await signer.getAccounts();
  const senderAddress = account.address;
  const senderEvmAddress = toEvmAddress(senderAddress);

  let rpcId = 0;

  const forward = async (method: string, params: readonly unknown[]): Promise<unknown> => {
    const response = await fetch(evmRpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: (rpcId += 1), method, params }),
    });

    const body = (await response.json()) as { result?: unknown; error?: { code?: number; message: string } };

    if (body.error) {
      throw new Eip1193Error(body.error.message, body.error.code ?? -32000);
    }

    return body.result;
  };

  /**
   * The account, read while ethers is still estimating gas.
   *
   * ethers asks for an estimate and then sends, in that order, so an estimate for this
   * account is a reliable sign that a write is coming. Reading the account during that round
   * trip takes it off the path to the wallet's approval prompt, which is the wait a user
   * actually feels - the alternative is to start it afterwards and add the two together.
   *
   * Kept briefly. A sequence only moves when this account broadcasts, which it has not done
   * between the two calls, but one left lying around would eventually be wrong.
   */
  let prefetched: { readonly at: number; readonly account: Promise<SequenceResponse> } | null = null;

  function readAccount(): Promise<SequenceResponse> {
    const held = prefetched;
    prefetched = null;

    if (held && Date.now() - held.at < prefetchTtlMs) {
      // A prefetch that failed is not an error here: ask again, with somewhere to report it.
      return held.account.catch(() => cosmos.getSequence(senderAddress));
    }

    return cosmos.getSequence(senderAddress);
  }

  const sendTransaction = async (request: EvmTransactionRequest): Promise<string> => {
    if (request.from && request.from.toLowerCase() !== senderEvmAddress.toLowerCase()) {
      throw new Error(`This provider signs for ${senderEvmAddress}, not ${request.from}`);
    }

    const data = hexToBytes(request.data);

    // Together, not in sequence: independent questions, and all of this happens before the
    // wallet can prompt, which is the wait a user feels.
    //
    // `callNonce` is the Cosmos sequence this transaction is signed with - the handler
    // checks `account.Sequence == call_nonce + 1`. It is not the EVM nonce.
    const [evmGasLimit, onChain] = await Promise.all([
      request.gas
        ? Promise.resolve(BigInt(request.gas))
        : forward("eth_estimateGas", [
            {
              from: senderEvmAddress,
              ...(request.to ? { to: request.to } : {}),
              data: `0x${toHex(data)}`,
              ...(request.value ? { value: request.value } : {}),
            },
          ]).then((estimate) => withGasHeadroom(BigInt(estimate as string))),
      readAccount(),
    ]);

    const message = makeEvmCallMessage({
      sender: senderAddress,
      to: request.to,
      data,
      value: request.value ? BigInt(request.value).toString() : undefined,
      gasLimit: evmGasLimit,
      sequence: BigInt(onChain.sequence),
    });

    // The chain rejects SIGN_MODE_UNSPECIFIED, so gas is never simulated: it is computed,
    // and the fee with it.
    const cosmosGas = cosmosGasForEvmCall(evmGasLimit, baseGasLimit);

    // Sign with what is already known, then broadcast. `signAndBroadcast` would do both, but
    // it re-reads the account it was never told, and `cosmos.getChainId()` costs a `/status`
    // because the client does not learn the chain id when it connects. Two round trips, both
    // in front of the approval prompt, for answers held a few lines up.
    const discovered = await chain();

    const txRaw = await cosmos.sign(
      senderAddress,
      [message],
      calculateFee(Number(cosmosGas), options.gasPrice ?? discovered.gasPrice),
      "",
      {
        accountNumber: onChain.accountNumber,
        sequence: onChain.sequence,
        chainId: discovered.chainId,
      },
    );

    const result = await cosmos.broadcastTx(
      TxRaw.encode(txRaw).finish(),
      cosmos.broadcastTimeoutMs,
      cosmos.broadcastPollIntervalMs,
    );

    if (result.code !== 0) {
      throw new Error(`Rejected by the chain (code ${result.code}): ${result.rawLog ?? ""}`);
    }

    const ethereumTxHash = findEthereumTxHash(result.events);

    if (!ethereumTxHash) {
      throw new Error(
        `The chain accepted ${result.transactionHash} but reported no Ethereum transaction hash`,
      );
    }

    return ethereumTxHash;
  };

  return {
    async request({ method, params }) {
      const args = (Array.isArray(params) ? params : params ? [params] : []) as readonly unknown[];

      switch (method) {
        case "eth_accounts":
        case "eth_requestAccounts":
          return [senderEvmAddress];

        case "eth_sendTransaction":
          return sendTransaction((args[0] ?? {}) as EvmTransactionRequest);

        case "eth_estimateGas": {
          const from = ((args[0] ?? {}) as { from?: string }).from;

          if (!from || from.toLowerCase() === senderEvmAddress.toLowerCase()) {
            const ahead = cosmos.getSequence(senderAddress);
            // Nobody awaits this yet; without a handler a rejection would be unhandled.
            ahead.catch(() => undefined);
            prefetched = { at: Date.now(), account: ahead };
          }

          return forward(method, args);
        }

        case "eth_getLogs": {
          const filter = (args[0] ?? {}) as { fromBlock?: unknown; toBlock?: unknown };
          assertLogRangeIsQueryable(filter, Number(BigInt((await forward("eth_blockNumber", [])) as string)));

          return forward(method, args);
        }

        case "eth_sendRawTransaction":
          throw new Eip1193Error(
            "BKC has no ECDSA keys, so a signed Ethereum transaction cannot exist. Use eth_sendTransaction: this provider turns it into a Cosmos message signed with ML-DSA-65.",
            4200,
          );

        case "eth_sign":
        case "personal_sign":
        case "eth_signTypedData_v4":
          throw new Eip1193Error(`${method} signs with secp256k1, which this chain does not have.`, 4200);

        default:
          return forward(method, args);
      }
    },
  };
}
