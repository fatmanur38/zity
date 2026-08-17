import { useMemo } from "react";
import type { TranslationKey } from "../i18n/en";
import { useI18n } from "../i18n/I18nProvider";
import { compareProfiles } from "../privacy/engine";
import { scenarioRegistry } from "../privacy/scenarios";
import { useGameStore } from "../stores/gameStore";
import type { RethinkScenarioId, StoryStage } from "../types/game";

const compareStages: Partial<Record<StoryStage, RethinkScenarioId>> = {
  "clinic-compare": "clinic",
  "metro-compare": "metro",
  "club-compare": "club",
};

const key = (value: string): TranslationKey => value as TranslationKey;

export function ScenarioCompare() {
  const { t } = useI18n();
  const stage = useGameStore((state) => state.stage);
  const choices = useGameStore((state) => state.designChoices);
  const baselineRuns = useGameStore((state) => state.baselineRuns);
  const redesignedRuns = useGameStore((state) => state.redesignedRuns);
  const comparison = useMemo(
    () => compareProfiles(baselineRuns, redesignedRuns),
    [baselineRuns, redesignedRuns],
  );
  const continueComparison = useGameStore((state) => state.continueComparison);
  const scenarioId = compareStages[stage];

  if (!scenarioId) return null;
  const choice = choices[scenarioId];
  const definition = scenarioRegistry[scenarioId];
  const standard = definition.options.standard;
  const redesigned = choice ? definition.options[choice] : undefined;
  if (!standard || !redesigned) return null;

  return (
    <div className="overlay-backdrop compare-backdrop" role="dialog" aria-modal="true" aria-labelledby="compare-title">
      <section className="compare-shell">
        <header className="compare-heading">
          <div>
            <span className="eyebrow">{t("compare.eyebrow")}</span>
            <h2 id="compare-title">{t("compare.title")}</h2>
          </div>
          <span className="compare-score-delta">
            {comparison.scoreReduction > 0 ? `−${comparison.scoreReduction}` : "±0"}
          </span>
        </header>

        <div className="scenario-context">
          <div>
            <small>{t("compare.needed")}</small>
            <strong>{definition.requirementKeys.map((requirement) => t(key(requirement))).join(" · ")}</strong>
          </div>
          <span className="requirement-status">✓ {t("scenario.authorized")}</span>
        </div>

        <div className="compare-matrix">
          <article className="comparison-track">
            <span className="compare-label">{t("compare.standard")}</span>
            <h3>{t(key(standard.titleKey))}</h3>
            <ul className="comparison-list">
              {standard.revealsKeys.map((revealed) => <li key={revealed}>{t(key(revealed))}</li>)}
            </ul>
          </article>
          <article className="comparison-track is-redesigned">
            <span className="compare-label">{t("compare.redesigned")}</span>
            <h3>{t(key(redesigned.titleKey))}</h3>
            <ul className="comparison-list">
              {redesigned.revealsKeys.map((revealed) => <li key={revealed}>{t(key(revealed))}</li>)}
            </ul>
          </article>
        </div>

        <div className="change-summary">
          <div><strong>{comparison.removedDisclosureIds.length}</strong><span>{t("compare.removedDisclosures")}</span></div>
          <div><strong>{comparison.removedAccountEdgeIds.length}</strong><span>{t("compare.removedEdges")}</span></div>
          <div><strong>{comparison.removedInferenceIds.length}</strong><span>{t("compare.removedInferences")}</span></div>
        </div>

        <p className="compare-explanation">
          {comparison.scoreReduction > 0 ? t(key(redesigned.outcomeDetailKey)) : t("compare.noReduction")}
        </p>

        <div className="dialog-actions result-actions">
          <button type="button" className="button analysis-button" onClick={continueComparison}>
            {t("compare.continue")} <span>→</span>
          </button>
        </div>
      </section>
    </div>
  );
}
