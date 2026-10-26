import { z } from "zod";
import { pearlProvider } from "./provider";
import { cryptoCall } from "./crypto-host";
import { store } from "./state";
import type { RecoveryCandidate } from "./model";

export async function inspectRecovery(
  mnemonic: string,
  checkActivity = true,
): Promise<RecoveryCandidate[]> {
  if (store.encrypted)
    throw new Error("A wallet already exists on this profile");
  const previews = await cryptoCall("previewRecovery", { mnemonic });
  if (!checkActivity)
    return previews.map((preview) => ({ ...preview, activity: "not-checked" }));
  const indexer = pearlProvider(store.settings.endpoints.testnet2, "testnet2");
  const history = z.object({
    txs: z.number().int().nonnegative(),
    unconfirmedTxs: z.number().int().nonnegative(),
  });
  try {
    await indexer.tip();
    return await Promise.all(
      previews.map(async (preview) => {
        const observation = history.parse(
          await indexer.read(`/address/${preview.address}?details=basic`),
        );
        return {
          ...preview,
          activity:
            observation.txs + observation.unconfirmedTxs > 0
              ? ("found" as const)
              : ("none" as const),
        };
      }),
    );
  } catch {
    return previews.map((preview) => ({ ...preview, activity: "unavailable" }));
  }
}
