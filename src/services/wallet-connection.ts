import {
  actionSchema,
  CHANNEL,
  sessionIdSchema,
  trustedOrigin,
  type PearlAction,
} from "@sommetlabs/pearl-wallet-connect/protocol";
export interface WalletRequest {
  id: string;
  action: PearlAction;
}

export class WalletConnection {
  readonly origin: string;
  private readonly session: string;
  private readonly opener: Window;
  private activeId: string | null = null;
  private responses = new Map<string, unknown>();
  constructor(search: string, opener: Window | null) {
    const query = new URLSearchParams(search);
    this.origin = trustedOrigin(query.get("origin") ?? "");
    this.session = sessionIdSchema.parse(query.get("session"));
    if (!opener || opener === window) throw new Error("Open the wallet from Abyss to connect");
    this.opener = opener;
  }
  listen(receive: (request: WalletRequest) => void): () => void {
    const listener = (event: MessageEvent) => {
      const data = event.data;
      if (
        event.source !== this.opener ||
        event.origin !== this.origin ||
        data?.channel !== CHANNEL ||
        data?.session !== this.session
      )
        return;
      if (data.type === "hello") {
        this.send({ type: "ready" });
        return;
      }
      if (data.type !== "request" || !sessionIdSchema.safeParse(data.requestId).success) return;
      const id = data.requestId as string;
      const cached = this.responses.get(id);
      if (cached) {
        this.opener.postMessage(cached, this.origin);
        return;
      }
      if (this.activeId) {
        if (this.activeId !== id)
          this.send({
            type: "response",
            requestId: id,
            error: "Finish or reject the existing request in the wallet first",
          });
        return;
      }
      try {
        if (JSON.stringify(data).length > 150_000) throw new Error("Request too large");
        const action = actionSchema.parse(data.action);
        this.activeId = id;
        receive({ id, action });
      } catch {
        this.send({ type: "response", requestId: id, error: "Unsupported wallet request" });
      }
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }
  respond(id: string, result?: unknown, error?: string): void {
    if (id !== this.activeId) throw new Error("Wallet response does not match its pending request");
    const response = {
      channel: CHANNEL,
      session: this.session,
      type: "response",
      requestId: id,
      ...(error ? { error } : { result }),
    };
    this.responses.set(id, response);
    if (this.responses.size > 20) this.responses.delete(this.responses.keys().next().value!);
    this.opener.postMessage(response, this.origin);
    this.activeId = null;
  }
  private send(value: Record<string, unknown>): void {
    this.opener.postMessage({ channel: CHANNEL, session: this.session, ...value }, this.origin);
  }
}
