import { Eip1193Provider } from "./provider";

/**
 * Reading logs further back than one query allows.
 *
 * The node answers `eth_getLogs` over at most 10,000 blocks, while ethers'
 * `queryFilter(filter)` with no range asks for everything since genesis - so the call a
 * builder reaches for first is exactly the one that cannot work. This walks the range in
 * windows instead, newest first, and stops as soon as it has enough.
 *
 * The cost is real and worth knowing: one window is roughly two hours of this chain, and
 * the node serves queries one at a time, so a day of history is about a dozen round trips.
 */

/** The node's own cap. */
export const maxLogBlockRange = 10000;

export interface PagedLogFilter {
  readonly address?: string | readonly string[];
  readonly topics?: ReadonlyArray<string | readonly string[] | null>;
  /** defaults to the latest block */
  readonly toBlock?: number;
  /** defaults to `toBlock` minus `maxWindows` windows */
  readonly fromBlock?: number;
}

export interface PagedLogOptions {
  /** stop after this many windows, however few logs were found (default 12, ~1 day) */
  readonly maxWindows?: number;
  /** stop early once this many logs are in hand */
  readonly limit?: number;
}

export interface EvmLog {
  readonly address: string;
  readonly topics: readonly string[];
  readonly data: string;
  readonly blockNumber: string;
  readonly transactionHash: string;
  readonly logIndex: string;
}

const toHexBlock = (block: number): string => `0x${block.toString(16)}`;

/**
 * Fetches logs by walking backwards a window at a time.
 *
 * Returns newest first. `reachedBlock` says how far back the walk actually got, so a
 * caller can continue from there rather than guess whether the history is exhausted.
 */
export async function getLogsPaged(
  provider: Eip1193Provider,
  filter: PagedLogFilter,
  options: PagedLogOptions = {},
): Promise<{ readonly logs: EvmLog[]; readonly reachedBlock: number }> {
  const maxWindows = options.maxWindows ?? 12;
  const limit = options.limit ?? Number.POSITIVE_INFINITY;

  const latest =
    filter.toBlock ?? Number(BigInt((await provider.request({ method: "eth_blockNumber" })) as string));
  const floor = filter.fromBlock ?? 0;

  const logs: EvmLog[] = [];
  let toBlock = latest;
  let windows = 0;

  while (windows < maxWindows && toBlock >= floor && logs.length < limit) {
    const fromBlock = Math.max(floor, toBlock - maxLogBlockRange + 1);

    const window = (await provider.request({
      method: "eth_getLogs",
      params: [
        {
          address: filter.address,
          topics: filter.topics,
          fromBlock: toHexBlock(fromBlock),
          toBlock: toHexBlock(toBlock),
        },
      ],
    })) as EvmLog[];

    logs.push(...window);

    if (fromBlock === floor) {
      toBlock = floor - 1;
      break;
    }

    toBlock = fromBlock - 1;
    windows += 1;
  }

  logs.sort((a, b) => Number(BigInt(b.blockNumber) - BigInt(a.blockNumber)));

  return {
    logs: logs.slice(0, Number.isFinite(limit) ? limit : undefined),
    reachedBlock: Math.max(toBlock + 1, floor),
  };
}
