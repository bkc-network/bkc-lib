// See https://github.com/tendermint/tendermint/blob/f2ada0a604b4c0763bda2f64fac53d506d3beca7/docs/spec/blockchain/encoding.md#public-key-cryptography

import { keccak256, mldsa65, ripemd160, Secp256k1, sha256 } from "@bkc/crypto";
import { fromBase64, toBech32 } from "@bkc/encoding";

import { encodeAminoPubkey } from "./encoding";
import {
  isEd25519Pubkey,
  isEthSecp256k1Pubkey,
  isMldsa65Pubkey,
  isMultisigThresholdPubkey,
  isSecp256k1Pubkey,
  Pubkey,
} from "./pubkeys";

export function rawEd25519PubkeyToRawAddress(pubkeyData: Uint8Array): Uint8Array<ArrayBuffer> {
  if (pubkeyData.length !== 32) {
    throw new Error(`Invalid Ed25519 pubkey length: ${pubkeyData.length}`);
  }
  return sha256(pubkeyData).slice(0, 20);
}

export function rawSecp256k1PubkeyToRawAddress(pubkeyData: Uint8Array): Uint8Array<ArrayBuffer> {
  if (pubkeyData.length !== 33) {
    throw new Error(`Invalid Secp256k1 pubkey length (compressed): ${pubkeyData.length}`);
  }
  return ripemd160(sha256(pubkeyData));
}

export function rawEthSecp256k1PubkeyToRawAddress(pubkeyData: Uint8Array): Uint8Array<ArrayBuffer> {
  if (pubkeyData.length !== 33) {
    throw new Error(`Invalid Secp256k1 pubkey length (compressed): ${pubkeyData.length}`);
  }
  const uncompressed = Secp256k1.uncompressPubkey(pubkeyData);
  const pubkeyWithoutPrefix = uncompressed.slice(1);
  const hash = keccak256(pubkeyWithoutPrefix);
  return hash.slice(-20);
}

/**
 * Derives the raw (20 byte) account address from an ML-DSA-65 public key.
 *
 * CHAIN-DEPENDENT: this must match the `Address()` implementation of the chain's
 * Go ML-DSA-65 key type. We default to `sha256(pubkey)[:20]`, which is the
 * convention the Cosmos SDK uses for non-secp256k1 keys (e.g. ed25519). If the
 * chain hashes differently (e.g. a different digest or truncation), change the
 * body here to match — everything downstream (bech32 address, signer lookup)
 * derives from this function.
 */
export function rawMldsa65PubkeyToRawAddress(pubkeyData: Uint8Array): Uint8Array<ArrayBuffer> {
  if (pubkeyData.length !== mldsa65.pubkeyLength) {
    throw new Error(`Invalid ML-DSA-65 pubkey length: ${pubkeyData.length}`);
  }
  return sha256(pubkeyData).slice(0, 20);
}

// For secp256k1 this assumes we already have a compressed pubkey.
export function pubkeyToRawAddress(pubkey: Pubkey): Uint8Array<ArrayBuffer> {
  if (isSecp256k1Pubkey(pubkey)) {
    const pubkeyData = fromBase64(pubkey.value);
    return rawSecp256k1PubkeyToRawAddress(pubkeyData);
  } else if (isEthSecp256k1Pubkey(pubkey)) {
    const pubkeyData = fromBase64(pubkey.value);
    return rawEthSecp256k1PubkeyToRawAddress(pubkeyData);
  } else if (isEd25519Pubkey(pubkey)) {
    const pubkeyData = fromBase64(pubkey.value);
    return rawEd25519PubkeyToRawAddress(pubkeyData);
  } else if (isMldsa65Pubkey(pubkey)) {
    const pubkeyData = fromBase64(pubkey.value);
    return rawMldsa65PubkeyToRawAddress(pubkeyData);
  } else if (isMultisigThresholdPubkey(pubkey)) {
    // https://github.com/tendermint/tendermint/blob/38b401657e4ad7a7eeb3c30a3cbf512037df3740/crypto/multisig/threshold_pubkey.go#L71-L74
    const pubkeyData = encodeAminoPubkey(pubkey);
    return sha256(pubkeyData).slice(0, 20);
  } else {
    throw new Error("Unsupported public key type");
  }
}

export function pubkeyToAddress(pubkey: Pubkey, prefix: string): string {
  return toBech32(prefix, pubkeyToRawAddress(pubkey));
}
