/**
 * What an EVM transaction actually cost.
 *
 * `receipt.fee` is always zero here, and that is not a bug in the receipt: the call was
 * carried by a Cosmos transaction, and that is where the fee was charged. The EVM side
 * honestly reports a zero gas price because no EVM gas was ever priced.
 *
 * The two sides are linked by the `ethereum_tx` event the chain emits, which is what makes
 * this lookup possible at all.
 */

export interface EvmTransactionCost {
  /** hash the chain's REST API answers to */
  readonly cosmosTxHash: string;
  /** what was actually paid, in base units */
  readonly fee: string;
  readonly denom: string;
  readonly gasUsed: bigint;
  readonly gasWanted: bigint;
  readonly height: number;
}

/**
 * Looks up the real cost of an EVM transaction, given its Ethereum hash.
 *
 * `lcdUrl` is the chain's REST endpoint: the tx search is served there, not by the EVM RPC.
 */
export async function getEvmTransactionCost(
  ethereumTxHash: string,
  lcdUrl: string,
): Promise<EvmTransactionCost | null> {
  const query = encodeURIComponent(`ethereum_tx.ethereumTxHash='${ethereumTxHash}'`);

  const response = await fetch(`${lcdUrl}/cosmos/tx/v1beta1/txs?query=${query}&limit=1`);

  if (!response.ok) {
    throw new Error(`Transaction lookup failed: ${response.status}`);
  }

  // field names below are the LCD's own JSON, not a style choice
  /* eslint-disable @typescript-eslint/naming-convention */
  const body = (await response.json()) as {
    tx_responses?: Array<{
      txhash: string;
      height: string;
      gas_used: string;
      gas_wanted: string;
      tx?: { auth_info?: { fee?: { amount?: Array<{ denom: string; amount: string }> } } };
    }>;
  };
  /* eslint-enable @typescript-eslint/naming-convention */

  const found = body.tx_responses?.[0];

  if (!found) return null;

  const paid = found.tx?.auth_info?.fee?.amount?.[0];

  return {
    cosmosTxHash: found.txhash,
    fee: paid?.amount ?? "0",
    denom: paid?.denom ?? "",
    gasUsed: BigInt(found.gas_used),
    gasWanted: BigInt(found.gas_wanted),
    height: Number(found.height),
  };
}
