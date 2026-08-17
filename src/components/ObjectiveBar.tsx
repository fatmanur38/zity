import { useEffect, useRef, useState } from "react";
import { playObjectiveTransitionSound } from "../audio/uiSounds";
import type { TranslationKey } from "../i18n/en";
import { useI18n } from "../i18n/I18nProvider";
import { useGameStore } from "../stores/gameStore";

type ObjectivePhase = "live" | "analyze" | "rethink" | "compare";
type TrackerState = "new" | "complete" | "compact";

type ObjectiveMeta = {
  phase: ObjectivePhase;
  icon: "arrival" | "transit" | "service" | "analysis" | "design" | "compare" | "control";
};

const objectiveMeta: Record<string, ObjectiveMeta> = {
  spawn: { phase: "live", icon: "arrival" },
  "metro-ticket": { phase: "live", icon: "transit" },
  "metro-gate": { phase: "live", icon: "transit" },
  cafe: { phase: "live", icon: "service" },
  clinic: { phase: "live", icon: "service" },
  "perspective-shift": { phase: "analyze", icon: "analysis" },
  "clinic-rethink": { phase: "rethink", icon: "design" },
  "clinic-compare": { phase: "compare", icon: "compare" },
  "metro-rethink": { phase: "rethink", icon: "design" },
  "metro-checkpoint": { phase: "rethink", icon: "control" },
  "metro-compare": { phase: "compare", icon: "compare" },
  "metro-reuse": { phase: "analyze", icon: "control" },
  club: { phase: "rethink", icon: "design" },
  "club-compare": { phase: "compare", icon: "compare" },
  results: { phase: "compare", icon: "compare" },
};

const phases: ObjectivePhase[] = ["live", "analyze", "rethink", "compare"];

const objectiveStatusKeys: Record<TrackerState, string> = {
  new: "objective.new",
  complete: "objective.complete",
  compact: "game.objective",
};

const translationKey = (key: string) => key as TranslationKey;

export function ObjectiveBar() {
  const stage = useGameStore((state) => state.stage);
  const { t } = useI18n();
  const [displayedStage, setDisplayedStage] = useState<string>(stage);
  const [trackerState, setTrackerState] = useState<TrackerState>("new");
  const previousStage = useRef<string>(stage);
  const isFirstAnnouncement = useRef(true);

  useEffect(() => {
    const timers: number[] = [];

    if (isFirstAnnouncement.current) {
      isFirstAnnouncement.current = false;
      setDisplayedStage(stage);
      setTrackerState("new");
      timers.push(window.setTimeout(() => setTrackerState("compact"), 1350));
    } else if (previousStage.current !== stage) {
      if (!useGameStore.getState().muted) playObjectiveTransitionSound();
      setTrackerState("complete");
      timers.push(window.setTimeout(() => {
        setDisplayedStage(stage);
        setTrackerState("new");
      }, 430));
      timers.push(window.setTimeout(() => setTrackerState("compact"), 1780));
    } else {
      // React StrictMode replays mount effects; keep the initial collapse timer alive.
      timers.push(window.setTimeout(() => setTrackerState("compact"), 1350));
    }

    previousStage.current = stage;
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [stage]);

  const meta = objectiveMeta[displayedStage] ?? objectiveMeta.spawn;
  const phaseIndex = phases.indexOf(meta.phase);
  const objectiveKey = translationKey(`objectives.${displayedStage}`);
  const phaseKey = translationKey(`objective.phase.${meta.phase}`);
  const statusKey = translationKey(objectiveStatusKeys[trackerState]);

  return (
    <section
      className="objective-tracker"
      data-state={trackerState}
      data-phase={meta.phase}
      aria-labelledby="active-objective-title"
    >
      <div className="objective-tracker__icon" data-icon={meta.icon} aria-hidden="true">
        <span />
      </div>

      <div className="objective-tracker__content">
        <div className="objective-tracker__topline">
          <span className="objective-tracker__status">{t(statusKey)}</span>
          <span className="objective-tracker__phase">{t(phaseKey)}</span>
        </div>
        <strong id="active-objective-title" className="objective-tracker__title">
          {t(objectiveKey)}
        </strong>
      </div>

      <div
        className="objective-tracker__milestones"
        aria-label={t(translationKey("objective.progress"))}
      >
        {phases.map((phase, index) => (
          <span
            key={phase}
            className="objective-tracker__milestone"
            data-state={index < phaseIndex ? "complete" : index === phaseIndex ? "active" : "upcoming"}
            title={t(translationKey(`objective.phase.${phase}`))}
          />
        ))}
      </div>

      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {t(statusKey)}: {t(objectiveKey)}. {t(phaseKey)}.
      </span>
    </section>
  );
}
