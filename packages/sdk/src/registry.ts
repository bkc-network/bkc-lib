import { GeneratedType, Registry, TsProto2GeneratedType } from "@bkc-network-lib/proto-signing";
import { defaultRegistryTypes } from "@bkc-network-lib/stargate";

import { evmCallTypeUrl } from "./chain";
import { MsgExecuteEvmCall } from "./codec/bkc/bkc/v1/tx";

/** The chain's own message types, on top of what the Cosmos SDK defines. */
export const bkcRegistryTypes: ReadonlyArray<[string, GeneratedType]> = [
  // ts-proto v2 output: encodes through @bufbuild/protobuf's writer, which is the
  // TsProto2GeneratedType shape the registry accepts
  [evmCallTypeUrl, MsgExecuteEvmCall satisfies TsProto2GeneratedType],
];

/** A registry that can encode and decode everything BKC transactions carry. */
export function makeBkcRegistry(): Registry {
  return new Registry([...defaultRegistryTypes, ...bkcRegistryTypes]);
}
