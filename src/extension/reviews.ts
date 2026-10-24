import { walletPath } from "./state";

async function reviewContext(id: string) {
  const contexts = await chrome.runtime.getContexts({});
  return contexts.find((context) => {
    if (!context.documentUrl) return false;
    const url = new URL(context.documentUrl);
    return (
      url.href.startsWith(chrome.runtime.getURL(walletPath)) &&
      url.pathname === `/${walletPath}` &&
      (url.searchParams.get("review") === id || url.hash === `#review/${id}`)
    );
  });
}

export async function openReview(id: string) {
  const existing = await reviewContext(id);
  if (existing && existing.windowId >= 0) {
    try {
      if (existing.tabId >= 0)
        await chrome.tabs.update(existing.tabId, { active: true });
      await chrome.windows.update(existing.windowId, { focused: true });
      return;
    } catch {
      // A view can close between discovery and activation.
    }
  }
  await chrome.windows.create({
    url: chrome.runtime.getURL(
      `${walletPath}?review=${encodeURIComponent(id)}`,
    ),
    type: "popup",
    width: 460,
    height: 720,
  });
}

export async function reviewOpen(id: string, openedAt: number) {
  return Date.now() - openedAt < 3000 || !!(await reviewContext(id));
}
