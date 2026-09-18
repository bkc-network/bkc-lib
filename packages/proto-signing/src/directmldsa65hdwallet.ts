import {
  encodeMldsa65Signature,
  makeCosmoshubPath,
  rawMldsa65PubkeyToRawAddress,
} from "@bkc-network-lib/amino";
import {
  type HdPath,
  Bip39,
  EnglishMnemonic,
  hkdfSha256,
  Mldsa65,
  mldsa65,
  pathToString,
  Random,
  stringToPath,
} from "@bkc-network-lib/crypto";
import { fromBase64, fromUtf8, toBase64, toBech32, toUtf8 } from "@bkc-network-lib/encoding";
import { assert, isNonNullObject } from "@bkc-network-lib/utils";
import { SignDoc } from "cosmjs-types/cosmos/tx/v1beta1/tx";

import { AccountData, DirectSignResponse, OfflineDirectSigner } from "./signer";
import { makeSignBytes } from "./signing";
import {
  decrypt,
  encrypt,
  EncryptionConfiguration,
  executeKdf,
  KdfConfiguration,
  supportedAlgorithms,
} from "./wallet";

/**
 * CHAIN-DEPENDENT: the HKDF salt the BKC chain uses to derive an ML-DSA-65 seed
 * from a BIP39 seed (see the chain's `crypto/hd/algo.go`). Change this to match
 * your chain if it uses a different salt.
 */
export const mldsa65HkdfSalt = "BKC/ML-DSA-65";

/**
 * The 32 byte ML-DSA-65 seed for one HD path.
 *
 * There is no BIP-32 or SLIP-0010 for lattice keys, so the chain defines its own
 * derivation and every client has to match it byte for byte: the same mnemonic must
 * produce the same account in a wallet, in the CLI and in a script. Exported rather than
 * kept private for exactly that reason - a second implementation is a second chance to
 * get it wrong.
 *
 * `hdPath` is the HKDF info, used verbatim, e.g. `m/44'/118'/0'/0/0`.
 */
export function deriveMldsa65Seed(
  bip39Seed: Uint8Array,
  hdPath: HdPath | string,
  salt: string = mldsa65HkdfSalt,
): Uint8Array {
  const info = typeof hdPath === "string" ? hdPath : pathToString(hdPath);
  return hkdfSha256(bip39Seed, toUtf8(salt), toUtf8(info), mldsa65.seedLength);
}

export interface DirectMldsa65HdWalletOptions {
  /** The password to use when deriving a BIP39 seed from a mnemonic. */
  readonly bip39Password: string;
  /** The BIP-44 paths for deriving accounts. Defaults to a single Cosmos Hub path. */
  readonly hdPaths: readonly HdPath[];
  /** The bech32 address prefix (human readable part). */
  readonly prefix: string;
  /** CHAIN-DEPENDENT HKDF salt (see {@link mldsa65HkdfSalt}). */
  readonly hkdfSalt: string;
}

interface DirectMldsa65HdWalletConstructorOptions extends Partial<DirectMldsa65HdWalletOptions> {
  readonly seed: Uint8Array;
}

const defaultOptions: DirectMldsa65HdWalletOptions = {
  bip39Password: "",
  hdPaths: [makeCosmoshubPath(0)],
  prefix: "cosmos",
  hkdfSalt: mldsa65HkdfSalt,
};

interface Mldsa65Keypair {
  readonly privkey: Uint8Array;
  readonly pubkey: Uint8Array;
}

const serializationTypeV1 = "directmldsa65hdwallet-v1";

/**
 * A KDF configuration that is not very strong but can be used on the main thread.
 * Mirrors the one used by {@link DirectSecp256k1HdWallet}.
 */
const basicPasswordHashingOptions: KdfConfiguration = {
  algorithm: "argon2id",
  params: {
    outputLength: 32,
    opsLimit: 24,
    memLimitKib: 12 * 1024,
  },
};

/**
 * A JSON object holding the encrypted wallet and its metadata. All fields must be JSON types.
 */
export interface DirectMldsa65HdWalletSerialization {
  /** A format+version identifier for this serialization format */
  readonly type: string;
  /** Information about the key derivation function (i.e. password to encryption key) */
  readonly kdf: KdfConfiguration;
  /** Information about the symmetric encryption */
  readonly encryption: EncryptionConfiguration;
  /** An instance of DirectMldsa65HdWalletData, which is stringified, encrypted and base64 encoded. */
  readonly data: string;
}

/** Per-account derivation info in JSON form. All fields must be JSON types. */
interface DerivationInfoJson {
  readonly hdPath: string;
  readonly prefix: string;
}

function isDerivationJson(thing: unknown): thing is DerivationInfoJson {
  if (!isNonNullObject(thing)) return false;
  if (typeof (thing as DerivationInfoJson).hdPath !== "string") return false;
  if (typeof (thing as DerivationInfoJson).prefix !== "string") return false;
  return true;
}

/**
 * The decrypted wallet data (all fields JSON). Persists `hkdfSalt` too — seed derivation depends
 * on it, so a different salt on restore would yield different keys.
 */
interface DirectMldsa65HdWalletData {
  readonly mnemonic: string;
  readonly hkdfSalt: string;
  readonly accounts: readonly DerivationInfoJson[];
}

/**
 * A wallet that derives ML-DSA-65 (FIPS 204) keypairs from a BIP39 mnemonic.
 *
 * ML-DSA has no standard BIP-32/SLIP-0010 hierarchical derivation, so instead of
 * SLIP-0010 this mirrors the BKC chain convention:
 *
 *   bip39Seed = BIP39(mnemonic, bip39Password)
 *   mldsaSeed = HKDF-SHA256(ikm=bip39Seed, salt=hkdfSalt, info=hdPath, length=32)
 *   keypair   = ML-DSA-65 keygen(mldsaSeed)
 *
 * The `hdPath` used as HKDF info is the string form (e.g. "m/44'/118'/0'/0/0"),
 * matching how the chain's keyring passes it. This is the post-quantum
 * counterpart of {@link DirectSecp256k1HdWallet}.
 */
export class DirectMldsa65HdWallet implements OfflineDirectSigner {
  /**
   * Restores a wallet from the given BIP39 mnemonic.
   *
   * @param mnemonic Any valid English mnemonic.
   * @param options An optional `DirectMldsa65HdWalletOptions` object.
   */
  public static async fromMnemonic(
    mnemonic: string,
    options: Partial<DirectMldsa65HdWalletOptions> = {},
  ): Promise<DirectMldsa65HdWallet> {
    const mnemonicChecked = new EnglishMnemonic(mnemonic);
    const seed = await Bip39.mnemonicToSeed(
      mnemonicChecked,
      options.bip39Password ?? defaultOptions.bip39Password,
    );
    return new DirectMldsa65HdWallet(mnemonicChecked, { ...options, seed });
  }

  /**
   * Generates a new wallet with a BIP39 mnemonic of the given length.
   *
   * @param length The number of words in the mnemonic (12, 15, 18, 21 or 24).
   * @param options An optional `DirectMldsa65HdWalletOptions` object.
   */
  public static async generate(
    length: 12 | 15 | 18 | 21 | 24 = 12,
    options: Partial<DirectMldsa65HdWalletOptions> = {},
  ): Promise<DirectMldsa65HdWallet> {
    const entropyLength = 4 * Math.floor((11 * length) / 33);
    const entropy = Random.getBytes(entropyLength);
    const mnemonic = Bip39.encode(entropy);
    return DirectMldsa65HdWallet.fromMnemonic(mnemonic.toString(), options);
  }

  /**
   * Extracts the KDF configuration from a serialization, so the encryption key can be derived
   * off the main thread and passed to {@link deserializeWithEncryptionKey}.
   */
  public static extractKdfConfiguration(serialization: string): KdfConfiguration {
    const root = JSON.parse(serialization);
    if (!isNonNullObject(root)) throw new Error("Root document is not an object.");
    switch ((root as any).type) {
      case serializationTypeV1:
        return (root as any).kdf;
      default:
        throw new Error("Unsupported serialization type");
    }
  }

  /**
   * Restores a wallet from an encrypted serialization produced by {@link serialize}.
   *
   * @param password The user provided password used to generate an encryption key via a KDF.
   */
  public static async deserialize(serialization: string, password: string): Promise<DirectMldsa65HdWallet> {
    const root = JSON.parse(serialization);
    if (!isNonNullObject(root)) throw new Error("Root document is not an object.");
    switch ((root as any).type) {
      case serializationTypeV1:
        return DirectMldsa65HdWallet.deserializeTypeV1(serialization, password);
      default:
        throw new Error("Unsupported serialization type");
    }
  }

  /**
   * Restores a wallet from an encrypted serialization using a pre-computed encryption key.
   *
   * This lets you offload the KDF execution to a non-UI thread (e.g. a WebWorker). Derive the key
   * with `DirectMldsa65HdWallet.extractKdfConfiguration(serialization)` + `executeKdf(password, kdf)`.
   */
  public static async deserializeWithEncryptionKey(
    serialization: string,
    encryptionKey: Uint8Array,
  ): Promise<DirectMldsa65HdWallet> {
    const root = JSON.parse(serialization);
    if (!isNonNullObject(root)) throw new Error("Root document is not an object.");
    const untypedRoot: any = root;
    switch (untypedRoot.type) {
      case serializationTypeV1: {
        const decryptedBytes = await decrypt(
          fromBase64(untypedRoot.data),
          encryptionKey,
          untypedRoot.encryption,
        );
        const decryptedDocument = JSON.parse(fromUtf8(decryptedBytes));
        const { mnemonic, hkdfSalt, accounts } = decryptedDocument;
        assert(typeof mnemonic === "string");
        if (!Array.isArray(accounts)) throw new Error("Property 'accounts' is not an array");
        if (!accounts.every((account) => isDerivationJson(account))) {
          throw new Error("Account is not in the correct format.");
        }
        const firstPrefix = accounts[0].prefix;
        if (!accounts.every(({ prefix }) => prefix === firstPrefix)) {
          throw new Error("Accounts do not all have the same prefix");
        }
        const hdPaths = accounts.map(({ hdPath }) => stringToPath(hdPath));
        return DirectMldsa65HdWallet.fromMnemonic(mnemonic, {
          hdPaths: hdPaths,
          prefix: firstPrefix,
          hkdfSalt: typeof hkdfSalt === "string" ? hkdfSalt : mldsa65HkdfSalt,
        });
      }
      default:
        throw new Error("Unsupported serialization type");
    }
  }

  private static async deserializeTypeV1(
    serialization: string,
    password: string,
  ): Promise<DirectMldsa65HdWallet> {
    const root = JSON.parse(serialization);
    if (!isNonNullObject(root)) throw new Error("Root document is not an object.");
    const encryptionKey = await executeKdf(password, (root as any).kdf);
    return DirectMldsa65HdWallet.deserializeWithEncryptionKey(serialization, encryptionKey);
  }

  /** Base secret */
  private readonly secret: EnglishMnemonic;
  /** BIP39 seed */
  private readonly seed: Uint8Array;
  private readonly hdPaths: readonly HdPath[];
  private readonly prefix: string;
  private readonly hkdfSalt: string;

  private constructor(mnemonic: EnglishMnemonic, options: DirectMldsa65HdWalletConstructorOptions) {
    this.secret = mnemonic;
    this.seed = options.seed;
    this.hdPaths = options.hdPaths ?? defaultOptions.hdPaths;
    this.prefix = options.prefix ?? defaultOptions.prefix;
    this.hkdfSalt = options.hkdfSalt ?? defaultOptions.hkdfSalt;
  }

  public get mnemonic(): string {
    return this.secret.toString();
  }

  public async getAccounts(): Promise<readonly AccountData[]> {
    const accountsFromSigner = await this.getAccountsWithPrivkeys();
    return accountsFromSigner.map(({ algo, pubkey, address }) => ({ algo, pubkey, address }));
  }

  public async signDirect(signerAddress: string, signDoc: SignDoc): Promise<DirectSignResponse> {
    const accounts = await this.getAccountsWithPrivkeys();
    const account = accounts.find(({ address }) => address === signerAddress);
    if (account === undefined) {
      throw new Error(`Address ${signerAddress} not found in wallet`);
    }
    const { privkey, pubkey } = account;
    const signBytes = makeSignBytes(signDoc);
    // Like DirectMldsa65Wallet: no pre-hash; ML-DSA hashes the message internally.
    const signature = await Mldsa65.createSignature(signBytes, privkey);
    const stdSignature = encodeMldsa65Signature(pubkey, signature);
    return {
      signed: signDoc,
      signature: stdSignature,
    };
  }

  /**
   * Generates an encrypted serialization of this wallet (a password-protected keystore string).
   *
   * @param password The user provided password used to generate an encryption key via a KDF.
   */
  public async serialize(password: string): Promise<string> {
    const kdfConfiguration = basicPasswordHashingOptions;
    const encryptionKey = await executeKdf(password, kdfConfiguration);
    return this.serializeWithEncryptionKey(encryptionKey, kdfConfiguration);
  }

  /**
   * Generates an encrypted serialization of this wallet using a pre-computed encryption key.
   *
   * Lets you offload the KDF execution to a non-UI thread. The caller must ensure the key was
   * derived with the given KDF options, otherwise the wallet cannot be restored with the password.
   */
  public async serializeWithEncryptionKey(
    encryptionKey: Uint8Array,
    kdfConfiguration: KdfConfiguration,
  ): Promise<string> {
    const dataToEncrypt: DirectMldsa65HdWalletData = {
      mnemonic: this.mnemonic,
      hkdfSalt: this.hkdfSalt,
      accounts: this.hdPaths.map((hdPath) => ({
        hdPath: pathToString(hdPath),
        prefix: this.prefix,
      })),
    };
    const dataToEncryptRaw = toUtf8(JSON.stringify(dataToEncrypt));

    const encryptionConfiguration: EncryptionConfiguration = {
      algorithm: supportedAlgorithms.xchacha20poly1305Ietf,
    };
    const encryptedData = await encrypt(dataToEncryptRaw, encryptionKey, encryptionConfiguration);

    const out: DirectMldsa65HdWalletSerialization = {
      type: serializationTypeV1,
      kdf: kdfConfiguration,
      encryption: encryptionConfiguration,
      data: toBase64(encryptedData),
    };
    return JSON.stringify(out);
  }

  /** Derives the ML-DSA-65 seed for one HD path using the chain's HKDF convention. */
  private deriveMldsaSeed(hdPath: HdPath): Uint8Array {
    return deriveMldsa65Seed(this.seed, hdPath, this.hkdfSalt);
  }

  private async getKeyPair(hdPath: HdPath): Promise<Mldsa65Keypair> {
    const mldsaSeed = this.deriveMldsaSeed(hdPath);
    const keypair = await Mldsa65.makeKeypair(mldsaSeed);
    return { privkey: keypair.privkey, pubkey: keypair.pubkey };
  }

  private async getAccountsWithPrivkeys(): Promise<
    ReadonlyArray<AccountData & { readonly privkey: Uint8Array }>
  > {
    return Promise.all(
      this.hdPaths.map(async (hdPath) => {
        const { privkey, pubkey } = await this.getKeyPair(hdPath);
        const address = toBech32(this.prefix, rawMldsa65PubkeyToRawAddress(pubkey));
        return {
          algo: "mldsa65" as const,
          privkey: privkey,
          pubkey: pubkey,
          address: address,
        };
      }),
    );
  }
}
