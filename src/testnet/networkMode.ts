import type { NetworkMode } from "./contracts";

export function resolveNetworkMode(
  presentation: boolean,
  search = typeof window === "undefined" ? "" : window.location.search,
): NetworkMode {
  if (presentation) return "testnet";
  const requested = new URLSearchParams(search).get("network");
  return requested === "testnet" ? "testnet" : "demo";
}

export function createOpaqueSessionId(): string {
  return `zity_${crypto.randomUUID().replaceAll("-", "")}`;
}
