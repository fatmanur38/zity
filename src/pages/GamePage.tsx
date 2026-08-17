import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { advancePresentationCheckpoint, useGameStore } from "../stores/gameStore";
import { useI18n } from "../i18n/I18nProvider";
import { AttackerMode } from "../components/AttackerMode";
import { GameCanvas } from "../components/GameCanvas";
import { InteractionModal } from "../components/InteractionModal";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { MobileWatcherBar } from "../components/MobileWatcherBar";
import { ObjectiveBar } from "../components/ObjectiveBar";
import { PauseMenu } from "../components/PauseMenu";
import { ResultsOverlay } from "../components/ResultsOverlay";
import { VirtualJoystick } from "../components/VirtualJoystick";
import { WatcherPanel } from "../components/WatcherPanel";

export function GamePage({ presentation = false }: { presentation?: boolean }) {
  const { t } = useI18n();
  const score = useGameStore((state) => state.profileCompleteness);
  const paused = useGameStore((state) => state.paused);
  const setPaused = useGameStore((state) => state.setPaused);
  const reset = useGameStore((state) => state.resetExperience);
  const stage = useGameStore((state) => state.stage);
  const openInteraction = useGameStore((state) => state.openInteraction);
  const [watcherOpen, setWatcherOpen] = useState(false);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPaused(!useGameStore.getState().paused);
      if (presentation && event.key.toLowerCase() === "r" && !event.shiftKey) reset();
      if (presentation && event.key.toLowerCase() === "n" && event.shiftKey) advancePresentationCheckpoint();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [presentation, reset, setPaused]);

  useEffect(() => {
    if (stage === "minimum-disclosure" && !useGameStore.getState().currentInteraction) {
      openInteraction("minimum-disclosure");
    }
    if (stage === "results" && !useGameStore.getState().currentInteraction) {
      openInteraction("results");
    }
  }, [openInteraction, stage]);

  return (
    <div className={`game-page ${presentation ? "is-presentation" : ""}`}>
      <header className="game-header">
        <Link to="/" className="wordmark"><span className="wordmark-eye" />ZITY</Link>
        {presentation && <span className="presentation-badge">{t("presentation.badge")}</span>}
        <div className="mobile-profile"><span>{t("game.profile")}</span><strong>{score}%</strong></div>
        <div className="game-header-actions"><LanguageSwitcher compact /><button className="icon-button menu-button" onClick={() => setPaused(!paused)} aria-label={t("game.menu")}>Ⅱ</button></div>
      </header>

      <ObjectiveBar />
      <main className="game-layout">
        <section className="world-column">
          <GameCanvas />
          <div className="control-hint"><span className="desktop-only">{t("game.controlsDesktop")}</span><span className="mobile-only">{t("game.controlsMobile")}</span></div>
          <VirtualJoystick />
        </section>
        <WatcherPanel />
      </main>
      <MobileWatcherBar onOpen={() => setWatcherOpen(true)} />

      {watcherOpen && <div className="sheet-backdrop" onClick={() => setWatcherOpen(false)}><div onClick={(event) => event.stopPropagation()}><WatcherPanel sheet onClose={() => setWatcherOpen(false)} /></div></div>}
      <InteractionModal />
      <ResultsOverlay />
      <AttackerMode />
      <PauseMenu />
    </div>
  );
}
