import { useI18n } from "../i18n/I18nProvider";
import type { TranslationKey } from "../i18n/en";
import { useGameStore } from "../stores/gameStore";
import { WatcherGraph } from "./WatcherGraph";

export function WatcherPanel({ sheet = false, onClose }: { sheet?: boolean; onClose?: () => void }) {
  const { t } = useI18n();
  const score = useGameStore((state) => state.profileCompleteness);
  const events = useGameStore((state) => state.watcherEvents);
  const correlations = useGameStore((state) => state.correlations);
  const latest = events.at(-1);

  return (
    <aside className={`watcher-panel ${sheet ? "is-sheet" : ""}`}>
      <div className="watcher-heading">
        <div>
          <span className="eyebrow">{t("common.simulation")}</span>
          <h2><span className="eye-icon" aria-hidden="true" />{t("game.watcher")}</h2>
        </div>
        {sheet && onClose && <button className="icon-button" onClick={onClose} aria-label={t("common.close")}>×</button>}
      </div>

      <div className="score-block">
        <div className="score-label"><span>{t("game.profile")}</span><strong>{score}%</strong></div>
        <div className="score-track"><span style={{ width: `${score}%` }} /></div>
      </div>

      <WatcherGraph />

      <div className="watcher-stats">
        <span>{t("watcher.links")}</span>
        <strong>{Math.max(0, correlations.filter((item) => item.from === "account").length - 1)}</strong>
      </div>

      {latest && (
        <div className={`watcher-event is-${latest.kind}`}>
          <div className="event-topline">
            <span>{t("watcher.latest")}</span>
            <b>{latest.delta > 0 ? `+${latest.delta}%` : "—"}</b>
          </div>
          <strong>{t(latest.titleKey as TranslationKey)}</strong>
          <p>{t(latest.detailKey as TranslationKey)}</p>
        </div>
      )}
    </aside>
  );
}
