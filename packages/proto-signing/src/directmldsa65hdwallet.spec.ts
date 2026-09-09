import { makeCosmoshubPath } from "@bkc/amino";
import { Mldsa65 } from "@bkc/crypto";
import { fromBase64, fromHex } from "@bkc/encoding";

import { DirectMldsa65HdWallet } from "./directmldsa65hdwallet";
import { makeSignBytes, makeSignDoc } from "./signing";
import { executeKdf } from "./wallet";

describe("DirectMldsa65HdWallet", () => {
  // Standard BIP39 test mnemonic (all-zero entropy).
  const mnemonic =
    "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
  // Golden address for this mnemonic with prefix "bkc" and the default path
  // m/44'/118'/0'/0/0 using the BKC HKDF convention. Verified end-to-end against
  // the live chain's on-chain ML-DSA verification precompile.
  const bkcAddress = "bkc1749qmcj8tl3zd9xdnepfgk67s7vza8gyw5njd7";

  describe("fromMnemonic", () => {
    it("works and exposes the mnemonic", async () => {
      const wallet = await DirectMldsa65HdWallet.fromMnemonic(mnemonic, { prefix: "bkc" });
      expect(wallet).toBeTruthy();
      expect(wallet.mnemonic).toEqual(mnemonic);
    });

    it("throws for invalid mnemonics", async () => {
      await expectAsync(DirectMldsa65HdWallet.fromMnemonic("not a valid mnemonic")).toBeRejected();
    });
  });

  describe("getAccounts", () => {
    it("derives the expected mldsa65 account (golden vector)", async () => {
      const wallet = await DirectMldsa65HdWallet.fromMnemonic(mnemonic, { prefix: "bkc" });
      const [account] = await wallet.getAccounts();
      expect(account.algo).toEqual("mldsa65");
      expect(account.pubkey.length).toEqual(1952);
      expect(account.address).toEqual(bkcAddress);
    });

    it("is deterministic", async () => {
      const a = await DirectMldsa65HdWallet.fromMnemonic(mnemonic, { prefix: "bkc" });
      const b = await DirectMldsa65HdWallet.fromMnemonic(mnemonic, { prefix: "bkc" });
      expect((await a.getAccounts())[0].address).toEqual((await b.getAccounts())[0].address);
    });

    it("derives distinct accounts for distinct HD paths", async () => {
      const wallet = await DirectMldsa65HdWallet.fromMnemonic(mnemonic, {
        prefix: "bkc",
        hdPaths: [makeCosmoshubPath(0), makeCosmoshubPath(1)],
      });
      const accounts = await wallet.getAccounts();
      expect(accounts.length).toEqual(2);
      expect(accounts[0].address).not.toEqual(accounts[1].address);
    });

    it("changing the HKDF salt changes the derived key", async () => {
      const a = await DirectMldsa65HdWallet.fromMnemonic(mnemonic, { prefix: "bkc" });
      const b = await DirectMldsa65HdWallet.fromMnemonic(mnemonic, { prefix: "bkc", hkdfSalt: "other-salt" });
      expect((await a.getAccounts())[0].address).not.toEqual((await b.getAccounts())[0].address);
    });
  });

  describe("signDirect", () => {
    it("produces a signature that verifies over the raw sign bytes", async () => {
      const wallet = await DirectMldsa65HdWallet.fromMnemonic(mnemonic, { prefix: "bkc" });
      const [account] = await wallet.getAccounts();
      const signDoc = makeSignDoc(fromHex("deadbeef"), fromHex("cafe"), "bkc-testing", 0);
      const { signature } = await wallet.signDirect(account.address, signDoc);

      const valid = await Mldsa65.verifySignature(
        fromBase64(signature.signature),
        makeSignBytes(signDoc),
        account.pubkey,
      );
      expect(valid).toEqual(true);
    });

    it("throws for a foreign address", async () => {
      const wallet = await DirectMldsa65HdWallet.fromMnemonic(mnemonic, { prefix: "bkc" });
      const signDoc = makeSignDoc(fromHex("deadbeef"), fromHex("cafe"), "bkc-testing", 0);
      await expectAsync(
        wallet.signDirect("bkc1foreignxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", signDoc),
      ).toBeRejectedWithError(/not found in wallet/i);
    });
  });

  describe("generate", () => {
    it("creates a usable wallet with a fresh mnemonic", async () => {
      const wallet = await DirectMldsa65HdWallet.generate(12, { prefix: "bkc" });
      expect(wallet.mnemonic.split(" ").length).toEqual(12);
      const [account] = await wallet.getAccounts();
      expect(account.algo).toEqual("mldsa65");
      expect(account.address.startsWith("bkc1")).toEqual(true);
    });
  });

  describe("serialization", () => {
    it("round-trips through serialize/deserialize with a password", async () => {
      const original = await DirectMldsa65HdWallet.fromMnemonic(mnemonic, { prefix: "bkc" });
      const serialized = await original.serialize("passw0rd");
      // The keystore is JSON and must NOT leak the mnemonic in clear text.
      expect(serialized).toContain("directmldsa65hdwallet-v1");
      expect(serialized).not.toContain(mnemonic);

      const restored = await DirectMldsa65HdWallet.deserialize(serialized, "passw0rd");
      expect(restored.mnemonic).toEqual(mnemonic);
      expect((await restored.getAccounts())[0].address).toEqual(bkcAddress);
    });

    it("preserves multiple hd paths and a custom hkdfSalt", async () => {
      const original = await DirectMldsa65HdWallet.fromMnemonic(mnemonic, {
        prefix: "bkc",
        hkdfSalt: "custom-salt",
        hdPaths: [makeCosmoshubPath(0), makeCosmoshubPath(1)],
      });
      const before = (await original.getAccounts()).map((a) => a.address);
      const restored = await DirectMldsa65HdWallet.deserialize(await original.serialize("pw"), "pw");
      const after = (await restored.getAccounts()).map((a) => a.address);
      expect(after).toEqual(before);
    });

    it("fails to deserialize with a wrong password", async () => {
      const serialized = await (
        await DirectMldsa65HdWallet.fromMnemonic(mnemonic, { prefix: "bkc" })
      ).serialize("right");
      await expectAsync(DirectMldsa65HdWallet.deserialize(serialized, "wrong")).toBeRejected();
    });

    it("supports the split KDF (extractKdfConfiguration + deserializeWithEncryptionKey)", async () => {
      const original = await DirectMldsa65HdWallet.fromMnemonic(mnemonic, { prefix: "bkc" });
      const serialized = await original.serialize("pw");
      const kdf = DirectMldsa65HdWallet.extractKdfConfiguration(serialized);
      const key = await executeKdf("pw", kdf);
      const restored = await DirectMldsa65HdWallet.deserializeWithEncryptionKey(serialized, key);
      expect(restored.mnemonic).toEqual(mnemonic);
    });
  });
});
