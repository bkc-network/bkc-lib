import { makeSignDoc, serializeSignDoc } from "@bkc/amino";
import { keccak256, Mldsa65 } from "@bkc/crypto";
import { fromBase64, toBase64, toHex, toUtf8 } from "@bkc/encoding";
import { OfflineDirectSigner } from "@bkc/proto-signing";

/**
 * Signing a message with no transaction behind it - the "sign in with your wallet" flow.
 *
 * `signer.signMessage` in ethers produces a secp256k1 signature that a Solidity contract
 * recovers with `ecrecover`. Neither half of that exists here, so the same idea is built
 * on what the chain does have: ADR-36, the Cosmos convention for signing arbitrary data,
 * carried by an ML-DSA-65 signature.
 *
 * The result is verifiable in two places:
 *  - off chain, with {@link verifyMessage}
 *  - on chain, with {@link verifyMessageOnChain} - the chain exposes an ML-DSA verifier as
 *    a precompile, so a contract can check a signature that no ecrecover could
 */

/** The ML-DSA-65 verification precompile. */
export const mldsaVerifyPrecompile = "0x0000000000000000000000000000000000000900";

export interface SignedMessage {
  /** the message that was signed, as given */
  readonly message: string;
  /** bech32 address that signed it */
  readonly signer: string;
  /** ML-DSA-65 signature, base64 (3309 bytes) */
  readonly signature: string;
  /** the signer's public key, base64 (1952 bytes) */
  readonly pubkey: string;
}

/**
 * The exact bytes ADR-36 signs: a StdSignDoc with no chain, no fee and no account, whose
 * single message carries the payload. Every Cosmos wallet builds it the same way, which is
 * what makes a signature portable between them.
 */
export function makeAdr36SignBytes(message: string, signer: string): Uint8Array {
  // The Amino JSON rules - sorted keys, no whitespace, escaped `&<>` - are what make a
  // signature portable between wallets, and they belong to `@bkc/amino`. Building the
  // document by hand here would be a second implementation of them, free to drift from
  // the one the wallets actually sign with.
  return serializeSignDoc(
    makeSignDoc(
      [{ type: "sign/MsgSignData", value: { data: toBase64(toUtf8(message)), signer } }],
      { amount: [], gas: "0" },
      "",
      "",
      0,
      0,
    ),
  );
}

/** Signs a message off chain. Costs nothing and touches no node. */
export async function signMessage(wallet: OfflineDirectSigner, message: string): Promise<SignedMessage> {
  const [account] = await wallet.getAccounts();

  // OfflineDirectSigner hands out no private key, so the seed-backed wallets expose it
  const signable = wallet as OfflineDirectSigner & { readonly privkey?: Uint8Array };

  if (!signable.privkey) {
    throw new Error("This signer cannot sign arbitrary messages: it exposes no private key");
  }

  const signature = await Mldsa65.createSignature(
    makeAdr36SignBytes(message, account.address),
    signable.privkey,
  );

  return {
    message,
    signer: account.address,
    signature: toBase64(signature),
    pubkey: toBase64(account.pubkey),
  };
}

/** Checks a signature locally. */
export async function verifyMessage(signed: SignedMessage): Promise<boolean> {
  return Mldsa65.verifySignature(
    fromBase64(signed.signature),
    makeAdr36SignBytes(signed.message, signed.signer),
    fromBase64(signed.pubkey),
  );
}

const word = (value: number): Uint8Array => {
  const bytes = new Uint8Array(32);
  let rest = BigInt(value);

  for (let i = 31; i >= 0 && rest > BigInt(0); i -= 1) {
    // eslint-disable-next-line no-bitwise
    bytes[i] = Number(rest & BigInt(0xff));
    // eslint-disable-next-line no-bitwise
    rest >>= BigInt(8);
  }

  return bytes;
};

const padTo32 = (data: Uint8Array): Uint8Array => {
  const padded = new Uint8Array(Math.ceil(data.length / 32) * 32);
  padded.set(data);
  return padded;
};

const abiBytes = (data: Uint8Array): number[] => [...word(data.length), ...padTo32(data)];

/** Calldata for the chain's `mldsaVerify(bytes,bytes,bytes)` precompile. */
export function encodeVerifyCall(signed: SignedMessage): Uint8Array {
  const pubkey = fromBase64(signed.pubkey);
  const message = makeAdr36SignBytes(signed.message, signed.signer);
  const signature = fromBase64(signed.signature);

  // computed rather than pasted: a wrong selector reaches the chain as "invalid calldata",
  // which says nothing about which of the four bytes is off
  const selector = keccak256(toUtf8("mldsaVerify(bytes,bytes,bytes)")).slice(0, 4);

  const headSize = 96;
  const offsets = [
    headSize,
    headSize + 32 + padTo32(pubkey).length,
    headSize + 64 + padTo32(pubkey).length + padTo32(message).length,
  ];

  return new Uint8Array([
    ...selector,
    ...offsets.flatMap((offset) => [...word(offset)]),
    ...abiBytes(pubkey),
    ...abiBytes(message),
    ...abiBytes(signature),
  ]);
}

/**
 * Asks the chain to verify the signature, through the same precompile a Solidity contract
 * would call. Proves a message signed off chain is checkable on chain.
 */
export async function verifyMessageOnChain(signed: SignedMessage, evmRpcUrl: string): Promise<boolean> {
  const response = await fetch(evmRpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ to: mldsaVerifyPrecompile, data: `0x${toHex(encodeVerifyCall(signed))}` }, "latest"],
    }),
  });

  const body = (await response.json()) as { result?: string; error?: { message: string } };

  if (body.error) throw new Error(`mldsaVerify: ${body.error.message}`);

  return BigInt(body.result ?? "0x0") === BigInt(1);
}
