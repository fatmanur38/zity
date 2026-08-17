import { useMemo } from "react";
import { useI18n } from "../i18n/I18nProvider";
import type { TranslationKey } from "../i18n/en";
import { deriveProfile } from "../privacy/engine";
import { useGameStore } from "../stores/gameStore";
import type { StoryStage } from "../types/game";

type MobileWatcherBarProps = {
  onOpen: () => void;
  expanded?: boolean;
  controlsId?: string;
};

const baselineStages = new Set<StoryStage>([
  "spawn",
  "metro-ticket",
  "metro-gate",
  "cafe",
  "clinic",
  "perspective-shift",
]);

export function MobileWatcherBar({
  onOpen,
  expanded,
  controlsId = "watcher-sheet",
}: MobileWatcherBarProps) {
  const { t } = useI18n();
  const stage = useGameStore((state) => state.stage);
  const baselineRuns = useGameStore((state) => state.baselineRuns);
  const redesignedRuns = useGameStore((state) => state.redesignedRuns);
  const watcherEvents = useGameStore((state) => state.watcherEvents);
  const activeRuns = baselineStages.has(stage) ? baselineRuns : redesignedRuns;
  const profile = useMemo(() => deriveProfile(activeRuns), [activeRuns]);
  const score = profile.metrics.score;
  const latest = watcherEvents.at(-1);
  const latestLabel = latest
    ? t(latest.titleKey as TranslationKey)
    : t("game.noLinks");

  return (
    <button
      type="button"
      className="mobile-watcher-bar watcher-peek-bar"
      onClick={onOpen}
      aria-label={t("game.openWatcher")}
      aria-expanded={expanded}
      aria-controls={controlsId}
    >
      <span className="watcher-peek-bar__identity">
        <span className="eye-icon" aria-hidden="true" />
        <span className="watcher-peek-bar__copy">
          <strong>{t("game.watcher")}</strong>
          <small>{latestLabel}</small>
        </span>
      </span>
      <span className="watcher-peek-bar__signal" data-kind={latest?.kind ?? "neutral"}>
        <strong>{score}%</strong>
        <i aria-hidden="true" />
      </span>
    </button>
  );
}
