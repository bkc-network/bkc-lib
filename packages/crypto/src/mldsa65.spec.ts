/* eslint-disable no-bitwise */
import { fromHex, toAscii } from "@bkc/encoding";

import { Mldsa65, mldsa65, Mldsa65Keypair } from "./mldsa65";
import { sha256 } from "./sha";

// A fixed key-generation seed (ξ) used to derive golden vectors below.
// ML-DSA key generation is deterministic in the seed, so these must not change
// as long as the underlying implementation stays byte-compatible with FIPS 204.
const seed = fromHex("00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff");

describe("Mldsa65", () => {
  it("exposes the FIPS 204 sizes", () => {
    expect(mldsa65.seedLength).toEqual(32);
    expect(mldsa65.pubkeyLength).toEqual(1952);
    expect(mldsa65.privkeyLength).toEqual(4032);
    expect(mldsa65.signatureLength).toEqual(3309);
  });

  it("generates a keypair deterministically from a seed", async () => {
    const keypair = await Mldsa65.makeKeypair(seed);
    expect(keypair).toBeInstanceOf(Mldsa65Keypair);
    expect(keypair.pubkey.length).toEqual(mldsa65.pubkeyLength);
    expect(keypair.privkey.length).toEqual(mldsa65.privkeyLength);

    // Golden vectors (compared via sha256 since the keys are large).
    expect(sha256(keypair.pubkey)).toEqual(
      fromHex("31d4758a807dc4354e95927873aa55f2a7d61fd2abdff69edaeffbbd84518951"),
    );
    expect(sha256(keypair.privkey)).toEqual(
      fromHex("b08d8aca591ed825c0cd05c82ce36693c7ade46aaea5f9b24427c2a49e8f5114"),
    );

    // Same seed => same keys.
    const again = await Mldsa65.makeKeypair(seed);
    expect(again.pubkey).toEqual(keypair.pubkey);
    expect(again.privkey).toEqual(keypair.privkey);
  });

  it("rejects a seed of wrong length", async () => {
    await expectAsync(Mldsa65.makeKeypair(new Uint8Array(31))).toBeRejectedWithError(/seed of length 32/i);
    await expectAsync(Mldsa65.makeKeypair(new Uint8Array(33))).toBeRejectedWithError(/seed of length 32/i);
  });

  it("derives the public key from the private key", async () => {
    const keypair = await Mldsa65.makeKeypair(seed);
    const pubkey = await Mldsa65.makePubkey(keypair.privkey);
    expect(pubkey).toEqual(keypair.pubkey);
  });

  it("creates a signature of the expected length and verifies it", async () => {
    const keypair = await Mldsa65.makeKeypair(seed);
    const message = toAscii("bkc mldsa65 test message");
    const signature = await Mldsa65.createSignature(message, keypair.privkey);
    expect(signature.length).toEqual(mldsa65.signatureLength);

    const ok = await Mldsa65.verifySignature(signature, message, keypair.pubkey);
    expect(ok).toEqual(true);
  });

  it("produces randomized (hedged) signatures that both verify", async () => {
    const keypair = await Mldsa65.makeKeypair(seed);
    const message = toAscii("hedged signing");
    const sig1 = await Mldsa65.createSignature(message, keypair.privkey);
    const sig2 = await Mldsa65.createSignature(message, keypair.privkey);
    // ML-DSA default signing is randomized, so two signatures over the same
    // message generally differ, yet both must verify.
    expect(sig1).not.toEqual(sig2);
    expect(await Mldsa65.verifySignature(sig1, message, keypair.pubkey)).toEqual(true);
    expect(await Mldsa65.verifySignature(sig2, message, keypair.pubkey)).toEqual(true);
  });

  it("fails verification for a tampered message", async () => {
    const keypair = await Mldsa65.makeKeypair(seed);
    const message = toAscii("original message");
    const signature = await Mldsa65.createSignature(message, keypair.privkey);

    const tampered = toAscii("original messagE");
    expect(await Mldsa65.verifySignature(signature, tampered, keypair.pubkey)).toEqual(false);
  });

  it("fails verification for a tampered signature", async () => {
    const keypair = await Mldsa65.makeKeypair(seed);
    const message = toAscii("original message");
    const signature = await Mldsa65.createSignature(message, keypair.privkey);

    const brokenSignature = Uint8Array.from(signature);
    brokenSignature[0] ^= 0x01;
    expect(await Mldsa65.verifySignature(brokenSignature, message, keypair.pubkey)).toEqual(false);
  });

  it("fails verification against a different public key", async () => {
    const keypair = await Mldsa65.makeKeypair(seed);
    const other = await Mldsa65.makeKeypair(
      fromHex("ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"),
    );
    const message = toAscii("original message");
    const signature = await Mldsa65.createSignature(message, keypair.privkey);
    expect(await Mldsa65.verifySignature(signature, message, other.pubkey)).toEqual(false);
  });
});
