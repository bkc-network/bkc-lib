import { ml_dsa65 } from "@noble/post-quantum/ml-dsa.js";

/**
 * Byte lengths of ML-DSA-65 (FIPS 204) key material, exposed so the address, pubkey and
 * signature encoders can check them: unlike ECC these are fixed, and large enough that a
 * silently truncated one is worth catching.
 */
export const mldsa65 = {
  /** The key generation seed (xi in FIPS 204), not the expanded private key. */
  seedLength: 32,
  pubkeyLength: 1952,
  privkeyLength: 4032,
  signatureLength: 3309,
} as const;

export class Mldsa65Keypair {
  public readonly privkey: Uint8Array;
  public readonly pubkey: Uint8Array;

  public constructor(privkey: Uint8Array, pubkey: Uint8Array) {
    this.privkey = privkey;
    this.pubkey = pubkey;
  }
}

/**
 * ML-DSA-65 (FIPS 204) post-quantum signature scheme.
 *
 * This is a thin wrapper around `@noble/post-quantum`, mirroring the shape of
 * the {@link Ed25519} class so the rest of the library can treat it the same way.
 *
 * Two habits from secp256k1 do not carry over: there is no public key compression and no
 * recovering a key from a signature, and the scheme hashes the message itself - callers
 * sign the raw bytes rather than pre-hashing the way the secp256k1 wallets do.
 *
 * Every operation here is synchronous underneath - `@noble/post-quantum` does the work on
 * the calling thread. The promises exist only because secp256k1 and ed25519 can be backed
 * by WebAssembly or a device and the library is shaped around that; the `*Sync` variants
 * are the same code without the wrapper, for callers already signing synchronously.
 */
export class Mldsa65 {
  /** Generates a keypair deterministically from a 32 byte seed. */
  public static async makeKeypair(seed: Uint8Array): Promise<Mldsa65Keypair> {
    return Mldsa65.makeKeypairSync(seed);
  }

  public static makeKeypairSync(seed: Uint8Array): Mldsa65Keypair {
    if (seed.length !== mldsa65.seedLength) {
      throw new Error(`Expected a seed of length ${mldsa65.seedLength}, got ${seed.length}`);
    }
    const { publicKey, secretKey } = ml_dsa65.keygen(seed);
    return new Mldsa65Keypair(secretKey, publicKey);
  }

  /** Derives the public key from an expanded 4032 byte secret key. */
  public static async makePubkey(privkey: Uint8Array): Promise<Uint8Array> {
    return Mldsa65.makePubkeySync(privkey);
  }

  public static makePubkeySync(privkey: Uint8Array): Uint8Array {
    if (privkey.length !== mldsa65.privkeyLength) {
      throw new Error(`Expected a privkey of length ${mldsa65.privkeyLength}, got ${privkey.length}`);
    }
    return ml_dsa65.getPublicKey(privkey);
  }

  /**
   * Signs a message with the expanded 4032 byte secret key.
   *
   * The message is passed to ML-DSA as-is (the scheme hashes it internally).
   */
  public static async createSignature(message: Uint8Array, privkey: Uint8Array): Promise<Uint8Array> {
    return Mldsa65.createSignatureSync(message, privkey);
  }

  public static createSignatureSync(message: Uint8Array, privkey: Uint8Array): Uint8Array {
    if (privkey.length !== mldsa65.privkeyLength) {
      throw new Error(`Expected a privkey of length ${mldsa65.privkeyLength}, got ${privkey.length}`);
    }
    return ml_dsa65.sign(message, privkey);
  }

  public static async verifySignature(
    signature: Uint8Array,
    message: Uint8Array,
    pubkey: Uint8Array,
  ): Promise<boolean> {
    return Mldsa65.verifySignatureSync(signature, message, pubkey);
  }

  public static verifySignatureSync(signature: Uint8Array, message: Uint8Array, pubkey: Uint8Array): boolean {
    if (pubkey.length !== mldsa65.pubkeyLength) {
      throw new Error(`Expected a pubkey of length ${mldsa65.pubkeyLength}, got ${pubkey.length}`);
    }
    return ml_dsa65.verify(signature, message, pubkey);
  }
}
