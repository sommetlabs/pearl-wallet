import { hexToBytes } from "@noble/hashes/utils";
import reference from "../../tests/fixtures/official-pearl.json";
import {
  deriveAddress,
  publicAccount,
  type AccountDescriptor,
} from "../../src/core/accounts";
import { loadXmss } from "../../src/core/xmss";
import { paymentScript, signTransfer } from "../../src/core/transactions";
import type { Network } from "../../src/core/networks";
import wasmUrl from "../../src/core/wasm/xmss.wasm?url";

const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
const check = (ok: boolean, label: string) => {
  if (!ok) throw new Error(`Reference mismatch: ${label}`);
};

async function run() {
  const started = performance.now();
  const response = await fetch(wasmUrl);
  if (!response.ok) throw new Error("Could not load bundled official XMSS");
  const xmss = await loadXmss(new Uint8Array(await response.arrayBuffer()));
  let commitments = 0;
  for (const v of reference.vectors) {
    const account: AccountDescriptor = {
      network: v.network as Network,
      accountIndex: v.account,
      derivation: "oyster",
      scheme: "plain",
    };
    const seed = hexToBytes(v.seedHex);
    try {
      check(publicAccount(seed, account) === v.accountXpub, "account xpub");
      check(
        (await deriveAddress(seed, account, v.branch as 0 | 1, v.index))
          .address === v.plainAddress,
        "plain address",
      );
      if (v.pqAddress) {
        const pq = await deriveAddress(
          seed,
          { ...account, scheme: "xmss" },
          v.branch as 0 | 1,
          v.index,
          xmss,
        );
        check(
          pq.address === v.pqAddress &&
            pq.merkleRootHex === v.pqRootHex &&
            pq.xmssPublicKeyHex === v.pqPublicKeyHex,
          "XMSS commitment",
        );
        commitments++;
      }
    } finally {
      seed.fill(0);
    }
  }
  const v = reference.vectors.find(
    (v) => v.network === "testnet2" && v.pqAddress,
  )!;
  const transfers = [];
  for (const scheme of ["plain", "xmss"] as const) {
    const account: AccountDescriptor = {
      network: "testnet2",
      accountIndex: 0,
      derivation: "oyster",
      scheme,
    };
    const input = {
      txid: (scheme === "plain" ? "11" : "22").repeat(32),
      vout: 0,
      amountGrains: "50000000",
      scriptHex: hex(
        paymentScript(
          scheme === "plain" ? v.plainAddress : v.pqAddress!,
          account,
        ),
      ),
      branch: 0 as const,
      index: 0,
    };
    const seed = hexToBytes(v.seedHex);
    try {
      const result = await signTransfer(
        seed,
        account,
        {
          inputs: [input],
          outputs: [{ address: v.plainAddress, amountGrains: "49999000" }],
          approvedFeeGrains: "1000",
          replaceable: false,
        },
        xmss,
      );
      transfers.push({
        label: scheme,
        ...result,
        expectedValid: true,
        prevouts: [input],
      });
    } finally {
      seed.fill(0);
    }
  }
  const signed = transfers[1];
  transfers.push({
    ...signed,
    label: "tampered-locktime",
    rawHex: signed.rawHex.slice(0, -8) + "01000000",
    expectedValid: false,
  });
  return {
    status: "passed",
    upstreamCommit: reference.upstreamCommit,
    addresses: reference.vectors.length,
    commitments,
    durationMs: Math.round(performance.now() - started),
    transfers,
  };
}

run()
  .then((result) => {
    Object.assign(window, { pearlCoreResult: result });
    document.getElementById("result")!.textContent = JSON.stringify(
      {
        ...result,
        transfers: result.transfers.map(({ label, txid }) => ({ label, txid })),
      },
      null,
      2,
    );
  })
  .catch((error: unknown) => {
    const result = {
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    };
    Object.assign(window, { pearlCoreResult: result });
    document.getElementById("result")!.textContent = JSON.stringify(result);
  });
