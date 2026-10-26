/** Pearl network parameters (pearld v1.5.1, commit 6f996e3): the parameter table
 * of packages/pearl-htlc/src/network.ts, copied without its node-only RPC
 * configuration. tests/unit/pearl-parity.test.ts checks it equals the package's. */
export const PEARL_NETWORKS = ['simnet', 'testnet2', 'mainnet'] as const;
export type PearlNetwork = (typeof PEARL_NETWORKS)[number];

/** 1 PRL = 10^8 grains. */
export const GRAINS_PER_PRL = 100_000_000n;

export interface PearlFeePolicy {
  /** Node policy floor (`DefaultMinRelayTxFee` 1000 grains/kvB) and BIP125 increment. */
  readonly minRelayGrainsPerVb: number;
  readonly defaultGrainsPerVb: number;
  /** Sanity cap: a fee rate above it is a configuration error, not a market price. */
  readonly maxGrainsPerVb: number;
}

export interface PearlNetworkParams {
  readonly network: PearlNetwork;
  /** `getblockchaininfo.chain`. */
  readonly chainName: string;
  /** Off-chain leg label (`PearlLegTermsV1.chain`). */
  readonly chainLabel: `pearl-${PearlNetwork}`;
  readonly magic: string;
  readonly hrp: string;
  readonly wif: number;
  readonly p2pPort: number;
  readonly rpcPort: number;
  /** Display (RPC) byte order. */
  readonly genesisHash: string;
  readonly coinbaseMaturity: number;
  readonly targetBlockSeconds: number;
  readonly fastBlockSeconds: number;
  readonly slowBlockSeconds: number;
  readonly minConfirmations: number;
  /** P2TR outputs below this many grains are non-standard. */
  readonly dustGrains: bigint;
  readonly fee: PearlFeePolicy;
  readonly generateSupported: boolean;
}

const fee = (defaultGrainsPerVb: number): PearlFeePolicy => ({ minRelayGrainsPerVb: 1, defaultGrainsPerVb, maxGrainsPerVb: 1_000 });
const common = { coinbaseMaturity: 100, targetBlockSeconds: 194, fastBlockSeconds: 60, slowBlockSeconds: 600, dustGrains: 333n } as const;

export const PEARL_NETWORK_PARAMS: Readonly<Record<PearlNetwork, PearlNetworkParams>> = Object.freeze({
  simnet: Object.freeze({ ...common, network: 'simnet', chainName: 'simnet', chainLabel: 'pearl-simnet',
    magic: 'PRLS', hrp: 'rprl', wif: 0x64, p2pPort: 18555, rpcPort: 18556,
    genesisHash: '78d0ab27df6a51a8e9dbbdefffca1ebbbeb3818cb083ce2c2f43b047247e5832',
    minConfirmations: 1, fee: fee(2), generateSupported: true }),
  testnet2: Object.freeze({ ...common, network: 'testnet2', chainName: 'testnet2', chainLabel: 'pearl-testnet2',
    magic: 'PRL2', hrp: 'tprl', wif: 0xef, p2pPort: 44112, rpcPort: 44111,
    genesisHash: 'b0c86d0cd8825f4d72260d2de46f470429eece413811d5d82b5f2e2ea0336f96',
    minConfirmations: 2, fee: fee(2), generateSupported: false }),
  mainnet: Object.freeze({ ...common, network: 'mainnet', chainName: 'mainnet', chainLabel: 'pearl-mainnet',
    magic: 'PRLM', hrp: 'prl', wif: 0x80, p2pPort: 44108, rpcPort: 44107,
    genesisHash: 'a18d3093b7ff618f0cdd073fa3d10374e2e0105fe7ef53ff48b55f41c58dadd7',
    minConfirmations: 6, fee: fee(5), generateSupported: false }),
});

export const pearlNetworkParams = (network: PearlNetwork): PearlNetworkParams => {
  const params = PEARL_NETWORK_PARAMS[network];
  if (params === undefined) throw new Error(`Unsupported Pearl network ${String(network)}`);
  return params;
};

/** Release 1 never acts on a Pearl funding with fewer than 2 confirmations (the solver's default
 * `SOLVER_PEARL_MIN_CONFIRMATIONS`), even where the network's own minimum is lower (simnet: 1). */
export const SWAP_MIN_CONFIRMATIONS = 2;

export const isPearlNetwork = (value: unknown): value is PearlNetwork => PEARL_NETWORKS.some((network) => network === value);

/** Reject fee rates outside the network policy before building a spend. */
export const checkedFeeRate = (params: PearlNetworkParams, grainsPerVb: number): number => {
  if (!Number.isSafeInteger(grainsPerVb) || grainsPerVb < params.fee.minRelayGrainsPerVb || grainsPerVb > params.fee.maxGrainsPerVb) {
    throw new Error(`Pearl fee rate must be an integer in [${params.fee.minRelayGrainsPerVb}, ${params.fee.maxGrainsPerVb}] grains/vB`);
  }
  return grainsPerVb;
};

export function pearlNetworkForChain(chain: string): PearlNetwork {
  const network = PEARL_NETWORKS.find((value) => PEARL_NETWORK_PARAMS[value].chainLabel === chain);
  if (!network) throw new Error(`Unsupported Pearl chain ${chain}`);
  return network;
}
