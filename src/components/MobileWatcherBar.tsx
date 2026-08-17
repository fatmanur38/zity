import { useI18n } from "../i18n/I18nProvider";
import { useGameStore } from "../stores/gameStore";

export function MobileWatcherBar({ onOpen }: { onOpen: () => void }) {
  const { t } = useI18n();
  const score = useGameStore((state) => state.profileCompleteness);
  return (
    <button type="button" className="mobile-watcher-bar" onClick={onOpen} aria-label={t("game.openWatcher")}>
      <span><span className="eye-icon" aria-hidden="true" />{t("game.watcher")}</span>
      <span className="mini-score-track"><i style={{ width: `${score}%` }} /></span>
      <strong>{score}%</strong>
    </button>
  );
}
