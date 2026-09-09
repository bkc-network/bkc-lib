import { Mldsa65 } from "@bkc/crypto";
import { fromBase64, fromHex, toBase64 } from "@bkc/encoding";

import {
  decodeSignature,
  encodeEthSecp256k1Signature,
  encodeMldsa65Signature,
  encodeSecp256k1Signature,
  StdSignature,
} from "./signature";

describe("signature", () => {
  describe("encodeSecp256k1Signature", () => {
    it("encodes a full signature", () => {
      const pubkey = fromBase64("AtQaCqFnshaZQp6rIkvAPyzThvCvXSDO+9AzbxVErqJP");
      const signature = fromBase64(
        "1nUcIH0CLT0/nQ0mBTDrT6kMG20NY/PsH7P2gc4bpYNGLEYjBmdWevXUJouSE/9A/60QG9cYeqyTe5kFDeIPxQ==",
      );
      expect(encodeSecp256k1Signature(pubkey, signature)).toEqual({
        pub_key: {
          type: "tendermint/PubKeySecp256k1",
          value: "AtQaCqFnshaZQp6rIkvAPyzThvCvXSDO+9AzbxVErqJP",
        },
        signature: "1nUcIH0CLT0/nQ0mBTDrT6kMG20NY/PsH7P2gc4bpYNGLEYjBmdWevXUJouSE/9A/60QG9cYeqyTe5kFDeIPxQ==",
      });
    });

    it("throws when getting uncompressed public keys", () => {
      const pubkey = fromBase64(
        "BE8EGB7ro1ORuFhjOnZcSgwYlpe0DSFjVNUIkNNQxwKQE7WHpoHoNswYeoFkuYpYSKK4mzFzMV/dB0DVAy4lnNU=",
      );
      const signature = fromBase64(
        "1nUcIH0CLT0/nQ0mBTDrT6kMG20NY/PsH7P2gc4bpYNGLEYjBmdWevXUJouSE/9A/60QG9cYeqyTe5kFDeIPxQ==",
      );
      expect(() => encodeSecp256k1Signature(pubkey, signature)).toThrowError(
        /public key must be compressed secp256k1/i,
      );
    });

    it("throws if signature contains recovery byte", () => {
      const pubkey = fromBase64("AtQaCqFnshaZQp6rIkvAPyzThvCvXSDO+9AzbxVErqJP");
      const signature = Uint8Array.from([
        ...fromBase64(
          "1nUcIH0CLT0/nQ0mBTDrT6kMG20NY/PsH7P2gc4bpYNGLEYjBmdWevXUJouSE/9A/60QG9cYeqyTe5kFDeIPxQ==",
        ),
        99,
      ]);
      expect(() => encodeSecp256k1Signature(pubkey, signature)).toThrowError(
        /signature must be 64 bytes long/i,
      );
    });
  });

  describe("encodeEthSecp256k1Signature", () => {
    it("encodes a full signature", () => {
      const pubkey = fromBase64("AywEwHmedyGF0jQ11+SY/dLGn/QwoN+cf09VWFAfUxUs");
      const signature = fromBase64(
        "sGcYUlDfO1PDA/Z9NqUBtgSTdRTJ+AJ8tvgw+5qtXalPgh5XqZj4R2eY1b7RXMU1m5and6aOl7YGpk9cZnESmQ==",
      );
      expect(encodeEthSecp256k1Signature(pubkey, signature)).toEqual({
        pub_key: {
          type: "os/PubKeyEthSecp256k1",
          value: "AywEwHmedyGF0jQ11+SY/dLGn/QwoN+cf09VWFAfUxUs",
        },
        signature: "sGcYUlDfO1PDA/Z9NqUBtgSTdRTJ+AJ8tvgw+5qtXalPgh5XqZj4R2eY1b7RXMU1m5and6aOl7YGpk9cZnESmQ==",
      });
    });

    it("throws when getting uncompressed public keys", () => {
      const pubkey = fromBase64(
        "BE8EGB7ro1ORuFhjOnZcSgwYlpe0DSFjVNUIkNNQxwKQE7WHpoHoNswYeoFkuYpYSKK4mzFzMV/dB0DVAy4lnNU=",
      );
      const signature = fromBase64(
        "sGcYUlDfO1PDA/Z9NqUBtgSTdRTJ+AJ8tvgw+5qtXalPgh5XqZj4R2eY1b7RXMU1m5and6aOl7YGpk9cZnESmQ==",
      );
      expect(() => encodeEthSecp256k1Signature(pubkey, signature)).toThrowError(
        /public key must be compressed secp256k1/i,
      );
    });

    it("throws if signature contains recovery byte", () => {
      const pubkey = fromBase64("AywEwHmedyGF0jQ11+SY/dLGn/QwoN+cf09VWFAfUxUs");
      const signature = Uint8Array.from([
        ...fromBase64(
          "sGcYUlDfO1PDA/Z9NqUBtgSTdRTJ+AJ8tvgw+5qtXalPgh5XqZj4R2eY1b7RXMU1m5and6aOl7YGpk9cZnESmQ==",
        ),
        99,
      ]);
      expect(() => encodeEthSecp256k1Signature(pubkey, signature)).toThrowError(
        /signature must be 64 bytes long/i,
      );
    });
  });

  describe("encodeMldsa65Signature", () => {
    const seed = fromHex("00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff");

    it("encodes a full signature", async () => {
      const { pubkey, privkey } = await Mldsa65.makeKeypair(seed);
      const signature = await Mldsa65.createSignature(new Uint8Array([1, 2, 3, 4]), privkey);

      const encoded = encodeMldsa65Signature(pubkey, signature);
      expect(encoded.pub_key.type).toEqual("cosmos/PubKeyMlDsa65");
      expect(fromBase64(encoded.pub_key.value)).toEqual(pubkey);
      expect(fromBase64(encoded.signature)).toEqual(signature);
    });
  });

  describe("decodeSignature", () => {
    it("works for secp256k1", () => {
      const signature: StdSignature = {
        pub_key: {
          type: "tendermint/PubKeySecp256k1",
          value: "AtQaCqFnshaZQp6rIkvAPyzThvCvXSDO+9AzbxVErqJP",
        },
        signature: "1nUcIH0CLT0/nQ0mBTDrT6kMG20NY/PsH7P2gc4bpYNGLEYjBmdWevXUJouSE/9A/60QG9cYeqyTe5kFDeIPxQ==",
      };
      expect(decodeSignature(signature)).toEqual({
        pubkey: fromBase64("AtQaCqFnshaZQp6rIkvAPyzThvCvXSDO+9AzbxVErqJP"),
        signature: fromBase64(
          "1nUcIH0CLT0/nQ0mBTDrT6kMG20NY/PsH7P2gc4bpYNGLEYjBmdWevXUJouSE/9A/60QG9cYeqyTe5kFDeIPxQ==",
        ),
      });
    });

    it("works for ethsecp256k1", () => {
      const signature: StdSignature = {
        pub_key: {
          type: "os/PubKeyEthSecp256k1",
          value: "AywEwHmedyGF0jQ11+SY/dLGn/QwoN+cf09VWFAfUxUs",
        },
        signature: "sGcYUlDfO1PDA/Z9NqUBtgSTdRTJ+AJ8tvgw+5qtXalPgh5XqZj4R2eY1b7RXMU1m5and6aOl7YGpk9cZnESmQ==",
      };
      expect(decodeSignature(signature)).toEqual({
        pubkey: fromBase64("AywEwHmedyGF0jQ11+SY/dLGn/QwoN+cf09VWFAfUxUs"),
        signature: fromBase64(
          "sGcYUlDfO1PDA/Z9NqUBtgSTdRTJ+AJ8tvgw+5qtXalPgh5XqZj4R2eY1b7RXMU1m5and6aOl7YGpk9cZnESmQ==",
        ),
      });
    });

    it("works for mldsa65", async () => {
      const { pubkey, privkey } = await Mldsa65.makeKeypair(
        fromHex("00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff"),
      );
      const signature = await Mldsa65.createSignature(new Uint8Array([1, 2, 3, 4]), privkey);
      const stdSignature: StdSignature = {
        pub_key: { type: "cosmos/PubKeyMlDsa65", value: toBase64(pubkey) },
        signature: toBase64(signature),
      };
      expect(decodeSignature(stdSignature)).toEqual({ pubkey, signature });
    });
  });
});
