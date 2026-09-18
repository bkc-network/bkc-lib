// Runs as a builder would: importing only from @bkc-network-lib/sdk, touching nothing in the monorepo.
import {
  bkcChain,
  calculateFee,
  cosmosGasForEvmCall,
  DirectMldsa65Wallet,
  fromHex,
  GasPrice,
  makeBkcRegistry,
  makeEvmCallMessage,
  Mldsa65,
  toEvmAddress,
  tryToEvmAddress,
  withGasHeadroom,
} from "@bkc-network-lib/sdk";

const SEED = "157e43cecea4bc60fd31d629b61e3e9fdabf89e9d6e61980f2213b62aaa42bd4";
const ok = (c, m) => console.info(`${c ? "PASS ✅" : "FAIL ❌"}  ${m}`);

const wallet = await DirectMldsa65Wallet.fromSeed(fromHex(SEED), bkcChain.bech32Prefix);
const [account] = await wallet.getAccounts();

ok(account.address === "bkc1trl04f7n42ana3vkxeuk79pvmvxe4js2s5pw9s", `address: ${account.address}`);
ok(account.algo === "mldsa65", `algorithm: ${account.algo}`);
ok(account.pubkey.length === 1952, `public key: ${account.pubkey.length} bytes`);

ok(
  toEvmAddress(account.address) === "0x58fefaa7d3aabb3ec59636796f142cdb0d9aca0a",
  `EVM address: ${toEvmAddress(account.address)}`,
);
ok(
  tryToEvmAddress("cosmos1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5lzv7xu") === null,
  "a bech32 address from another chain is refused",
);

const keypair = await Mldsa65.makeKeypair(fromHex(SEED));
const signature = await Mldsa65.createSignature(new TextEncoder().encode("hello"), keypair.privkey);
const verified = await Mldsa65.verifySignature(signature, new TextEncoder().encode("hello"), keypair.pubkey);
ok(verified && signature.length === 3309, `sign and verify: ${signature.length} byte signature`);

const registry = makeBkcRegistry();
const message = makeEvmCallMessage({
  sender: account.address,
  to: "0x6ea8810a67b7349061b41f98fe13c46d4ce6fd92",
  data: fromHex("a9059cbb"),
  gasLimit: withGasHeadroom(44846n),
  sequence: 91n,
});
const decoded = registry.decode(registry.encodeAsAny(message));
ok(
  decoded.sender === account.address && decoded.callNonce === 91n,
  `the EVM message re-encodes and reads back, call_nonce=${decoded.callNonce}`,
);

const gas = cosmosGasForEvmCall(withGasHeadroom(44846n));
const fee = calculateFee(Number(gas), GasPrice.fromString(`${bkcChain.gasPrice}${bkcChain.denom}`));
ok(
  gas === bkcChain.baseGasLimit + 58299n,
  `cosmos gas = ${gas} (fee ${fee.amount[0].amount}${fee.amount[0].denom})`,
);
