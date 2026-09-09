import { encodeMldsa65Signature, rawMldsa65PubkeyToRawAddress } from "@bkc/amino";
import { Mldsa65 } from "@bkc/crypto";
import { toBech32 } from "@bkc/encoding";
import { SignDoc } from "cosmjs-types/cosmos/tx/v1beta1/tx";

import { AccountData, DirectSignResponse, OfflineDirectSigner } from "./signer";
import { makeSignBytes } from "./signing";

/**
 * A wallet that holds a single ML-DSA-65 (FIPS 204) keypair.
 *
 * This is the post-quantum counterpart of {@link DirectSecp256k1Wallet}. The
 * key material is large (privkey 4032 B, pubkey 1952 B) and there is no HD
 * derivation, so this wallet only wraps a single key. Use {@link fromSeed} to
 * generate the key deterministically from a 32 byte seed.
 */
export class DirectMldsa65Wallet implements OfflineDirectSigner {
  /**
   * Creates a DirectMldsa65Wallet from an expanded 4032 byte secret key.
   *
   * @param privkey The expanded ML-DSA-65 secret key.
   * @param prefix The bech32 address prefix (human readable part). Defaults to "cosmos".
   */
  public static async fromKey(privkey: Uint8Array, prefix = "cosmos"): Promise<DirectMldsa65Wallet> {
    const pubkey = await Mldsa65.makePubkey(privkey);
    return new DirectMldsa65Wallet(privkey, pubkey, prefix);
  }

  /**
   * Creates a DirectMldsa65Wallet deterministically from a 32 byte seed.
   *
   * @param seed The ML-DSA-65 key generation seed (ξ in FIPS 204).
   * @param prefix The bech32 address prefix (human readable part). Defaults to "cosmos".
   */
  public static async fromSeed(seed: Uint8Array, prefix = "cosmos"): Promise<DirectMldsa65Wallet> {
    const { privkey, pubkey } = await Mldsa65.makeKeypair(seed);
    return new DirectMldsa65Wallet(privkey, pubkey, prefix);
  }

  private readonly pubkey: Uint8Array;
  private readonly privkey: Uint8Array;
  private readonly prefix: string;

  private constructor(privkey: Uint8Array, pubkey: Uint8Array, prefix: string) {
    this.privkey = privkey;
    this.pubkey = pubkey;
    this.prefix = prefix;
  }

  private get address(): string {
    return toBech32(this.prefix, rawMldsa65PubkeyToRawAddress(this.pubkey));
  }

  public async getAccounts(): Promise<readonly AccountData[]> {
    return [
      {
        algo: "mldsa65",
        address: this.address,
        pubkey: this.pubkey,
      },
    ];
  }

  public async signDirect(address: string, signDoc: SignDoc): Promise<DirectSignResponse> {
    const signBytes = makeSignBytes(signDoc);
    if (address !== this.address) {
      throw new Error(`Address ${address} not found in wallet`);
    }
    // Unlike the secp256k1 wallets, we do NOT pre-hash the sign bytes: ML-DSA-65
    // hashes the message internally, so the raw sign bytes are signed directly.
    // CHAIN-DEPENDENT: this assumes the chain verifies over the raw sign bytes.
    const signature = await Mldsa65.createSignature(signBytes, this.privkey);
    const stdSignature = encodeMldsa65Signature(this.pubkey, signature);
    return {
      signed: signDoc,
      signature: stdSignature,
    };
  }
}
