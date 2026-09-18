import { fromBase64, fromBech32, toHex } from "@bkc-network-lib/encoding";
import { TxBody, TxRaw } from "cosmjs-types/cosmos/tx/v1beta1/tx";

import { evmCallTypeUrl } from "./chain";
import { MsgExecuteEvmCall } from "./codec/bkc/bkc/v1/tx";
import { makeEvmCallMessage } from "./evmcall";
import { makeBkcRegistry } from "./registry";
import { realEvmCallTx } from "./testdata/realevmcalltx";

describe("MsgExecuteEvmCall codec", () => {
  it("decodes a transaction the chain actually accepted", () => {
    // Bytes taken verbatim from the node (tx D5A4A985…E8841). Generated code that merely
    // round-trips against itself proves nothing about the chain's wire format; this does.
    const txRaw = TxRaw.decode(fromBase64(realEvmCallTx.txBytesBase64));
    const body = TxBody.decode(txRaw.bodyBytes);

    expect(body.messages.length).toEqual(1);
    expect(body.messages[0].typeUrl).toEqual(evmCallTypeUrl);

    const message = MsgExecuteEvmCall.decode(body.messages[0].value);

    expect(message.sender).toEqual(realEvmCallTx.sender);
    expect(message.to).toEqual(realEvmCallTx.to);
    expect(toHex(message.data)).toEqual(realEvmCallTx.dataHex);
    expect(message.gasLimit).toEqual(BigInt(realEvmCallTx.gasLimit));
    expect(message.callNonce).toEqual(BigInt(realEvmCallTx.callNonce));
  });

  it("re-encodes those fields to the same bytes", () => {
    const txRaw = TxRaw.decode(fromBase64(realEvmCallTx.txBytesBase64));
    const original = TxBody.decode(txRaw.bodyBytes).messages[0].value;

    const reencoded = MsgExecuteEvmCall.encode(MsgExecuteEvmCall.decode(original)).finish();

    expect(toHex(reencoded)).toEqual(toHex(original));
  });

  it("registers on a registry, so a transaction can be built and read back", () => {
    const registry = makeBkcRegistry();

    const message = makeEvmCallMessage({
      sender: realEvmCallTx.sender,
      to: realEvmCallTx.to,
      data: Uint8Array.from(realEvmCallTx.dataHex.match(/.{2}/g)!.map((byte) => parseInt(byte, 16))),
      gasLimit: BigInt(realEvmCallTx.gasLimit),
      sequence: BigInt(realEvmCallTx.callNonce),
    });

    const encoded = registry.encodeAsAny(message);
    const decoded = registry.decode(encoded);

    expect(encoded.typeUrl).toEqual(evmCallTypeUrl);
    expect(decoded.sender).toEqual(realEvmCallTx.sender);
    expect(decoded.callNonce).toEqual(BigInt(realEvmCallTx.callNonce));
  });

  it("keeps the sender's two address spellings in agreement", () => {
    // the EVM address is the bech32 payload, which is what makes one account work on both
    // halves of this chain
    expect(`0x${toHex(fromBech32(realEvmCallTx.sender).data)}`).toEqual(realEvmCallTx.senderEvm);
  });
});
