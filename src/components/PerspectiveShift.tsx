import { useMemo, useState } from "react";
import type { TranslationKey } from "../i18n/en";
import { useI18n } from "../i18n/I18nProvider";
import { useGameStore } from "../stores/gameStore";

type InsightId = "identity" | "links" | "inference";

const insights: Array<{
  id: InsightId;
  index: string;
  titleKey: TranslationKey;
  detailKey: TranslationKey;
}> = [
  {
    id: "identity",
    index: "01",
    titleKey: "analysis.identityTitle" as TranslationKey,
    detailKey: "analysis.identityDetail" as TranslationKey,
  },
  {
    id: "links",
    index: "02",
    titleKey: "analysis.linksTitle" as TranslationKey,
    detailKey: "analysis.linksDetail" as TranslationKey,
  },
  {
    id: "inference",
    index: "03",
    titleKey: "analysis.inferenceTitle" as TranslationKey,
    detailKey: "analysis.inferenceDetail" as TranslationKey,
  },
];

export function PerspectiveShift() {
  const { t } = useI18n();
  const stage = useGameStore((state) => state.stage);
  const beginRethink = useGameStore((state) => state.beginRethink);
  const [active, setActive] = useState<InsightId>("identity");
  const [visited, setVisited] = useState<Set<InsightId>>(() => new Set(["identity"]));

  const activeInsight = useMemo(
    () => insights.find((insight) => insight.id === active) ?? insights[0],
    [active],
  );

  if (stage !== "perspective-shift") return null;

  const inspect = (id: InsightId) => {
    setActive(id);
    setVisited((current) => new Set([...current, id]));
  };

  return (
    <div className="perspective-shift" role="dialog" aria-modal="true" aria-labelledby="perspective-title">
      <div className="analysis-grid" aria-hidden="true" />
      <section className="perspective-shell">
        <header className="perspective-heading">
          <div>
            <span className="eyebrow">{t("phase.analyze" as TranslationKey)}</span>
            <h2 id="perspective-title">{t("analysis.title" as TranslationKey)}</h2>
          </div>
          <span className="analysis-step">03 / 03</span>
        </header>

        <div className="perspective-copy">
          <p>{t("analysis.body1" as TranslationKey)}</p>
          <strong>{t("analysis.body2" as TranslationKey)}</strong>
        </div>

        <div className="perspective-workbench">
          <div className={`system-graph focus-${active}`} aria-label={t("analysis.graphAria" as TranslationKey)}>
            <svg viewBox="0 0 620 310" role="img">
              <title>{t("analysis.graphAria" as TranslationKey)}</title>
              <g className="system-edges">
                <path d="M310 84 L112 218" />
                <path d="M310 84 L244 238" />
                <path d="M310 84 L385 238" />
                <path d="M310 84 L510 218" />
              </g>
              <g className="system-account">
                <rect x="244" y="42" width="132" height="44" rx="4" />
                <text x="310" y="69" textAnchor="middle">A827</text>
              </g>
              <g className="system-service service-metro">
                <rect x="57" y="211" width="110" height="42" rx="4" />
                <text x="112" y="237" textAnchor="middle">{t("services.metro")}</text>
              </g>
              <g className="system-service service-cafe">
                <rect x="189" y="231" width="110" height="42" rx="4" />
                <text x="244" y="257" textAnchor="middle">{t("services.cafe")}</text>
              </g>
              <g className="system-service service-clinic">
                <rect x="330" y="231" width="110" height="42" rx="4" />
                <text x="385" y="257" textAnchor="middle">{t("services.clinic")}</text>
              </g>
              <g className="system-inference">
                <rect x="455" y="211" width="110" height="42" rx="4" />
                <text x="510" y="237" textAnchor="middle">?</text>
              </g>
            </svg>
            <span className="scan-line" />
          </div>

          <div className="insight-console">
            <span>{t("analysis.inspect" as TranslationKey)}</span>
            <div className="insight-tabs" role="tablist" aria-label={t("analysis.inspect" as TranslationKey)}>
              {insights.map((insight) => (
                <button
                  key={insight.id}
                  type="button"
                  role="tab"
                  aria-selected={active === insight.id}
                  className={`${active === insight.id ? "is-active" : ""} ${visited.has(insight.id) ? "is-visited" : ""}`}
                  onClick={() => inspect(insight.id)}
                >
                  <small>{insight.index}</small>
                  <strong>{t(insight.titleKey)}</strong>
                </button>
              ))}
            </div>
            <div className="insight-detail" role="tabpanel" key={activeInsight.id}>
              <span>{activeInsight.index}</span>
              <div>
                <strong>{t(activeInsight.titleKey)}</strong>
                <p>{t(activeInsight.detailKey)}</p>
              </div>
            </div>
          </div>
        </div>

        <footer className="perspective-footer">
          <p>{t("analysis.rethinkPrompt" as TranslationKey)}</p>
          <button type="button" className="button analysis-button" onClick={beginRethink}>
            {t("analysis.rethinkCta" as TranslationKey)} <span>→</span>
          </button>
        </footer>
      </section>
    </div>
  );
}
