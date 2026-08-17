import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { GameCanvas } from "../components/GameCanvas";
import { InteractionModal } from "../components/InteractionModal";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { MobileWatcherBar } from "../components/MobileWatcherBar";
import { ObjectiveBar } from "../components/ObjectiveBar";
import { PauseMenu } from "../components/PauseMenu";
import { PerspectiveShift } from "../components/PerspectiveShift";
import { ResultsOverlay } from "../components/ResultsOverlay";
import { RotateDevice } from "../components/RotateDevice";
import { ScenarioCompare } from "../components/ScenarioCompare";
import {
  deriveHealthBadgeStatus,
  isRealTestnetReady,
  NetworkInspector,
  TestnetBadge,
} from "../components/TestnetUi";
import { VirtualJoystick } from "../components/VirtualJoystick";
import { WatcherPanel } from "../components/WatcherPanel";
import { useI18n } from "../i18n/I18nProvider";
import { deriveProfile } from "../privacy/engine";
import { advancePresentationCheckpoint, selectMetroPayment, useGameStore } from "../stores/gameStore";
import { resolveNetworkMode } from "../testnet/networkMode";
import { selectFreshestMetroTransaction } from "../testnet/controllerPolicy";
import { useMetroTestnetController } from "../testnet/useMetroTestnetController";
import type { StoryStage } from "../types/game";

const analysisStages = new Set([
  "perspective-shift",
  "clinic-compare",
  "metro-checkpoint",
  "metro-compare",
  "club-compare",
]);

const baselineStages = new Set<StoryStage>([
  "spawn",
  "metro-ticket",
  "metro-gate",
  "cafe",
  "clinic",
  "perspective-shift",
]);

export function GamePage({ presentation = false }: { presentation?: boolean }) {
  const { t } = useI18n();
  const location = useLocation();
  const stage = useGameStore((state) => state.stage);
  const baselineRuns = useGameStore((state) => state.baselineRuns);
  const redesignedRuns = useGameStore((state) => state.redesignedRuns);
  const activeRuns = baselineStages.has(stage) ? baselineRuns : redesignedRuns;
  const profile = useMemo(() => deriveProfile(activeRuns), [activeRuns]);
  const paused = useGameStore((state) => state.paused);
  const reducedMotion = useGameStore((state) => state.reducedMotion);
  const networkMode = useGameStore((state) => state.networkMode);
  const metroPayment = useGameStore(selectMetroPayment);
  const configureNetworkMode = useGameStore((state) => state.configureNetworkMode);
  const setPaused = useGameStore((state) => state.setPaused);
  const reset = useGameStore((state) => state.resetExperience);
  const [watcherOpen, setWatcherOpen] = useState(false);
  const [networkInspectorOpen, setNetworkInspectorOpen] = useState(false);
  const testnet = useMetroTestnetController({ active: stage === "metro-checkpoint" });
  const transaction = selectFreshestMetroTransaction(metroPayment);
  const badgeStatus = !isRealTestnetReady(testnet.health) || metroPayment.state === "not-created"
    ? deriveHealthBadgeStatus(testnet.health)
    : metroPayment.state;

  useEffect(() => {
    const requestedMode = resolveNetworkMode(presentation, location.search);
    if (useGameStore.getState().networkMode !== requestedMode) configureNetworkMode(requestedMode);
  }, [configureNetworkMode, location.search, presentation]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (networkInspectorOpen) setNetworkInspectorOpen(false);
        else if (watcherOpen) setWatcherOpen(false);
        else setPaused(!useGameStore.getState().paused);
      }
      if (presentation && event.key.toLowerCase() === "r" && !event.shiftKey) reset();
      if (presentation && event.key.toLowerCase() === "n" && event.shiftKey) advancePresentationCheckpoint();
      if (presentation && event.key.toLowerCase() === "h") {
        setNetworkInspectorOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [networkInspectorOpen, presentation, reset, setPaused, watcherOpen]);

  useEffect(() => {
    setWatcherOpen(false);
  }, [stage]);

  const analysisActive = analysisStages.has(stage);

  return (
    <div
      className={`game-page ${presentation ? "is-presentation" : ""}`}
      data-analysis={analysisActive ? "true" : "false"}
      data-reduced-motion={reducedMotion ? "true" : "false"}
    >
      <RotateDevice />
      <header className="game-header">
        <Link to="/" className="wordmark"><span className="wordmark-eye" />ZITY</Link>
        {presentation && <span className="presentation-badge">{t("presentation.badge")}</span>}
        {networkMode === "testnet" && (
          <button
            type="button"
            className="testnet-badge-button"
            onClick={() => setNetworkInspectorOpen(true)}
            aria-haspopup="dialog"
          >
            <TestnetBadge status={badgeStatus} />
          </button>
        )}
        <div className="mobile-profile"><span>{t("watcher.exposure")}</span><strong>{profile.metrics.score}</strong></div>
        <div className="game-header-actions">
          <LanguageSwitcher compact />
          <button className="icon-button menu-button" onClick={() => setPaused(!paused)} aria-label={t("game.menu")}>Ⅱ</button>
        </div>
      </header>

      <main className="game-layout">
        <section className="world-column">
          <GameCanvas />
          <ObjectiveBar />
          <div className="control-hint">
            <span className="desktop-only">{t("game.controlsDesktop")}</span>
            <span className="mobile-only">{t("game.controlsMobile")}</span>
          </div>
          <VirtualJoystick />
        </section>
        <WatcherPanel />
      </main>

      <MobileWatcherBar onOpen={() => setWatcherOpen(true)} expanded={watcherOpen} />

      {watcherOpen && (
        <div className="sheet-backdrop" onClick={() => setWatcherOpen(false)}>
          <div onClick={(event) => event.stopPropagation()}>
            <WatcherPanel sheet onClose={() => setWatcherOpen(false)} />
          </div>
        </div>
      )}

      {networkInspectorOpen && networkMode === "testnet" && (
        <div className="network-inspector-backdrop" onClick={() => setNetworkInspectorOpen(false)}>
          <aside
            className="network-inspector-popover"
            role="dialog"
            aria-modal="true"
            aria-label={t("testnet.inspectorTitle")}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="icon-button network-inspector-close"
              onClick={() => setNetworkInspectorOpen(false)}
              aria-label={t("common.close")}
            >×</button>
            <NetworkInspector
              mode={networkMode}
              health={testnet.health}
              paymentState={metroPayment.state}
              challenge={metroPayment.challenge}
              transaction={transaction}
              events={metroPayment.events}
              errorCode={metroPayment.status?.errorCode ?? testnet.errorCode}
              busy={testnet.busy}
              presentation={presentation}
              onRefresh={() => void testnet.health.refresh()}
              onReset={() => void testnet.reset()}
            />
          </aside>
        </div>
      )}

      <div className="experience-overlay-host">
        <InteractionModal testnet={testnet} presentation={presentation} />
        <PerspectiveShift />
        <ScenarioCompare />
        <ResultsOverlay />
        <PauseMenu />
      </div>
    </div>
  );
}
