/** Official chaincfg/params.go, Pearl 99b95ac5. Independent of UI and transport. */
export const networks = {
  mainnet: {
    name: "mainnet",
    hrp: "prl",
    coinType: 808276,
    genesisHash:
      "a18d3093b7ff618f0cdd073fa3d10374e2e0105fe7ef53ff48b55f41c58dadd7",
    versions: { private: 0x04b2430c, public: 0x04b24746 },
  },
  testnet2: {
    name: "testnet2",
    hrp: "tprl",
    coinType: 1,
    genesisHash:
      "b0c86d0cd8825f4d72260d2de46f470429eece413811d5d82b5f2e2ea0336f96",
    versions: { private: 0x045f18bc, public: 0x045f1cf6 },
  },
} as const;

export type Network = keyof typeof networks;

export function networkParams(network: Network) {
  if (!Object.hasOwn(networks, network))
    throw new Error("Unsupported Pearl network");
  const params = networks[network];
  return params;
}
