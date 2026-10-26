# Extension usage

Build with `npm ci` and `npm run build`, then load `dist-extension` as an
unpacked extension in Chrome or Brave. No web deployment or companion signer is
required.

## Accounts and recovery

New accounts use Pearl's Oyster derivation. Restoring a phrase also supports the
previous web wallet's BIP-32 addresses. Confirm the account format and receive
address against the original wallet before sending funds.

The extension stores an encrypted vault in the browser profile. Keep an
independent recovery phrase backup; removing the extension or profile removes
its local vault and transaction history.

## dApp connection

```ts
import { getAbyssWallet } from "@sommetlabs/pearl-wallet-connect/extension";

const wallet = getAbyssWallet();
if (!wallet) throw new Error("Install Abyss Wallet and reload this page");
const { account } = await wallet.connect({ network: "testnet2" });
const balance = await wallet.getBalance();
```

The provider is `window.abyssWallet`. Account access requires site approval.
`abyss-wallet-ready` signals discovery; `abyss-wallet-changed` tells approved
sites to reread account and balance state.

`signTransaction` and `signPsbt` request separate transaction approval and return
saved signatures without broadcasting. `sendTransaction` also broadcasts the
approved payment. Amounts use decimal strings in grains: 100,000,000 grains is
1 PRL. Use the connector's [signing adapters](../packages/connector/README.md) for
PRL/WPRL wrapping.

Testnet2 is the initial supported network. Mainnet payments have not been
validated for this release.
