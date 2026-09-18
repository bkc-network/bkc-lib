# @bkc-network-lib/sdk

Everything that is specific to the **BKC** chain and was, until now, rewritten
in every project that talks to it: the wallet extension, the demo dApp, and the
verification scripts each carried their own copy.

BKC runs a Cosmos stack and an EVM over **one** ML-DSA-65 account. That means
two things no ordinary Cosmos or EVM library expects:

- an account has two address spellings, `bkc1…` and `0x…`, of the same 20 bytes
- the EVM cannot be written to with an Ethereum transaction — there is no ECDSA
  key, and `eth_sendRawTransaction` is disabled. Every state change is a Cosmos
  message, `/bkc.bkc.v1.MsgExecuteEvmCall`, signed with ML-DSA-65

## Installing

```sh
npm i @bkc-network-lib/sdk
```

It pulls in the forked packages under `@bkc-network-lib/*` - `@bkc-network-lib/crypto`, `@bkc-network-lib/amino`,
`@bkc-network-lib/proto-signing`, `@bkc-network-lib/stargate`, `@bkc-network-lib/tendermint-rpc`, `@bkc-network-lib/encoding`.

**The scope is not cosmetic.** Upstream publishes `@cosmjs/crypto@0.39.0` too,
so a package that asks for `"@cosmjs/crypto": "^0.39.0"` gets the upstream one -
which has no ML-DSA-65. npm installs it without complaint, every import
resolves, and every custom symbol is `undefined` at runtime. Renaming the forked
packages is what makes the install unambiguous.

`yarn consumer-check` packs everything, installs it into a throwaway project
with plain npm, and runs a real flow against it - the only way to catch that
class of problem, since inside the workspace the forked code always wins.

### Trying a change before it is released

To run an application against a build that is not on npm, pack the workspace
into the consumer's own repository:

```sh
# from this monorepo, once per consumer, all from the same build
./packages/sdk/scripts/pack-to.sh ../bkc-wallet/vendor
./packages/sdk/scripts/pack-to.sh ../bkc-dapp-demo/vendor
```

and point that consumer's `package.json` at `file:./vendor/<name>.tgz`.
Relative, inside the repo, so `npm install` still works on a fresh clone.

Two things go wrong if you skip the script and pack by hand:

- **A path outside the consumer's repo.** `/tmp` is wiped on reboot and means
  nothing on anyone else's machine, so the repo installs only where it was
  packed.
- **Packing consumers at different times.** They end up on different versions of
  the SDK, which is exactly the drift this package exists to prevent.
  `sha256sum` the vendored tarballs to check they match.

npm caches a `file:` tarball by path, so `rm -rf node_modules/@bkc-network-lib` before
reinstalling - otherwise a freshly packed tarball is ignored in favour of the
cached one.

## Using it

You write ethers. That is the whole idea.

```ts
import { Contract, ContractFactory, BkcSigner } from "@bkc-network-lib/sdk";

const signer = await BkcSigner.fromMnemonic(mnemonic, {
  evmRpcUrl: "http://…:18545",
  cosmosRpcUrl: "http://…:36657",
});

const contract = await new ContractFactory(abi, bytecode, signer).deploy();
await contract.waitForDeployment();

await (await contract.set(42)).wait();
await contract.get(); // 42n
```

`BkcSigner.fromSeed`, `.fromMnemonic` and `.fromWallet` all return an ordinary
ethers `Signer`, so `Contract`, `ContractFactory`, `tx.wait()`, `queryFilter`
and everything else behave exactly as they do on any EVM chain. The snippet
above is the whole flow - deploy, write, read - and it is the same code you
would write against Ethereum.

### How much of ethers actually works

Measured against the live chain, not assumed:

| Works unchanged                                             | Cannot work, and says why                                                      |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `getNetwork`, `getBlockNumber`, `getBalance`, `getBlock`    | `signer.signMessage` / `signTypedData` - secp256k1 only                        |
| `ContractFactory.deploy()`, `contract.get()`, `estimateGas` | `eth_sendRawTransaction` - a signed Ethereum transaction cannot exist here     |
| `tx.wait()`, `getTransaction`, receipt log decoding         | `queryFilter` with no block range - the node caps a log query at 10,000 blocks |
| `queryFilter(filter, fromBlock, toBlock)`                   |                                                                                |
| `signer.sendTransaction({ to, value })`                     |                                                                                |

Each unsupported call throws with an explanation. ethers nests it one level
down, at `error.error.message` - `error.shortMessage` only ever says "could not
coalesce error".

### And what replaces them

None of the three is left as a dead end: each has a replacement built on the
Cosmos side.

| Instead of                  | Use                                              | What you get                                                        |
| --------------------------- | ------------------------------------------------ | ------------------------------------------------------------------- |
| `receipt.fee`, always 0     | `getEvmTransactionCost(hash, lcdUrl)`            | the fee actually charged, plus the Cosmos hash and gas              |
| `queryFilter` with no range | `getLogsPaged(provider, filter, { maxWindows })` | logs walked backwards a window at a time, with the block it reached |
| `signer.signMessage`        | `signMessage(wallet, text)`                      | an ADR-36 document signed with ML-DSA-65                            |

The signature is checkable in both worlds: `verifyMessage()` off chain, and
`verifyMessageOnChain()` through the chain's ML-DSA verifier precompile - so a
Solidity contract can validate a signature that no `ecrecover` could.

### What the signer is hiding

Only one JSON-RPC method cannot be served the usual way. `eth_sendTransaction`
has no Ethereum transaction to sign - the chain has no ECDSA keys, and the node
refuses `eth_sendRawTransaction` - so the call is wrapped in
`/bkc.bkc.v1.MsgExecuteEvmCall`, signed with ML-DSA-65 and broadcast through the
Cosmos side. The chain executes it in the EVM and emits an ordinary Ethereum
hash, receipt and logs, which is why `tx.wait()` and event filters keep working.
Everything else is forwarded to the node untouched.

Tooling that wires its own stack - a Hardhat plugin, viem, a wallet - can take
the raw EIP-1193 provider instead with `createBkcEip1193Provider()`. A builder
never needs it.

## Below the ethers layer

Native transfers, staking, governance - anything that is a Cosmos message rather
than an EVM call - go through the Cosmos side, which is also here:

```ts
import {
  DirectMldsa65HdWallet,
  SigningStargateClient,
  makeBkcRegistry,
  bkcChain,
} from "@bkc-network-lib/sdk";
```

And the pieces the ethers layer is built from, should you want them directly:
`makeEvmCallMessage`, `withGasHeadroom`, `cosmosGasForEvmCall`,
`findEthereumTxHash`, `toEvmAddress`, `tryToEvmAddress`, and `calculateFee` from
`@bkc-network-lib/stargate` for turning a gas budget into a fee.

## In a browser, with a wallet extension

A dapp holds no key - the user's wallet does. One call turns the injected
provider into the same ethers `Signer` everything above takes:

```ts
import { connectBkcWallet, Contract, ContractFactory } from "@bkc-network-lib/sdk";

const { account, signer, provider, cosmosSigner, wallet } =
  await connectBkcWallet(endpoints);
```

`signer` goes straight into `Contract` and `ContractFactory`. `cosmosSigner` is
the same account as an `OfflineDirectSigner`, for `SigningStargateClient`.
`wallet` is the raw injected provider, for the few things only a wallet can do
(`signArbitrary`).

A whole dapp interaction, start to finish:

```ts
import { connectBkcWallet, Contract, bkcChain } from "@bkc-network-lib/sdk";

const endpoints = {
  evmRpcUrl: "https://<host>:18545", // EVM JSON-RPC, for reads
  cosmosRpcUrl: "https://<host>:36657", // Tendermint RPC, where writes are broadcast
};

const { account, signer } = await connectBkcWallet(endpoints);
// account.address    bkc1...      the Cosmos address
// account.evmAddress 0x...        the same account, as the EVM sees it

const counter = new Contract(address, abi, signer);

console.log(await counter.get()); // a read: served by the EVM RPC, no signing

const tx = await counter.set(42); // a write: wrapped in MsgExecuteEvmCall,
const receipt = await tx.wait(); //   signed with ML-DSA-65 by the wallet
console.log(receipt.hash, receipt.logs);
```

Two chain facts worth designing around, both exported on `bkcChain`:

- **Gas is much higher than an EVM chain.** An ML-DSA-65 signature is ~3.3 KB
  and gas is charged per byte, so budget from `bkcChain.baseGasLimit` rather
  than from Ethereum intuition.
- **Gas cannot be simulated.** `bkcChain.isSimulable` is `false`; the chain
  rejects `SIGN_MODE_UNSPECIFIED`, so the estimate comes from the budget, not
  from the node.

`receipt.fee` is always 0 here, because the fee was paid on the Cosmos side. Use
`getEvmTransactionCost(hash, lcdUrl)` for what was actually charged.

## `@bkc-network-lib/sdk/core` - the chain without a transport

A wallet is the other case: it already has a keyring, an RPC layer with failover
and an approval flow, and it cannot afford to bundle ethers a second time. What
it needs is only the part it must not get wrong.

```ts
import {
  MsgExecuteEvmCall,
  makeEvmCallMessage,
  bkcChain,
  mldsa65Sizes,
} from "@bkc-network-lib/sdk/core";
```

This entry point pulls in **no ethers, no `@bkc-network-lib/stargate`, no
`@bkc-network-lib/tendermint-rpc`** - only `@bkc-network-lib/crypto`, `@bkc-network-lib/encoding` and
`@bufbuild/protobuf`. It carries the chain constants, the address conversions
(including EIP-55 checksumming), the `MsgExecuteEvmCall` codec, the gas rules,
the ML-DSA-65 sizes and HKDF salt, and ADR-36 message signing.

## The two rules this package exists to enforce

- **`callNonce` is the Cosmos account sequence** the transaction is signed with,
  not the EVM nonce. The chain's handler checks
  `account.Sequence == call_nonce + 1`.
- **Cosmos gas must cover the EVM budget.** `cosmosGasForEvmCall()` adds the EVM
  limit on top of a base that already accounts for the ~3.3 KB signature.

## Regenerating the codec

`src/codec` is generated from `proto/`, a trimmed copy of the chain's
`proto/qrt/qrt/v1/tx.proto`. Two deliberate differences, neither of which
changes the wire format: the package is renamed to `bkc.bkc.v1` (what the
deployed chain registers, after the rebrand), and the
gogoproto/cosmos_proto/amino annotations are dropped so it generates offline.

```sh
npm i -g ts-proto   # provides protoc-gen-ts_proto
yarn proto-gen
```

`src/codec.spec.ts` decodes a real 5.5 KB transaction taken from the node, so
the codec is pinned against bytes the chain accepted — not merely against
itself.
