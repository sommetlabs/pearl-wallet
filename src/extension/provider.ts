import {
  PearlBlockbook,
  PearlProviderError,
} from "../../packages/connector/src/blockbook";
import type { Network } from "../core/networks";

export class PearlRateLimitError extends PearlProviderError {
  constructor(readonly retryAt: number) {
    super(429);
    this.message =
      "Pearl is receiving too many requests. Waiting before retrying.";
  }
}

interface ProviderState {
  tail: Promise<void>;
  nextAt: number;
  retryAt: number;
  failures: number;
}

export class PearlReadQueue {
  private readonly providers = new Map<string, ProviderState>();
  constructor(private readonly spacingMs = 250) {}

  private state(base: string): ProviderState {
    const origin = new URL(base).origin;
    let state = this.providers.get(origin);
    if (!state) {
      state = { tail: Promise.resolve(), nextAt: 0, retryAt: 0, failures: 0 };
      this.providers.set(origin, state);
    }
    return state;
  }

  pause(base: string, until: number) {
    const state = this.state(base);
    state.retryAt = Math.max(state.retryAt, until);
  }

  readonly read: typeof fetch = async (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const state = this.state(url);
    const previous = state.tail;
    let release!: () => void;
    state.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      if (Date.now() < state.retryAt)
        throw new PearlRateLimitError(state.retryAt);
      const wait = Math.max(0, state.nextAt - Date.now());
      if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
      if (Date.now() < state.retryAt)
        throw new PearlRateLimitError(state.retryAt);
      init?.signal?.throwIfAborted();
      state.nextAt = Date.now() + this.spacingMs;
      const response = await fetch(input, init);
      if (response.status === 429) {
        state.failures++;
        const header = response.headers.get("Retry-After");
        const seconds = header && /^\d+$/.test(header) ? Number(header) : NaN;
        const date =
          header && !Number.isFinite(seconds) ? Date.parse(header) : NaN;
        const delay = Number.isFinite(seconds)
          ? seconds * 1000
          : Number.isFinite(date)
            ? date - Date.now()
            : 30_000 * 2 ** Math.min(state.failures - 1, 3);
        state.retryAt = Date.now() + Math.max(1000, delay);
        await response.body?.cancel().catch(() => {});
        throw new PearlRateLimitError(state.retryAt);
      }
      state.failures = 0;
      return response;
    } finally {
      release();
    }
  };
}

const reads = new PearlReadQueue();
export function pearlProvider(base: string, network: Network, retryAt = 0) {
  reads.pause(base, retryAt);
  return new PearlBlockbook(base, network, reads.read);
}
