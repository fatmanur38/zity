import { describe, expect, it } from "vitest";
import { createOpaqueSessionId, resolveNetworkMode } from "./networkMode";

describe("network mode routing", () => {
  it("keeps the audience route in demo unless testnet is explicitly requested", () => {
    expect(resolveNetworkMode(false, "")).toBe("demo");
    expect(resolveNetworkMode(false, "?network=demo")).toBe("demo");
    expect(resolveNetworkMode(false, "?network=testnet")).toBe("testnet");
  });

  it("always treats presenter mode as testnet", () => {
    expect(resolveNetworkMode(true, "")).toBe("testnet");
    expect(resolveNetworkMode(true, "?network=demo")).toBe("testnet");
  });

  it("recomputes the audience mode for each SPA query change", () => {
    const routeSearches = ["", "?network=testnet", "?network=demo", ""];
    expect(routeSearches.map((search) => resolveNetworkMode(false, search))).toEqual([
      "demo",
      "testnet",
      "demo",
      "demo",
    ]);
  });

  it("creates opaque identifiers without player data", () => {
    const sessionId = createOpaqueSessionId();
    expect(sessionId).toMatch(/^zity_[a-f0-9]{32}$/);
    expect(sessionId).not.toMatch(/name|email|phone|score|medical/i);
  });
});
