import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { clampScore, createFieldDisclosure, createPredicateDisclosure } from "../privacy/engine";
import type {
  Correlation,
  Disclosure,
  InteractionId,
  Language,
  StoryStage,
  WatcherEvent,
} from "../types/game";

type GameState = {
  language: Language;
  stage: StoryStage;
  profileCompleteness: number;
  disclosures: Disclosure[];
  correlations: Correlation[];
  completedMissions: string[];
  usedAuthorizations: string[];
  watcherEvents: WatcherEvent[];
  currentInteraction: InteractionId | null;
  ticketPurchased: boolean;
  minimumDisclosureEnabled: boolean;
  authorizationReuseAttempted: boolean;
  clubUsedMinimumDisclosure: boolean | null;
  paused: boolean;
  muted: boolean;
  reducedMotion: boolean;
  tutorialDismissed: boolean;
  setLanguage: (language: Language) => void;
  markMovement: () => void;
  openInteraction: (interaction: InteractionId) => void;
  closeInteraction: () => void;
  buyTicket: () => void;
  connectMetro: () => void;
  connectCafe: () => void;
  connectClinic: () => void;
  enableMinimumDisclosure: () => void;
  useStandardProof: () => void;
  useMinimumProof: () => void;
  reuseMinimumProof: () => void;
  completeClub: (minimum: boolean) => void;
  showResults: () => void;
  startAttackerMode: () => void;
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

const createEvent = (
  id: string,
  titleKey: string,
  detailKey: string,
  delta: number,
  kind: WatcherEvent["kind"],
): WatcherEvent => ({ id, titleKey, detailKey, delta, kind });

const initialSession = {
  stage: "spawn" as StoryStage,
  profileCompleteness: 3,
  disclosures: [] as Disclosure[],
  correlations: [] as Correlation[],
  completedMissions: [] as string[],
  usedAuthorizations: [] as string[],
  watcherEvents: [] as WatcherEvent[],
  currentInteraction: null as InteractionId | null,
  ticketPurchased: false,
  minimumDisclosureEnabled: false,
  authorizationReuseAttempted: false,
  clubUsedMinimumDisclosure: null as boolean | null,
  paused: false,
  tutorialDismissed: false,
};

const addUnique = <T extends { id: string }>(existing: T[], incoming: T[]): T[] => {
  const known = new Set(existing.map((item) => item.id));
  return [...existing, ...incoming.filter((item) => !known.has(item.id))];
};

export const useGameStore = create<GameState>()(
  persist(
    (set) => ({
      language: browserLanguage(),
      ...initialSession,
      muted: true,
      reducedMotion:
        typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,

      setLanguage: (language) => set({ language }),
      markMovement: () => set((state) => ({
        tutorialDismissed: true,
        stage: state.stage === "spawn" ? "metro-ticket" : state.stage,
      })),
      openInteraction: (currentInteraction) => set({ currentInteraction }),
      closeInteraction: () => set({ currentInteraction: null }),

      buyTicket: () => set((state) => ({
        ticketPurchased: true,
        stage: "metro-gate",
        currentInteraction: null,
        completedMissions: [...new Set([...state.completedMissions, "metro-ticket"])],
        disclosures: addUnique(state.disclosures, [
          createPredicateDisclosure("validTicket", "payment"),
        ]),
      })),

      connectMetro: () => set((state) => ({
        stage: "cafe",
        profileCompleteness: 17,
        currentInteraction: null,
        disclosures: addUnique(state.disclosures, [
          createFieldDisclosure("accountId", "metro"),
          createFieldDisclosure("purchaseHistory", "metro"),
        ]),
        correlations: addUnique(state.correlations, [
          { id: "account-metro", from: "account", to: "metro", reasonKey: "watcher.reasonMetro" },
          { id: "payment-account", from: "payment", to: "account", reasonKey: "watcher.reasonMetro" },
        ]),
        completedMissions: [...new Set([...state.completedMissions, "metro"])],
        watcherEvents: [
          ...state.watcherEvents,
          createEvent("account-discovered", "watcher.accountDiscovered", "watcher.accountDetail", 14, "warning"),
        ],
      })),

      connectCafe: () => set((state) => ({
        stage: "clinic",
        profileCompleteness: 34,
        currentInteraction: null,
        disclosures: addUnique(state.disclosures, [
          createFieldDisclosure("accountId", "cafe"),
          createFieldDisclosure("purchaseHistory", "cafe"),
        ]),
        correlations: addUnique(state.correlations, [
          { id: "account-cafe", from: "account", to: "cafe", reasonKey: "watcher.reasonCafe" },
        ]),
        completedMissions: [...new Set([...state.completedMissions, "cafe"])],
        watcherEvents: [
          ...state.watcherEvents,
          createEvent("cross-service-match", "watcher.crossMatch", "watcher.crossDetail", 17, "warning"),
        ],
      })),

      connectClinic: () => set((state) => ({
        stage: "minimum-disclosure",
        profileCompleteness: 61,
        currentInteraction: "minimum-disclosure",
        disclosures: addUnique(state.disclosures, [
          createFieldDisclosure("accountId", "clinic"),
          createFieldDisclosure("medicalRelationship", "clinic"),
        ]),
        correlations: addUnique(state.correlations, [
          { id: "account-clinic", from: "account", to: "clinic", reasonKey: "watcher.reasonClinic" },
        ]),
        completedMissions: [...new Set([...state.completedMissions, "clinic"])],
        watcherEvents: [
          ...state.watcherEvents,
          createEvent("possible-health", "watcher.health", "watcher.healthDetail", 27, "warning"),
        ],
      })),

      enableMinimumDisclosure: () => set({
        minimumDisclosureEnabled: true,
        stage: "metro-proof",
        currentInteraction: null,
      }),

      useStandardProof: () => set((state) => ({
        stage: "club",
        profileCompleteness: clampScore(state.profileCompleteness + 14),
        currentInteraction: null,
        disclosures: addUnique(state.disclosures, [
          createFieldDisclosure("accountId", "metro-proof"),
        ]),
        correlations: addUnique(state.correlations, [
          { id: "account-metro-proof", from: "account", to: "metro-proof", reasonKey: "watcher.reasonCafe" },
        ]),
        completedMissions: [...new Set([...state.completedMissions, "metro-proof-standard"])],
        watcherEvents: [
          ...state.watcherEvents,
          createEvent("proof-standard-match", "watcher.crossMatch", "watcher.crossDetail", 14, "warning"),
        ],
      })),

      useMinimumProof: () => set((state) => ({
        stage: "metro-reuse",
        profileCompleteness: clampScore(state.profileCompleteness),
        usedAuthorizations: [...new Set([...state.usedAuthorizations, "metro-pass-M91"])],
        disclosures: addUnique(state.disclosures, [
          createPredicateDisclosure("validPass", "metro-proof"),
        ]),
        completedMissions: [...new Set([...state.completedMissions, "metro-proof"])],
        watcherEvents: [
          ...state.watcherEvents,
          createEvent("link-failed", "watcher.linkFailed", "watcher.linkFailedDetail", 0, "blocked"),
        ],
      })),

      reuseMinimumProof: () => set({
        stage: "club",
        authorizationReuseAttempted: true,
      }),

      completeClub: (minimum) => set((state) => {
        if (minimum) {
          return {
            stage: "results",
            clubUsedMinimumDisclosure: true,
            currentInteraction: "results",
            disclosures: addUnique(state.disclosures, [
              createPredicateDisclosure("ageOver18", "club"),
              createPredicateDisclosure("validTicket", "club"),
            ]),
            completedMissions: [...new Set([...state.completedMissions, "club"])],
            watcherEvents: [
              ...state.watcherEvents,
              createEvent("club-minimum", "watcher.clubReduced", "watcher.clubReducedDetail", 0, "blocked"),
            ],
          };
        }

        return {
          stage: "results",
          profileCompleteness: clampScore(state.profileCompleteness + 29),
          clubUsedMinimumDisclosure: false,
          currentInteraction: "results",
          disclosures: addUnique(state.disclosures, [
            createFieldDisclosure("name", "club"),
            createFieldDisclosure("birthDate", "club"),
            createFieldDisclosure("email", "club"),
            createFieldDisclosure("accountId", "club"),
          ]),
          correlations: addUnique(state.correlations, [
            { id: "account-club", from: "account", to: "club", reasonKey: "watcher.reasonClub" },
          ]),
          completedMissions: [...new Set([...state.completedMissions, "club"])],
          watcherEvents: [
            ...state.watcherEvents,
            createEvent("club-standard", "watcher.fullProfile", "watcher.fullProfileDetail", 29, "warning"),
          ],
        };
      }),

      showResults: () => set({ stage: "results", currentInteraction: "results" }),
      startAttackerMode: () => set({ stage: "attacker", currentInteraction: null }),
      setPaused: (paused) => set({ paused }),
      setMuted: (muted) => set({ muted }),
      setReducedMotion: (reducedMotion) => set({ reducedMotion }),
      resetExperience: () => set(initialSession),
    }),
    {
      name: "zity-session-v1",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        language: state.language,
        stage: state.stage,
        profileCompleteness: state.profileCompleteness,
        disclosures: state.disclosures,
        correlations: state.correlations,
        completedMissions: state.completedMissions,
        usedAuthorizations: state.usedAuthorizations,
        watcherEvents: state.watcherEvents,
        ticketPurchased: state.ticketPurchased,
        minimumDisclosureEnabled: state.minimumDisclosureEnabled,
        authorizationReuseAttempted: state.authorizationReuseAttempted,
        clubUsedMinimumDisclosure: state.clubUsedMinimumDisclosure,
        muted: state.muted,
        reducedMotion: state.reducedMotion,
        tutorialDismissed: state.tutorialDismissed,
      }),
    },
  ),
);

export const advancePresentationCheckpoint = (): void => {
  const state = useGameStore.getState();
  switch (state.stage) {
    case "spawn":
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
    case "minimum-disclosure":
      state.enableMinimumDisclosure();
      break;
    case "metro-proof":
      state.openInteraction("metro-proof-gate");
      state.useMinimumProof();
      break;
    case "metro-reuse":
      state.openInteraction("metro-reuse-gate");
      state.reuseMinimumProof();
      break;
    case "club":
      state.completeClub(true);
      break;
    case "results":
      state.startAttackerMode();
      break;
    case "attacker":
      state.resetExperience();
      break;
  }
};
