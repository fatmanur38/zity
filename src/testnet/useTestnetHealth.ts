import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TestnetHealthView } from "../components/TestnetUi";
import { TestnetApiError, testnetApi, type ZityTestnetApi } from "./apiClient";

export type UseTestnetHealthOptions = {
  enabled: boolean;
  pollIntervalMs?: number;
  endpointLabel?: string;
  api?: Pick<ZityTestnetApi, "health">;
};

export type TestnetHealthController = TestnetHealthView & {
  refresh: () => Promise<void>;
};

const initialView = (endpointLabel: string): TestnetHealthView => ({
  requestState: "idle",
  result: null,
  endpointLabel,
});

export function useTestnetHealth({
  enabled,
  pollIntervalMs = 15_000,
  endpointLabel = "/api/testnet",
  api = testnetApi,
}: UseTestnetHealthOptions): TestnetHealthController {
  const [view, setView] = useState<TestnetHealthView>(() => initialView(endpointLabel));
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    const currentRequest = ++requestId.current;
    const startedAt = performance.now();
    setView((current) => ({ ...current, requestState: "checking", errorCode: undefined }));

    try {
      const result = await api.health();
      if (currentRequest !== requestId.current) return;
      setView({
        requestState: "ready",
        result,
        endpointLabel,
        latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
      });
    } catch (error) {
      if (currentRequest !== requestId.current) return;
      setView((current) => ({
        ...current,
        requestState: "error",
        errorCode: error instanceof TestnetApiError ? error.code : "NETWORK_ERROR",
        latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
      }));
    }
  }, [api, enabled, endpointLabel]);

  useEffect(() => {
    if (!enabled) {
      requestId.current += 1;
      setView(initialView(endpointLabel));
      return;
    }

    void refresh();
    const interval = window.setInterval(() => void refresh(), Math.max(5_000, pollIntervalMs));
    return () => {
      requestId.current += 1;
      window.clearInterval(interval);
    };
  }, [enabled, endpointLabel, pollIntervalMs, refresh]);

  return useMemo(() => ({ ...view, refresh }), [refresh, view]);
}
