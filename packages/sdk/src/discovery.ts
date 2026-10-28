import { GasPrice } from "@bkc-network-lib/stargate";

import { bkcChain } from "./chain";

/**
 * What the chain says about itself, asked of the node rather than compiled in.
 *
 * These belong to a running network, not to a release of this package: BKC test networks are
 * rebuilt from genesis, and 1.0.0 shipped a gas price 13,333 times the minimum that followed
 * and a chain id no wallet would enable.
 */

/** The two endpoints every helper in this package already takes. */
export interface ChainEndpoints {
  readonly evmRpcUrl: string;
  readonly cosmosRpcUrl: string;
}

export interface DiscoveredChain {
  /** Signed into every transaction, so it must match the node exactly. */
  readonly chainId: string;
  readonly evmChainId: number;
  readonly gasPrice: GasPrice;
}

interface CometStatus {
  // eslint-disable-next-line @typescript-eslint/naming-convention -- the wire name CometBFT sends
  result?: { node_info?: { network?: string } };
}

/**
 * The promise is cached, not the result, so helpers reaching for this during one connect
 * share a single round trip. Rejections are evicted rather than remembered.
 */
const inFlight = new Map<string, Promise<DiscoveredChain>>();

function cacheKey(endpoints: ChainEndpoints): string {
  return `${endpoints.cosmosRpcUrl} ${endpoints.evmRpcUrl}`;
}

/** A node behind a proxy is often configured with a trailing slash, and `//status` 404s. */
function statusUrl(cosmosRpcUrl: string): string {
  return `${cosmosRpcUrl.replace(/\/+$/, "")}/status`;
}

async function evmCall(evmRpcUrl: string, method: string): Promise<string> {
  const response = await fetch(evmRpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: [] }),
  });

  if (!response.ok) {
    throw new Error(`${method} on ${evmRpcUrl} returned HTTP ${response.status}`);
  }

  const body = (await response.json()) as { result?: unknown; error?: { message?: string } };

  if (body.error) {
    throw new Error(`${method} on ${evmRpcUrl} failed: ${body.error.message ?? "unknown error"}`);
  }
  if (typeof body.result !== "string") {
    throw new Error(`${method} on ${evmRpcUrl} answered with no result`);
  }

  return body.result;
}

async function askTheNode(endpoints: ChainEndpoints): Promise<DiscoveredChain> {
  const { cosmosRpcUrl, evmRpcUrl } = endpoints;

  // Independent questions, so one round trip of wall time rather than three.
  const [status, evmChainIdHex, gasPriceHex] = await Promise.all([
    fetch(statusUrl(cosmosRpcUrl)).then(async (response) => {
      if (!response.ok) {
        throw new Error(`${statusUrl(cosmosRpcUrl)} returned HTTP ${response.status}`);
      }
      return (await response.json()) as CometStatus;
    }),
    evmCall(evmRpcUrl, "eth_chainId"),
    evmCall(evmRpcUrl, "eth_gasPrice"),
  ]);

  const chainId = status.result?.node_info?.network;
  if (!chainId) {
    throw new Error(`${statusUrl(cosmosRpcUrl)} reported no chain id. Is cosmosRpcUrl a CometBFT RPC?`);
  }

  const gasPrice = BigInt(gasPriceHex);
  if (gasPrice <= 0n) {
    throw new Error(`eth_gasPrice on ${evmRpcUrl} reported ${gasPriceHex}; a write needs a real price`);
  }

  // The denom belongs to the chain rather than to a network, so it costs no request.
  return {
    chainId,
    evmChainId: Number(BigInt(evmChainIdHex)),
    gasPrice: GasPrice.fromString(`${gasPrice}${bkcChain.denom}`),
  };
}

/**
 * Ask the node for its chain id, EVM chain id and gas price. Cached per pair of endpoints;
 * {@link forgetDiscoveredChain} after a chain is rebuilt under the same URLs.
 */
export async function discoverChain(endpoints: ChainEndpoints): Promise<DiscoveredChain> {
  const key = cacheKey(endpoints);
  const cached = inFlight.get(key);
  if (cached) return cached;

  const lookup = askTheNode(endpoints).catch((cause: unknown) => {
    inFlight.delete(key);
    throw cause;
  });

  inFlight.set(key, lookup);
  return lookup;
}

/** Drop what was discovered: for one pair of endpoints, or all of them. */
export function forgetDiscoveredChain(endpoints?: ChainEndpoints): void {
  if (endpoints) {
    inFlight.delete(cacheKey(endpoints));
    return;
  }

  inFlight.clear();
}
