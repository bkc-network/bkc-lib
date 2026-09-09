import { coins } from "@bkc/amino";
import { Mldsa65 } from "@bkc/crypto";
import { fromBase64, fromHex } from "@bkc/encoding";

import { DirectMldsa65Wallet } from "./directmldsa65wallet";
import { makeAuthInfoBytes, makeSignBytes, makeSignDoc } from "./signing";
import { testVectors } from "./testutils";

describe("DirectMldsa65Wallet", () => {
  // Deterministic key material derived from this seed (see mldsa65.spec.ts).
  const defaultSeed = fromHex("00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff");
  const defaultAddress = "cosmos1x828tz5q0hzr2n54jfu882j472nav87j2ztjzf";

  describe("fromSeed", () => {
    it("works", async () => {
      const signer = await DirectMldsa65Wallet.fromSeed(defaultSeed);
      expect(signer).toBeTruthy();
    });
  });

  describe("fromKey", () => {
    it("produces the same wallet as fromSeed", async () => {
      const { privkey } = await Mldsa65.makeKeypair(defaultSeed);
      const fromKey = await DirectMldsa65Wallet.fromKey(privkey);
      const fromSeed = await DirectMldsa65Wallet.fromSeed(defaultSeed);
      expect((await fromKey.getAccounts())[0]).toEqual((await fromSeed.getAccounts())[0]);
    });
  });

  describe("getAccounts", () => {
    it("resolves to a single mldsa65 account", async () => {
      const signer = await DirectMldsa65Wallet.fromSeed(defaultSeed);
      const { pubkey } = await Mldsa65.makeKeypair(defaultSeed);
      const accounts = await signer.getAccounts();
      expect(accounts.length).toEqual(1);
      expect(accounts[0]).toEqual({
        address: defaultAddress,
        algo: "mldsa65",
        pubkey: pubkey,
      });
    });
  });

  describe("signDirect", () => {
    it("resolves to a signature that verifies over the raw sign bytes", async () => {
      const { accountNumber, sequence, bodyBytes } = testVectors[1].inputs;
      const wallet = await DirectMldsa65Wallet.fromSeed(defaultSeed);
      const accounts = await wallet.getAccounts();
      const pubkey = {
        typeUrl: "/cosmos.crypto.mldsa65.PubKey",
        value: accounts[0].pubkey,
      };
      const fee = coins(2000, "ucosm");
      const gasLimit = 200000;
      const chainId = "simd-testing";
      const signDoc = makeSignDoc(
        fromHex(bodyBytes),
        makeAuthInfoBytes([{ pubkey, sequence }], fee, gasLimit, undefined, undefined),
        chainId,
        accountNumber,
      );
      const signDocBytes = makeSignBytes(signDoc);
      const { signature } = await wallet.signDirect(accounts[0].address, signDoc);
      // ML-DSA-65 verifies over the raw sign bytes (no pre-hash).
      const valid = await Mldsa65.verifySignature(
        fromBase64(signature.signature),
        signDocBytes,
        accounts[0].pubkey,
      );
      expect(valid).toEqual(true);
    });

    it("throws for a foreign address", async () => {
      const { accountNumber, sequence, bodyBytes } = testVectors[1].inputs;
      const wallet = await DirectMldsa65Wallet.fromSeed(defaultSeed);
      const signDoc = makeSignDoc(fromHex(bodyBytes), new Uint8Array(), "simd-testing", accountNumber);
      void sequence;
      await expectAsync(
        wallet.signDirect("cosmos1foreignaddressxxxxxxxxxxxxxxxxxxxxxxxx", signDoc),
      ).toBeRejectedWithError(/address .* not found in wallet/i);
    });
  });
});
