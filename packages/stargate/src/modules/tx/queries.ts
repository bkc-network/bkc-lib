import { Pubkey, pubkeyType } from "@bkc/amino";
import { mldsa65 } from "@bkc/crypto";
import { encodePubkey } from "@bkc/proto-signing";
import { SignMode } from "cosmjs-types/cosmos/tx/signing/v1beta1/signing";
import {
  GetTxRequest,
  GetTxResponse,
  ServiceClientImpl,
  SimulateRequest,
  SimulateResponse,
} from "cosmjs-types/cosmos/tx/v1beta1/service";
import { AuthInfo, Fee, Tx, TxBody } from "cosmjs-types/cosmos/tx/v1beta1/tx";
import { Any } from "cosmjs-types/google/protobuf/any";

import { createProtobufRpcClient, QueryClient } from "../../queryclient";

export interface TxExtension {
  readonly tx: {
    getTx: (txId: string) => Promise<GetTxResponse>;
    simulate: (
      messages: readonly Any[],
      memo: string | undefined,
      signer: Pubkey,
      sequence: number,
    ) => Promise<SimulateResponse>;
    // Add here with tests:
    // - broadcastTx
    // - getTxsEvent
  };
}

export function setupTxExtension(base: QueryClient): TxExtension {
  // Use this service to get easy typed access to query methods
  // This cannot be used for proof verification
  const rpc = createProtobufRpcClient(base);
  const queryService = new ServiceClientImpl(rpc);

  return {
    tx: {
      getTx: async (txId: string) => {
        const request: GetTxRequest = {
          hash: txId,
        };
        const response = await queryService.GetTx(request);
        return response;
      },
      simulate: async (
        messages: readonly Any[],
        memo: string | undefined,
        signer: Pubkey,
        sequence: number,
      ) => {
        // ML-DSA-65 chains (BKC) are SIGN_MODE_DIRECT-only, and the ~3.3 KB signature must be a
        // realistic placeholder or the tx-size gas is under-estimated. secp/ed keep the original.
        const isMldsa65 = signer.type === pubkeyType.mldsa65;
        const mode = isMldsa65 ? SignMode.SIGN_MODE_DIRECT : SignMode.SIGN_MODE_UNSPECIFIED;
        const dummySignature = isMldsa65 ? new Uint8Array(mldsa65.signatureLength) : new Uint8Array();
        const tx = Tx.fromPartial({
          authInfo: AuthInfo.fromPartial({
            fee: Fee.fromPartial({}),
            signerInfos: [
              {
                publicKey: encodePubkey(signer),
                sequence: BigInt(sequence),
                modeInfo: { single: { mode: mode } },
              },
            ],
          }),
          body: TxBody.fromPartial({
            messages: Array.from(messages),
            memo: memo,
          }),
          signatures: [dummySignature],
        });
        const request = SimulateRequest.fromPartial({
          txBytes: Tx.encode(tx).finish(),
        });
        const response = await queryService.Simulate(request);
        return response;
      },
    },
  };
}
