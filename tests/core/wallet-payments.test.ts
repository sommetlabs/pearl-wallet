import { describe, expect, it } from "vitest";
import { hexToBytes } from "@noble/hashes/utils";
import { HDKey } from "@scure/bip32";
import { deriveAddress } from "../../src/core/accounts";
import { pearlAddressFromCompressedPubkey } from "../../src/chains/pearl/address";
import { pearlParams } from "../../src/chains/pearl/network";
import { endpoint, prepare, summarize } from "../../src/extension/network";
import {
  format,
  grains,
  type Account,
  type Balance,
  type Operation,
} from "../../src/extension/model";

const seed = hexToBytes("11".repeat(64));
const descriptor = {
  network: "testnet2",
  accountIndex: 0,
  derivation: "oyster",
  scheme: "plain",
} as const;
const account: Account = {
  ...descriptor,
  id: "test-account",
  label: "Test",
  xpub: "",
  addresses: [
    { ...(await deriveAddress(seed, descriptor, 0, 0)), branch: 0, index: 0 },
    { ...(await deriveAddress(seed, descriptor, 1, 0)), branch: 1, index: 0 },
  ],
};
const balance = (): Balance => ({
  confirmed: "100000000",
  pending: "0",
  reserved: "0",
  immature: "0",
  spendable: "100000000",
  complete: true,
  height: 200,
  hash: "aa".repeat(32),
  updatedAt: Date.now(),
  used: [],
  coins: [
    {
      txid: "22".repeat(32),
      vout: 0,
      amountGrains: "100000000",
      scriptHex: account.addresses[0].scriptHex,
      branch: 0,
      index: 0,
      confirmations: 10,
      coinbase: false,
    },
  ],
});
const operation = (status: Operation["status"]): Operation => ({
  id: "test-operation",
  accountId: account.id,
  origin: "https://example.com",
  createdAt: Date.now(),
  status,
  plan: prepare(
    account,
    balance(),
    [],
    account.addresses[0].address,
    "50000000",
    2,
  ),
  to: account.addresses[0].address,
  amountGrains: "50000000",
  feeRate: 2,
  signOnly: false,
});

describe("wallet payment ownership", () => {
  it("reserves every reviewed input and prevents two requests spending it", () => {
    const op = operation("review"),
      b = balance();
    expect(summarize(account, b.coins, [op]).reserved).toBe("100000000");
    expect(summarize(account, b.coins, [op]).spendable).toBe("0");
    expect(() =>
      prepare(account, b, [op], account.addresses[0].address, "1", 2),
    ).toThrow("at least");
    expect(() =>
      prepare(account, b, [op], account.addresses[0].address, "50000000", 2),
    ).toThrow("Insufficient");
  });
  it("keeps signed and uncertain inputs reserved across all spend attempts", () => {
    for (const status of ["signed", "broadcast", "unknown"] as const)
      expect(
        summarize(account, balance().coins, [operation(status)]).spendable,
      ).toBe("0");
    expect(
      summarize(account, balance().coins, [operation("cancelled")]).spendable,
    ).toBe("100000000");
  });
  it("does not resurrect settled inputs from an older cached balance", () => {
    expect(
      summarize(account, balance().coins, [operation("confirmed")]).spendable,
    ).toBe("0");
    expect(() =>
      prepare(
        account,
        balance(),
        [operation("confirmed")],
        account.addresses[0].address,
        "50000000",
        2,
      ),
    ).toThrow("Insufficient");
  });
  it("requires complete fresh discovery, a valid fee and confirmed mature coins", () => {
    const to = account.addresses[0].address;
    expect(() =>
      prepare(
        account,
        { ...balance(), complete: false },
        [],
        to,
        "50000000",
        2,
      ),
    ).toThrow("complete");
    expect(() =>
      prepare(account, { ...balance(), updatedAt: 0 }, [], to, "50000000", 2),
    ).toThrow("Refresh");
    expect(() => prepare(account, balance(), [], to, "50000000", 1.5)).toThrow(
      "Fee rate",
    );
    const b = balance();
    b.coins[0].confirmations = 1;
    expect(() => prepare(account, b, [], to, "50000000", 2)).toThrow(
      "Insufficient",
    );
    b.coins[0].coinbase = true;
    b.coins[0].confirmations = 99;
    expect(summarize(account, b.coins, []).immature).toBe("100000000");
    expect(() => prepare(account, b, [], to, "50000000", 2)).toThrow(
      "Insufficient",
    );
  });
  it("shows dust remainder as the approved fee and uses a distinct change branch", () => {
    const plan = prepare(
      account,
      balance(),
      [],
      account.addresses[0].address,
      "99999680",
      2,
    );
    expect(plan.outputs).toHaveLength(1);
    expect(plan.approvedFeeGrains).toBe("320");
    const normal = operation("review").plan;
    expect(normal.outputs[1].address).toBe(account.addresses[1].address);
    expect(
      BigInt(normal.outputs[0].amountGrains) +
        BigInt(normal.outputs[1].amountGrains) +
        BigInt(normal.approvedFeeGrains),
    ).toBe(100000000n);
  });
});
describe("wallet imports and precision", () => {
  it("restores existing web-wallet receive and change addresses exactly", async () => {
    const master = HDKey.fromMasterSeed(seed);
    for (const branch of [0, 1] as const) {
      const key = master.derive(`m/86'/808276'/0'/${branch}/0`);
      const imported = await deriveAddress(
        seed,
        { ...descriptor, derivation: "bip32", coinType: 808276 },
        branch,
        0,
      );
      expect(imported.address).toBe(
        pearlAddressFromCompressedPubkey(
          key.publicKey!,
          pearlParams("testnet2"),
        ),
      );
      key.wipePrivateData();
    }
    master.wipePrivateData();
  });
  it("uses integer grains without floating point rounding", () => {
    expect(grains("0.00000001")).toBe("1");
    expect(format("123456789")).toBe("1.23456789");
    for (const value of ["1e-8", "-1", "0.000000001", "NaN"])
      expect(() => grains(value)).toThrow();
  });
  it("rejects credentials, query parameters and insecure remote services", () => {
    for (const url of [
      "http://example.com/api",
      "https://user:password@example.com",
      "https://example.com?key=abc",
    ])
      expect(() => endpoint(url)).toThrow();
    expect(endpoint("https://example.com/api/v2/")).toBe(
      "https://example.com/api/v2",
    );
    expect(endpoint("http://localhost:9999/api/v2")).toBe(
      "http://localhost:9999/api/v2",
    );
  });
});
