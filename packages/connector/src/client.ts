import { z } from "zod";
import {
  CHANNEL,
  accountSchema,
  actionSchema,
  receiptSchema,
  trustedOrigin,
  type PearlAction,
  type PearlAccount,
  type PearlReceipt,
} from "./protocol.ts";
export type { PearlAccount, PearlReceipt, PearlAction } from "./protocol.ts";

/** One wallet-owned approval window; signing authority never crosses origins. */
export class PearlWalletConnector {
  private popup: Window | null = null;
  private session = crypto.randomUUID();
  private pending = false;
  private readonly origin: string;
  constructor(walletUrl: string) {
    this.origin = trustedOrigin(walletUrl);
  }
  connect(): Promise<PearlAccount> {
    return this.request({ method: "connect" }, accountSchema);
  }
  execute(action: Exclude<PearlAction, { method: "connect" }>): Promise<PearlReceipt> {
    return this.request(action, receiptSchema);
  }
  disconnect(): void {
    this.popup?.close();
    this.popup = null;
    this.session = crypto.randomUUID();
  }

  private request<T>(action: PearlAction, schema: z.ZodType<T>): Promise<T> {
    if (this.pending) return Promise.reject(new Error("Finish the current wallet approval first"));
    actionSchema.parse(action);
    if (!this.popup || this.popup.closed) {
      this.session = crypto.randomUUID();
      const url = new URL("/connect", this.origin);
      url.searchParams.set("origin", location.origin);
      url.searchParams.set("session", this.session);
      this.popup = window.open(url, `pearl-wallet-${this.session}`, "popup,width=460,height=760");
    }
    if (!this.popup)
      return Promise.reject(new Error("Allow pop-ups for Abyss to open the Pearl wallet"));
    this.popup.focus();
    this.pending = true;
    const requestId = crypto.randomUUID();
    const popup = this.popup;
    return new Promise((resolve, reject) => {
      let sent = false;
      const finish = (error?: Error, value?: T) => {
        clearInterval(tick);
        clearTimeout(timeout);
        window.removeEventListener("message", receive);
        this.pending = false;
        if (error) reject(error);
        else resolve(value as T);
      };
      const receive = (event: MessageEvent) => {
        if (
          event.source !== popup ||
          event.origin !== this.origin ||
          event.data?.channel !== CHANNEL ||
          event.data?.session !== this.session
        )
          return;
        if (event.data.type === "ready" && !sent) {
          sent = true;
          popup.postMessage(
            { channel: CHANNEL, session: this.session, type: "request", requestId, action },
            this.origin,
          );
        } else if (event.data.type === "response" && event.data.requestId === requestId) {
          if (event.data.error) finish(new Error(String(event.data.error).slice(0, 500)));
          else {
            try {
              finish(undefined, schema.parse(event.data.result));
            } catch {
              finish(
                new Error(
                  "The wallet returned an invalid response. Check its transaction history before retrying.",
                ),
              );
            }
          }
        }
      };
      window.addEventListener("message", receive);
      const tick = setInterval(() => {
        if (popup.closed) {
          finish(
            new Error(
              sent
                ? "Wallet closed. Check the saved swap before retrying an action."
                : "Wallet window closed",
            ),
          );
          return;
        }
        if (!sent)
          popup.postMessage(
            { channel: CHANNEL, session: this.session, type: "hello" },
            this.origin,
          );
      }, 300);
      const timeout = setTimeout(
        () =>
          finish(
            new Error("Wallet approval timed out. Check the saved swap before retrying an action."),
          ),
        180_000,
      );
    });
  }
}
