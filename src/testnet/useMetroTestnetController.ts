import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { selectHasMetroEntitlement, selectMetroPayment, useGameStore } from "../stores/gameStore";
import { testnetApi, TestnetApiError, type ZityTestnetApi } from "./apiClient";
import { shouldRefreshPaymentVerification } from "./controllerPolicy";
import { createOpaqueSessionId } from "./networkMode";
import type { MetroPaymentTransition } from "./paymentMachine";
import { useTestnetHealth, type TestnetHealthController } from "./useTestnetHealth";

type PaymentFailureState = Extract<
  MetroPaymentTransition,
  { type: "payment/failed" }
>["state"];

export type MetroTestnetController = {
  health: TestnetHealthController;
  busy: boolean;
  errorCode?: string;
  start: () => Promise<void>;
  checkPayment: () => Promise<void>;
  retry: () => Promise<void>;
  reset: () => Promise<void>;
};

export type UseMetroTestnetControllerOptions = {
  active: boolean;
  pollIntervalMs?: number;
  api?: ZityTestnetApi;
};

const eventId = (prefix: string): string => `${prefix}-${crypto.randomUUID()}`;
const now = (): string => new Date().toISOString();

function classifyFailure(error: unknown): { state: PaymentFailureState; detail: string } {
  if (!(error instanceof TestnetApiError)) {
    return { state: "invalid-payment", detail: "INVALID_TESTNET_RESPONSE" };
  }

  const code = error.code.toUpperCase();
  if (code.includes("EXPIRED")) return { state: "expired", detail: error.code };
  if (code.includes("INVALID") || code.includes("MISMATCH")) {
    return { state: "invalid-payment", detail: error.code };
  }
  if (code.includes("NETWORK") || code.includes("TIMEOUT") || error.status >= 500) {
    return { state: "network-error", detail: error.code };
  }
  return { state: "failed", detail: error.code };
}

export function useMetroTestnetController({
  active,
  pollIntervalMs = 3_000,
  api = testnetApi,
}: UseMetroTestnetControllerOptions): MetroTestnetController {
  const networkMode = useGameStore((state) => state.networkMode);
  const payment = useGameStore(selectMetroPayment);
  const dispatch = useGameStore((state) => state.dispatchMetroPayment);
  const health = useTestnetHealth({
    enabled: networkMode === "testnet",
    api,
    endpointLabel: "/api/testnet",
  });
  const providerReady = health.requestState !== "error"
    && health.result?.providerMode === "real"
    && health.result.connected
    && health.result.synced
    && health.result.walletAvailable
    && health.result.indexerAvailable;
  const [busy, setBusy] = useState(false);
  const [errorCode, setErrorCode] = useState<string>();
  const sessionId = useRef(createOpaqueSessionId());
  const generation = useRef(0);
  const pollInFlight = useRef(false);

  const fail = useCallback((error: unknown, expectedGeneration: number) => {
    if (expectedGeneration !== generation.current) return;
    const failure = classifyFailure(error);
    setErrorCode(failure.detail);
    // A transport outage cannot invalidate evidence already verified and bound
    // to a still-usable local entitlement. Chain/status regressions still arrive
    // through payment/status-received and revoke it in the reducer.
    if (
      failure.state === "network-error"
      && selectHasMetroEntitlement(useGameStore.getState())
    ) return;
    dispatch({
      type: "payment/failed",
      eventId: eventId("payment-failed"),
      at: now(),
      state: failure.state,
      detail: failure.detail,
    });
  }, [dispatch]);

  const start = useCallback(async () => {
    const state = useGameStore.getState();
    if (!providerReady || state.networkMode !== "testnet" || state.stage !== "metro-checkpoint") return;
    if (![
      "not-created",
      "expired",
      "failed",
      "network-error",
      "invalid-payment",
    ].includes(state.metroPayment.state)) return;

    const currentGeneration = ++generation.current;
    const request = { sessionId: sessionId.current, purpose: "metro-access" as const };
    setBusy(true);
    setErrorCode(undefined);
    dispatch({
      type: "payment/start",
      eventId: eventId("payment-start"),
      at: now(),
      request,
    });
    void health.refresh();

    try {
      const challenge = await api.createPaymentChallenge(request);
      if (currentGeneration !== generation.current) return;
      dispatch({
        type: "payment/challenge-received",
        eventId: eventId("payment-challenge"),
        at: now(),
        challenge,
      });
    } catch (error) {
      fail(error, currentGeneration);
    } finally {
      if (currentGeneration === generation.current) setBusy(false);
    }
  }, [api, dispatch, fail, health, providerReady]);

  const checkPayment = useCallback(async () => {
    if (!providerReady || pollInFlight.current) return;
    const state = useGameStore.getState();
    const challengeId = state.metroPayment.challenge?.challengeId;
    if (state.networkMode !== "testnet" || state.stage !== "metro-checkpoint" || !challengeId) return;

    const currentGeneration = generation.current;
    pollInFlight.current = true;
    setBusy(true);
    setErrorCode(undefined);
    try {
      const status = await api.getPaymentChallengeStatus(challengeId);
      if (
        currentGeneration !== generation.current
        || useGameStore.getState().stage !== "metro-checkpoint"
      ) return;
      dispatch({
        type: "payment/status-received",
        eventId: eventId("payment-status"),
        at: now(),
        status,
      });

      const latestPayment = useGameStore.getState().metroPayment;
      if (shouldRefreshPaymentVerification(
        status,
        latestPayment.verification,
        latestPayment.entitlement,
      )) {
        const verification = await api.verifyPayment(challengeId);
        if (
          currentGeneration !== generation.current
          || useGameStore.getState().stage !== "metro-checkpoint"
        ) return;
        dispatch({
          type: "payment/verification-received",
          eventId: eventId("payment-verification"),
          at: now(),
          verification,
        });
      }
    } catch (error) {
      fail(error, currentGeneration);
    } finally {
      if (currentGeneration === generation.current) {
        setBusy(false);
        pollInFlight.current = false;
      }
    }
  }, [api, dispatch, fail, providerReady]);

  const reset = useCallback(async () => {
    generation.current += 1;
    sessionId.current = createOpaqueSessionId();
    pollInFlight.current = false;
    setBusy(false);
    setErrorCode(undefined);
    dispatch({ type: "payment/reset", eventId: eventId("payment-reset"), at: now() });
    if (useGameStore.getState().stage === "metro-checkpoint") await start();
  }, [dispatch, start]);

  const retry = useCallback(async () => {
    const current = useGameStore.getState().metroPayment;
    if (current.state === "network-error" && current.challenge) {
      await checkPayment();
      return;
    }
    await reset();
  }, [checkPayment, reset]);

  useEffect(() => {
    if (!active || networkMode !== "testnet" || !providerReady || !payment.challenge) return;
    if (![
      "payment-request-created",
      "waiting",
      "detected",
      "confirming",
      "verified",
    ].includes(payment.state)) return;

    void checkPayment();
    const interval = window.setInterval(
      () => void checkPayment(),
      Math.max(1_500, pollIntervalMs),
    );
    return () => window.clearInterval(interval);
  }, [active, checkPayment, networkMode, payment.challenge, payment.state, pollIntervalMs, providerReady]);

  useEffect(() => {
    if (active && networkMode === "testnet" && providerReady) return;
    generation.current += 1;
    pollInFlight.current = false;
    setBusy(false);
  }, [active, networkMode, providerReady]);

  useEffect(() => () => {
    generation.current += 1;
  }, []);

  return useMemo(() => ({
    health,
    busy,
    errorCode,
    start,
    checkPayment,
    retry,
    reset,
  }), [busy, checkPayment, errorCode, health, reset, retry, start]);
}
