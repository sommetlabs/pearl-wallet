import { publicAccount, type AccountDescriptor } from "./accounts";
import { networkParams, type Network } from "./networks";

export type AccountFormat = "official" | "web";
export function describeAccount(
  format: AccountFormat,
  network: Network,
  accountIndex = 0,
): AccountDescriptor {
  return format === "official"
    ? { network, accountIndex, derivation: "oyster", scheme: "xmss" }
    : {
        network,
        accountIndex,
        derivation: "bip32",
        scheme: "plain",
        coinType: 808276,
      };
}
export function nextAccount(
  accounts: AccountDescriptor[],
  format: AccountFormat,
  network: Network,
): AccountDescriptor {
  const kind = describeAccount(format, network);
  const matches = accounts.filter(
    (account) =>
      account.network === network &&
      account.derivation === kind.derivation &&
      account.scheme === kind.scheme &&
      (account.coinType ?? networkParams(network).coinType) ===
        (kind.coinType ?? networkParams(network).coinType),
  );
  return {
    ...kind,
    accountIndex: matches.reduce(
      (index, account) => Math.max(index, account.accountIndex + 1),
      0,
    ),
  };
}
export function recoveredDescriptors(
  seed: Uint8Array,
  accounts: (AccountDescriptor & { xpub: string })[],
): AccountDescriptor[] {
  if (!accounts.length || accounts.length > 64)
    throw new Error("Unsupported wallet account count");
  return accounts.map((account) => {
    const descriptor: AccountDescriptor = {
      network: account.network,
      accountIndex: account.accountIndex,
      scheme: account.scheme,
      derivation: account.derivation,
      ...(account.coinType !== undefined && { coinType: account.coinType }),
    };
    if (publicAccount(seed, descriptor) !== account.xpub)
      throw new Error(
        "This recovery phrase does not match the accounts in this wallet",
      );
    return descriptor;
  });
}
