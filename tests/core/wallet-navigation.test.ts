import { describe, expect, it } from "vitest";
import {
  readRoute,
  routeHash,
  routeParent,
  type WalletRoute,
} from "../../src/extension/ui/navigation";

describe("wallet routes", () => {
  const id = "c9d26575-ce78-4af6-8840-22af12c90e21";
  it("keeps approval links working and lets explicit navigation leave the review", () => {
    expect(readRoute("", `?review=${id}`)).toEqual({ page: "review", id });
    expect(readRoute("#home", `?review=${id}`)).toEqual({ page: "home" });
    expect(readRoute(`#review/${id}`)).toEqual({ page: "review", id });
    expect(readRoute("", "?review=not-an-id")).toEqual({ page: "home" });
  });
  it("round trips supported destinations and selects their parent navigation", () => {
    const routes: WalletRoute[] = [
      { page: "home" },
      { page: "send" },
      { page: "receive" },
      { page: "activity" },
      { page: "review", id },
      { page: "settings" },
      { page: "settings", section: "security" },
    ];
    for (const route of routes)
      expect(readRoute(routeHash(route))).toEqual(route);
    expect(routeParent({ page: "send" })).toBe("home");
    expect(routeParent({ page: "receive" })).toBe("home");
    expect(routeParent({ page: "review", id })).toBe("activity");
    expect(routeParent({ page: "settings", section: "security" })).toBe(
      "settings",
    );
  });
  it("accepts only known destinations and never serializes arbitrary detail or form state", () => {
    for (const hash of [
      "#settings/unknown",
      "#settings/general/extra",
      "#review/arbitrary",
      "#send/recipient",
      "#mnemonic/words",
    ])
      expect(readRoute(hash)).toEqual({ page: "home" });
    expect(
      routeHash({
        page: "settings",
        section: "secret words",
      } as unknown as WalletRoute),
    ).toBe("#settings");
    expect(routeHash({ page: "review", id: "secret words" })).toBe("#activity");
    expect(
      routeHash({ page: "send", password: "private fixture" } as WalletRoute),
    ).toBe("#send");
  });
});
