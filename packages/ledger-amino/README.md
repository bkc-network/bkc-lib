# @bkc/ledger-amino

![typescript](https://img.shields.io/npm/types/@bkc/ledger-amino.svg)
[![npm version](https://img.shields.io/npm/v/@bkc/ledger-amino.svg)](https://www.npmjs.com/package/@bkc/ledger-amino)
[![license](https://img.shields.io/npm/l/@bkc/ledger-amino.svg)](https://github.com/bkc-network/bkc-lib/blob/main/LICENSE)
![minimum node version](https://img.shields.io/node/v/@bkc/ledger-amino.svg)
![minified size](https://img.shields.io/bundlephobia/min/@bkc/ledger-amino.svg)
![monthly downloads](https://img.shields.io/npm/dm/@bkc/ledger-amino.svg)

## Supported platforms

This library must be provided with a Ledger transport, and has been tested with
appropriate transports for Node.js as well as certain browsers. In our demo code
we use
[@ledgerhq/hw-transport-node-hid](https://github.com/LedgerHQ/ledgerjs/tree/master/packages/hw-transport-node-hid)
to connect to Ledger devices from Node.js. We use the
[@ledgerhq/hw-transport-webusb](https://github.com/LedgerHQ/ledgerjs/tree/master/packages/hw-transport-webusb)
library to connect to Ledger devices from the browser via USB. You can check the
support status of this library
[here](https://github.com/LedgerHQ/ledgerjs/tree/master/packages/hw-transport-webusb#support-status).

## Running the demo

### Node.js

Connect the Ledger device via USB, open the Cosmos app, then run the demo (this
will also build the package):

```sh
yarn demo-node
```

### Browser

Serve the project locally:

```sh
# Build and bundle the demo for web
yarn pack-demo-web

# Host the `ledger-amino` package directory, for example using Python 3
python3 -m http.server
```

Visit the demo page in a browser, for example if using the Python 3 option:
http://localhost:8000/demo.

Then follow the instructions on that page.

## Running tests

The tests in this package require a Ledger device
[initialized with the mnemonic](https://support.ledger.com/hc/en-us/articles/360005434914)
from
[scripts/wasmd/README.md#preset-accounts](https://github.com/cosmos/cosmjs/blob/main/scripts/wasmd/README.md#preset-accounts)
(see "Ledger: accounts for Ledger based demos and tests") with an installed
"Cosmos (ATOM)" app. The device must be connected via USB, unlocked and the
Cosmos app must be opened. The tests require the user to manually approve
transactions.

### Stargate tests

Start a local Stargate blockchain as described in
[scripts/simapp50/README.md](https://github.com/cosmos/cosmjs/blob/main/scripts/simapp50/README.md)
and execute:

```sh
export LEDGER_ENABLED=1
export SIMAPP50_ENABLED=1
yarn test
```

## License

This package is part of the cosmjs repository, licensed under the Apache License
2.0 (see [NOTICE](https://github.com/cosmos/cosmjs/blob/main/NOTICE) and
[LICENSE](https://github.com/cosmos/cosmjs/blob/main/LICENSE)).
