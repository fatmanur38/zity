import { useI18n } from "../i18n/I18nProvider";
import { useGameStore } from "../stores/gameStore";
import { LanguageSwitcher } from "./LanguageSwitcher";

export function PauseMenu() {
  const { t } = useI18n();
  const paused = useGameStore((state) => state.paused);
  const muted = useGameStore((state) => state.muted);
  const reducedMotion = useGameStore((state) => state.reducedMotion);
  const setPaused = useGameStore((state) => state.setPaused);
  const setMuted = useGameStore((state) => state.setMuted);
  const setReducedMotion = useGameStore((state) => state.setReducedMotion);
  const reset = useGameStore((state) => state.resetExperience);

  if (!paused) return null;

  return (
    <div className="overlay-backdrop overlay-top" role="dialog" aria-modal="true" aria-label={t("pause.title")}>
      <div className="dialog-card pause-card">
        <span className="eyebrow">ZITY</span>
        <h2>{t("pause.title")}</h2>
        <div className="setting-row"><span>{t("pause.language")}</span><LanguageSwitcher /></div>
        <button className="setting-row" onClick={() => setMuted(!muted)}><span>{t("pause.sound")}</span><b>{muted ? t("common.mute") : t("common.unmute")}</b></button>
        <button className="setting-row" onClick={() => setReducedMotion(!reducedMotion)}><span>{t("pause.motion")}</span><b>{reducedMotion ? t("common.yes") : "—"}</b></button>
        <div className="dialog-actions">
          <button className="button primary" onClick={() => setPaused(false)}>{t("common.resume")}</button>
          <button className="button ghost" onClick={() => { reset(); setPaused(false); }}>{t("common.reset")}</button>
        </div>
      </div>
    </div>
  );
}
