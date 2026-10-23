import { useSyncExternalStore } from "react";

export type SettingsSection =
  | "general"
  | "network"
  | "accounts"
  | "sites"
  | "security";
export type WalletRoute =
  | { page: "home" | "send" | "receive" | "activity" }
  | { page: "settings"; section?: SettingsSection }
  | { page: "review"; id: string };

const sections = new Set([
  "general",
  "network",
  "accounts",
  "sites",
  "security",
]);
const reviewId =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function readRoute(hash: string, search = ""): WalletRoute {
  if (!hash) {
    const id = new URLSearchParams(search).get("review");
    return id && reviewId.test(id) ? { page: "review", id } : { page: "home" };
  }
  const [page, detail, extra] = hash.slice(1).split("/");
  if (extra !== undefined) return { page: "home" };
  if (page === "review" && detail && reviewId.test(detail))
    return { page, id: detail };
  if (page === "settings" && (!detail || sections.has(detail)))
    return { page, section: detail as SettingsSection | undefined };
  if (!detail && ["home", "send", "receive", "activity"].includes(page))
    return { page: page as "home" | "send" | "receive" | "activity" };
  return { page: "home" };
}

export function routeHash(route: WalletRoute): string {
  if (route.page === "review")
    return reviewId.test(route.id) ? `#review/${route.id}` : "#activity";
  if (route.page === "settings")
    return route.section && sections.has(route.section)
      ? `#settings/${route.section}`
      : "#settings";
  return ["home", "send", "receive", "activity"].includes(route.page)
    ? `#${route.page}`
    : "#home";
}

export function routeParent(route: WalletRoute) {
  if (route.page === "settings") return "settings";
  return route.page === "activity" || route.page === "review"
    ? "activity"
    : "home";
}

function subscribe(changed: () => void) {
  window.addEventListener("popstate", changed);
  window.addEventListener("hashchange", changed);
  return () => {
    window.removeEventListener("popstate", changed);
    window.removeEventListener("hashchange", changed);
  };
}
function snapshot() {
  return location.hash || location.search;
}
export function navigate(route: WalletRoute) {
  const hash = routeHash(route);
  if (location.hash === hash) return;
  history.pushState(null, "", hash);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
export function useWalletRoute() {
  useSyncExternalStore(subscribe, snapshot);
  return readRoute(location.hash, location.search);
}
