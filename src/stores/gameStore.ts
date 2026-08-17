import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  compareProfiles,
  consumeAuthorization,
  deriveProfile,
} from "../privacy/engine";
import {
  cloneRunForRedesign,
  createBaselineRun,
  simulateScenario,
} from "../privacy/scenarios";
import type { NetworkMode } from "../testnet/contracts";
import {
  createDemoMetroEntitlement,
  createInitialMetroPaymentSession,
  hasUsableMetroEntitlement,
  resolveConfiguredNetworkMode,
  transitionMetroPayment,
  type MetroPaymentSession,
  type MetroPaymentTransition,
} from "../testnet/paymentMachine";
import type {
  AuthorizationLedger,
  AuthorizationUseResult,
  DesignChoice,
  ExposureProfile,
  InteractionId,
  Language,
  RethinkScenarioId,
  ScenarioComparison,
  ScenarioRun,
  StoryStage,
  WatcherEvent,
} from "../types/game";

export type GameState = {
  language: Language;
  stage: StoryStage;
  networkMode: NetworkMode;
  metroPayment: MetroPaymentSession;
  pendingMetroDesign: DesignChoice | null;
  baselineRuns: ScenarioRun[];
  redesignedRuns: ScenarioRun[];
  designChoices: Partial<Record<RethinkScenarioId, DesignChoice>>;
  watcherEvents: WatcherEvent[];
  authorizationLedger: AuthorizationLedger;
  authorizationReuseAttempted: boolean;
  authorizationReuseResult: AuthorizationUseResult | null;
  currentInteraction: InteractionId | null;
  paused: boolean;
  muted: boolean;
  reducedMotion: boolean;
  tutorialDismissed: boolean;
  setLanguage: (language: Language) => void;
  configureNetworkMode: (networkMode: NetworkMode) => void;
  dispatchMetroPayment: (transition: MetroPaymentTransition) => void;
  markMovement: () => void;
  openInteraction: (interaction: InteractionId) => void;
  closeInteraction: () => void;
  buyTicket: () => void;
  connectMetro: () => void;
  connectCafe: () => void;
  connectClinic: () => void;
  beginRethink: () => void;
  selectDesign: (scenarioId: RethinkScenarioId, choice: DesignChoice) => void;
  proveMetroAccess: () => void;
  continueComparison: () => void;
  attemptAuthorizationReuse: () => void;
  finishAuthorizationReuse: () => void;
  showResults: () => void;
  setPaused: (paused: boolean) => void;
  setMuted: (muted: boolean) => void;
  setReducedMotion: (reduced: boolean) => void;
  resetExperience: () => void;
};

const browserLanguage = (): Language => {
  if (typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("tr")) {
    return "tr";
  }
  return "en";
};

const configuredNetworkMode = resolveConfiguredNetworkMode(
  import.meta.env.VITE_NETWORK_MODE,
);

const createInitialSession = (networkMode: NetworkMode) => ({
  stage: "spawn" as StoryStage,
  networkMode,
  metroPayment: createInitialMetroPaymentSession(networkMode),
  pendingMetroDesign: null as DesignChoice | null,
  baselineRuns: [] as ScenarioRun[],
  redesignedRuns: [] as ScenarioRun[],
  designChoices: {} as Partial<Record<RethinkScenarioId, DesignChoice>>,
  watcherEvents: [] as WatcherEvent[],
  authorizationLedger: {} as AuthorizationLedger,
  authorizationReuseAttempted: false,
  authorizationReuseResult: null as AuthorizationUseResult | null,
  currentInteraction: null as InteractionId | null,
  paused: false,
  tutorialDismissed: false,
});

const completeDemoPayment = (
  session: MetroPaymentSession,
  nowMs: number,
  eventId: string,
): MetroPaymentSession => transitionMetroPayment(session, {
  type: "payment/demo-verified",
  eventId,
  at: new Date(nowMs).toISOString(),
  entitlement: createDemoMetroEntitlement("demo-metro-entitlement", nowMs),
});

const replaceRun = (runs: ScenarioRun[], incoming: ScenarioRun): ScenarioRun[] => [
  ...runs.filter((run) => run.scenarioId !== incoming.scenarioId),
  incoming,
];

const appendEvent = (events: WatcherEvent[], event: WatcherEvent): WatcherEvent[] => [
  ...events.filter((existing) => existing.id !== event.id),
  event,
];

const eventKindForRun = (run: ScenarioRun): WatcherEvent["kind"] => {
  if (run.tone === "success") return "success";
  if (run.tone === "warning") return "warning";
  return "neutral";
};

const createBaselineEvent = (
  previousRuns: ScenarioRun[],
  nextRuns: ScenarioRun[],
  run: ScenarioRun,
): WatcherEvent => ({
  id: `baseline:${run.scenarioId}`,
  titleKey: run.outcomeTitleKey,
  detailKey: run.outcomeDetailKey,
  delta: deriveProfile(nextRuns).metrics.score - deriveProfile(previousRuns).metrics.score,
  kind: eventKindForRun(run),
  scenarioId: run.scenarioId,
  choice: run.choice,
});

const createRedesignEvent = (
  baselineRuns: ScenarioRun[],
  redesignedRuns: ScenarioRun[],
  run: ScenarioRun,
): WatcherEvent => {
  const comparison = compareProfiles(baselineRuns, redesignedRuns);
  const standardImpact = createBaselineRun(run.scenarioId).scoreImpact;
  return {
    id: `redesign:${run.scenarioId}`,
    titleKey: run.outcomeTitleKey,
    detailKey: run.outcomeDetailKey,
    delta: run.scoreImpact - standardImpact,
    kind: eventKindForRun(run),
    scenarioId: run.scenarioId,
    choice: run.choice,
    removedLinks: comparison.removedCrossServiceLinkIds.length,
    removedInferences: comparison.removedInferenceIds.length,
  };
};

const expectedRethinkScenario = (stage: StoryStage): RethinkScenarioId | null => {
  if (stage === "clinic-rethink") return "clinic";
  if (stage === "metro-rethink") return "metro";
  if (stage === "club") return "club";
  return null;
};

export const selectBaselineProfile = (state: GameState): ExposureProfile =>
  deriveProfile(state.baselineRuns);

export const selectRedesignProfile = (state: GameState): ExposureProfile =>
  deriveProfile(state.redesignedRuns);

const baselineStages = new Set<StoryStage>([
  "spawn",
  "metro-ticket",
  "metro-gate",
  "cafe",
  "clinic",
  "perspective-shift",
]);

export const selectActiveProfile = (state: GameState): ExposureProfile =>
  baselineStages.has(state.stage)
    ? selectBaselineProfile(state)
    : selectRedesignProfile(state);

export const selectComparison = (state: GameState): ScenarioComparison =>
  compareProfiles(state.baselineRuns, state.redesignedRuns);

export const selectMetroPayment = (state: GameState): MetroPaymentSession =>
  state.metroPayment;

export const selectHasMetroEntitlement = (state: GameState): boolean =>
  hasUsableMetroEntitlement(state.metroPayment, Date.now());

export const useGameStore = create<GameState>()(
  persist(
    (set) => ({
      language: browserLanguage(),
      ...createInitialSession(configuredNetworkMode),
      muted: true,
      reducedMotion:
        typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,

      setLanguage: (language) => set({ language }),
      configureNetworkMode: (networkMode) => set({
        ...createInitialSession(networkMode),
        networkMode,
      }),
      dispatchMetroPayment: (transition) => set((state) => ({
        metroPayment: transitionMetroPayment(state.metroPayment, transition),
      })),
      markMovement: () => set((state) => ({
        tutorialDismissed: true,
        stage: state.stage === "spawn" ? "metro-ticket" : state.stage,
      })),
      openInteraction: (currentInteraction) => set({ currentInteraction }),
      closeInteraction: () => set({ currentInteraction: null }),

      buyTicket: () => set((state) => {
        if (state.stage !== "metro-ticket") return {};
        return { stage: "metro-gate", currentInteraction: null };
      }),

      connectMetro: () => set((state) => {
        if (state.stage !== "metro-gate") return {};
        const run = createBaselineRun("metro");
        const baselineRuns = replaceRun(state.baselineRuns, run);
        return {
          stage: "cafe",
          currentInteraction: null,
          baselineRuns,
          watcherEvents: appendEvent(
            state.watcherEvents,
            createBaselineEvent(state.baselineRuns, baselineRuns, run),
          ),
        };
      }),

      connectCafe: () => set((state) => {
        if (state.stage !== "cafe") return {};
        const run = createBaselineRun("cafe");
        const baselineRuns = replaceRun(state.baselineRuns, run);
        return {
          stage: "clinic",
          currentInteraction: null,
          baselineRuns,
          watcherEvents: appendEvent(
            state.watcherEvents,
            createBaselineEvent(state.baselineRuns, baselineRuns, run),
          ),
        };
      }),

      connectClinic: () => set((state) => {
        if (state.stage !== "clinic") return {};
        const run = createBaselineRun("clinic");
        const baselineRuns = replaceRun(state.baselineRuns, run);
        return {
          stage: "perspective-shift",
          currentInteraction: null,
          baselineRuns,
          watcherEvents: appendEvent(
            state.watcherEvents,
            createBaselineEvent(state.baselineRuns, baselineRuns, run),
          ),
        };
      }),

      beginRethink: () => set((state) => {
        if (state.stage !== "perspective-shift") return {};
        return {
          stage: "clinic-rethink",
          currentInteraction: null,
          redesignedRuns: state.baselineRuns.map(cloneRunForRedesign),
          designChoices: {},
          authorizationLedger: {},
          authorizationReuseAttempted: false,
          authorizationReuseResult: null,
          pendingMetroDesign: null,
          metroPayment: createInitialMetroPaymentSession(state.networkMode),
          watcherEvents: appendEvent(state.watcherEvents, {
            id: "perspective-shift",
            titleKey: "watcher.perspectiveShift",
            detailKey: "watcher.perspectiveShiftDetail",
            delta: 0,
            kind: "neutral",
          }),
        };
      }),

      selectDesign: (scenarioId, choice) => set((state) => {
        if (expectedRethinkScenario(state.stage) !== scenarioId) return {};

        if (scenarioId === "metro" && state.networkMode === "testnet") {
          return {
            stage: "metro-checkpoint",
            currentInteraction: null,
            pendingMetroDesign: choice,
            designChoices: { ...state.designChoices, metro: choice },
            metroPayment: createInitialMetroPaymentSession("testnet"),
          };
        }

        const redesignedRun = simulateScenario(scenarioId, choice, "redesigned");
        let baselineRuns = state.baselineRuns;
        if (scenarioId === "club") {
          baselineRuns = replaceRun(baselineRuns, createBaselineRun("club"));
        }
        const redesignedRuns = replaceRun(state.redesignedRuns, redesignedRun);
        let authorizationLedger = state.authorizationLedger;
        let metroPayment = state.metroPayment;
        if (scenarioId === "metro" && redesignedRun.authorization) {
          const nowMs = Date.now();
          const verifiedDemo = completeDemoPayment(
            createInitialMetroPaymentSession("demo"),
            nowMs,
            `demo-payment-${nowMs}`,
          );
          metroPayment = transitionMetroPayment(verifiedDemo, {
            type: "payment/entitlement-consumed",
            eventId: `demo-entitlement-consumed-${nowMs}`,
            at: new Date(nowMs).toISOString(),
          });
          authorizationLedger = consumeAuthorization(
            redesignedRun.authorization,
            authorizationLedger,
          ).ledger;
        }

        const nextStage: StoryStage = scenarioId === "clinic"
          ? "clinic-compare"
          : scenarioId === "metro"
            ? "metro-compare"
            : "club-compare";

        return {
          stage: nextStage,
          currentInteraction: null,
          baselineRuns,
          redesignedRuns,
          designChoices: { ...state.designChoices, [scenarioId]: choice },
          pendingMetroDesign: null,
          metroPayment,
          authorizationLedger,
          watcherEvents: appendEvent(
            state.watcherEvents,
            createRedesignEvent(baselineRuns, redesignedRuns, redesignedRun),
          ),
        };
      }),

      proveMetroAccess: () => set((state) => {
        if (state.stage !== "metro-checkpoint" || !state.pendingMetroDesign) return {};
        const nowMs = Date.now();
        if (!hasUsableMetroEntitlement(state.metroPayment, nowMs)) return {};

        const run = simulateScenario("metro", state.pendingMetroDesign, "redesigned");
        if (!run.authorization) return {};
        const metroPayment = transitionMetroPayment(state.metroPayment, {
          type: "payment/entitlement-consumed",
          eventId: `testnet-entitlement-consumed-${nowMs}`,
          at: new Date(nowMs).toISOString(),
        });
        if (metroPayment.entitlement?.useCount !== 1) return {};

        const redesignedRuns = replaceRun(state.redesignedRuns, run);
        const authorizationLedger = consumeAuthorization(
          run.authorization,
          state.authorizationLedger,
        ).ledger;
        return {
          stage: "metro-compare",
          currentInteraction: null,
          pendingMetroDesign: null,
          metroPayment,
          redesignedRuns,
          authorizationLedger,
          watcherEvents: appendEvent(
            state.watcherEvents,
            createRedesignEvent(state.baselineRuns, redesignedRuns, run),
          ),
        };
      }),

      continueComparison: () => set((state) => {
        if (state.stage === "clinic-compare") {
          return { stage: "metro-rethink", currentInteraction: null };
        }
        if (state.stage === "metro-compare") {
          return {
            stage: "metro-reuse",
            currentInteraction: null,
            authorizationReuseAttempted: false,
            authorizationReuseResult: null,
          };
        }
        if (state.stage === "club-compare") {
          return { stage: "results", currentInteraction: "results" };
        }
        return {};
      }),

      attemptAuthorizationReuse: () => set((state) => {
        if (state.stage !== "metro-reuse" || state.authorizationReuseAttempted) return {};
        const metroRun = state.redesignedRuns.find((run) => run.scenarioId === "metro");
        if (!metroRun?.authorization) return {};
        const result = consumeAuthorization(metroRun.authorization, state.authorizationLedger);
        return {
          authorizationLedger: result.ledger,
          authorizationReuseAttempted: true,
          authorizationReuseResult: result,
          watcherEvents: appendEvent(state.watcherEvents, {
            id: "authorization-reuse",
            titleKey: result.granted ? "reuse.accepted" : "reuse.denied",
            detailKey: result.identityRevealed
              ? "reuse.deniedIdentityKnownDetail"
              : "reuse.deniedWithoutIdentityDetail",
            delta: 0,
            kind: result.granted ? "neutral" : "blocked",
            scenarioId: "metro",
            choice: metroRun.choice,
          }),
        };
      }),

      finishAuthorizationReuse: () => set((state) => {
        if (state.stage !== "metro-reuse" || !state.authorizationReuseAttempted) return {};
        return { stage: "club", currentInteraction: null };
      }),

      showResults: () => set((state) => {
        if (state.stage !== "club-compare" && state.stage !== "results") return {};
        return { stage: "results", currentInteraction: "results" };
      }),
      setPaused: (paused) => set({ paused }),
      setMuted: (muted) => set({ muted }),
      setReducedMotion: (reducedMotion) => set({ reducedMotion }),
      resetExperience: () => set((state) => createInitialSession(state.networkMode)),
    }),
    {
      name: "zity-session-v3",
      version: 3,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => {
        const persistJourney = state.networkMode === "demo";
        return {
          language: state.language,
          stage: persistJourney ? state.stage : "spawn",
          baselineRuns: persistJourney ? state.baselineRuns : [],
          redesignedRuns: persistJourney ? state.redesignedRuns : [],
          designChoices: persistJourney ? state.designChoices : {},
          watcherEvents: persistJourney ? state.watcherEvents : [],
          authorizationLedger: persistJourney ? state.authorizationLedger : {},
          authorizationReuseAttempted: persistJourney
            ? state.authorizationReuseAttempted
            : false,
          authorizationReuseResult: persistJourney
            ? state.authorizationReuseResult
            : null,
          muted: state.muted,
          reducedMotion: state.reducedMotion,
          tutorialDismissed: persistJourney ? state.tutorialDismissed : false,
        };
      },
    },
  ),
);

export const advancePresentationCheckpoint = (): void => {
  const state = useGameStore.getState();
  switch (state.stage) {
    case "spawn":
      state.markMovement();
      break;
    case "metro-ticket":
      state.buyTicket();
      break;
    case "metro-gate":
      state.connectMetro();
      break;
    case "cafe":
      state.connectCafe();
      break;
    case "clinic":
      state.connectClinic();
      break;
    case "perspective-shift":
      state.beginRethink();
      break;
    case "clinic-rethink":
      state.selectDesign("clinic", "minimum");
      break;
    case "clinic-compare":
      state.continueComparison();
      break;
    case "metro-rethink":
      state.selectDesign("metro", "minimum");
      break;
    case "metro-compare":
      state.continueComparison();
      break;
    case "metro-reuse":
      if (state.authorizationReuseAttempted) state.finishAuthorizationReuse();
      else state.attemptAuthorizationReuse();
      break;
    case "club":
      state.selectDesign("club", "minimum");
      break;
    case "club-compare":
      state.continueComparison();
      break;
    case "results":
      state.resetExperience();
      break;
  }
};
