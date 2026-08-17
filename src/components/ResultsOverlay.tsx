import { useI18n } from "../i18n/I18nProvider";
import { useGameStore } from "../stores/gameStore";

export function ResultsOverlay() {
  const { t } = useI18n();
  const stage = useGameStore((state) => state.stage);
  const score = useGameStore((state) => state.profileCompleteness);
  const correlations = useGameStore((state) => state.correlations);
  const disclosures = useGameStore((state) => state.disclosures);
  const startAttacker = useGameStore((state) => state.startAttackerMode);
  const reset = useGameStore((state) => state.resetExperience);
  if (stage !== "results") return null;

  const persistent = new Set(disclosures.filter((item) => item.persistent).map((item) => item.field)).size;
  const minimumCount = disclosures.filter((item) => item.predicate && item.serviceId !== "payment").length;
  const crossLinks = Math.max(0, correlations.filter((item) => item.from === "account").length - 1);

  return (
    <div className="overlay-backdrop results-backdrop" role="dialog" aria-modal="true" aria-label={t("results.title")}>
      <section className="results-card">
        <div className="results-copy">
          <span className="eyebrow">{t("results.question")}</span>
          <h2>{t("results.title")}</h2>
          <div className="result-score"><strong>{score}%</strong><span>{t("game.profile")}</span></div>
          <div className="result-stats">
            <div><strong>{crossLinks}</strong><span>{t("watcher.links")}</span></div>
            <div><strong>{persistent}</strong><span>{t("results.identifiers")}</span></div>
            <div><strong>{minimumCount}</strong><span>{t("results.minimum")}</span></div>
          </div>
        </div>
        <div className="architecture-compare">
          <div className="compare-card standard-card"><small>{t("results.standard")}</small><b>{t("results.identity")}</b><i /><b>{t("results.account")}</b><div className="service-row"><span>{t("services.metro")}</span><span>{t("services.cafe")}</span><span>{t("services.clinic")}</span></div></div>
          <div className="compare-card minimum-card"><small>{t("results.minimumDisclosure")}</small><div className="proof-row"><b>M91</b><span>→</span><span>{t("services.metro")}</span></div><div className="proof-row"><b>C18</b><span>→</span><span>{t("services.club")}</span></div><p>{t("results.unavailable")}</p></div>
        </div>
        <blockquote>{t("results.final")}</blockquote>
        <div className="dialog-actions result-actions">
          <button className="button primary" onClick={startAttacker}>{t("results.attacker")}</button>
          <button className="button ghost" onClick={reset}>{t("results.replay")}</button>
        </div>
      </section>
    </div>
  );
}
