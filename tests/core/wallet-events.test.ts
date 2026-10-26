import { afterEach, expect, it, vi } from "vitest";

afterEach(() => vi.unstubAllGlobals());

it("notifies only approved top-level origins, then sends one revocation signal", async () => {
  vi.resetModules();
  let connect!: (port: chrome.runtime.Port) => void;
  vi.stubGlobal("chrome", {
    runtime: {
      id: "wallet",
      onConnect: {
        addListener: (listener: typeof connect) => {
          connect = listener;
        },
      },
    },
  });
  const { publishWalletChange } = await import("../../src/extension/events");
  function port(origin: string, frameId = 0) {
    const value = {
      name: "wallet-events",
      sender: { id: "wallet", tab: { id: 1 }, frameId, url: origin + "/app" },
      postMessage: vi.fn(),
      disconnect: vi.fn(),
      onDisconnect: { addListener: vi.fn() },
    };
    connect(value as unknown as chrome.runtime.Port);
    return value;
  }
  const approved = port("https://approved.example");
  const other = port("https://other.example");
  const iframe = port("https://approved.example", 1);
  expect(iframe.disconnect).toHaveBeenCalledOnce();
  publishWalletChange(["https://approved.example"]);
  expect(approved.postMessage).toHaveBeenLastCalledWith({ changed: true });
  expect(other.postMessage).not.toHaveBeenCalled();
  publishWalletChange([]);
  expect(approved.postMessage).toHaveBeenCalledTimes(2);
  publishWalletChange([]);
  expect(approved.postMessage).toHaveBeenCalledTimes(2);
});
