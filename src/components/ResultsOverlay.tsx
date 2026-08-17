import { useMemo } from "react";
import { Link } from "react-router-dom";
import type { TranslationKey } from "../i18n/en";
import { useI18n } from "../i18n/I18nProvider";
import { scenarioRegistry } from "../privacy/scenarios";
import { compareProfiles, deriveProfile } from "../privacy/engine";
import {
  selectMetroPayment,
  useGameStore,
} from "../stores/gameStore";
import type { Disclosure, ExposureProfile } from "../types/game";
import { selectFreshestMetroTransaction } from "../testnet/controllerPolicy";
import { RealNetworkProof } from "./TestnetUi";

const key = (value: string): TranslationKey => value as TranslationKey;

function disclosureKey(disclosure: Disclosure): TranslationKey {
  return key(disclosure.kind === "field"
    ? `privacy.field.${disclosure.field}`
    : `privacy.predicate.${disclosure.predicate}`);
}

function uniqueDisclosureKeys(profile: ExposureProfile): TranslationKey[] {
  return [...new Set(profile.disclosures.map(disclosureKey))];
}

export function ResultsOverlay() {
  const { t } = useI18n();
  const stage = useGameStore((state) => state.stage);
  const baselineRuns = useGameStore((state) => state.baselineRuns);
  const redesignedRuns = useGameStore((state) => state.redesignedRuns);
  const baseline = useMemo(() => deriveProfile(baselineRuns), [baselineRuns]);
  const redesigned = useMemo(() => deriveProfile(redesignedRuns), [redesignedRuns]);
  const comparison = useMemo(
    () => compareProfiles(baselineRuns, redesignedRuns),
    [baselineRuns, redesignedRuns],
  );
  const networkMode = useGameStore((state) => state.networkMode);
  const metroPayment = useGameStore(selectMetroPayment);
  const reset = useGameStore((state) => state.resetExperience);
  if (stage !== "results") return null;

  const requirementKeys = [...new Set(
    Object.values(scenarioRegistry).flatMap((scenario) => scenario.requirementKeys),
  )].map(key);

  const renderCity = (profile: ExposureProfile, redesignedCity: boolean) => {
    const disclosures = uniqueDisclosureKeys(profile);
    return (
      <article className={`result-city ${redesignedCity ? "is-redesigned" : ""}`}>
        <span className="eyebrow">{redesignedCity ? t("compare.redesigned") : t("compare.standard")}</span>
        <h3>{redesignedCity ? t("results.redesignedCity") : t("results.standardCity")}</h3>
        <div className="result-section">
          <span>{t("results.actualNeeds")}</span>
          <ul>{requirementKeys.map((requirement) => <li key={requirement}>{t(requirement)}</li>)}</ul>
        </div>
        <div className="result-section">
          <span>{t("results.revealed")}</span>
          <ul>{disclosures.map((disclosure) => <li key={disclosure}>{t(disclosure)}</li>)}</ul>
        </div>
        <div className="result-section">
          <span>{t("results.linkable")}</span>
          <ul>
            {profile.crossServiceLinks.length > 0
              ? profile.crossServiceLinks.map((link) => (
                <li key={link.id}>{t(key(`services.${link.services[0]}`))} ↔ {t(key(`services.${link.services[1]}`))}</li>
              ))
              : <li>{t("results.unavailable")}</li>}
          </ul>
        </div>
        <div className="result-section">
          <span>{t("results.inferences")}</span>
          <ul>
            {profile.inferences.length > 0
              ? profile.inferences.map((inference) => <li key={inference.id}>{t(key(inference.titleKey))}</li>)
              : <li>{t("watcher.noInference")}</li>}
          </ul>
        </div>
      </article>
    );
  };

  return (
    <div className="overlay-backdrop results-backdrop" role="dialog" aria-modal="true" aria-labelledby="results-title">
      <section className="results-card redesigned-results">
        <div className="results-copy">
          <span className="eyebrow">{t("phase.compare")}</span>
          <h2 id="results-title">{t("results.compareTitle")}</h2>
          <p className="results-lead">{t("results.compareLead")}</p>
        </div>

        <div className="results-comparison">
          {renderCity(baseline, false)}
          {renderCity(redesigned, true)}
        </div>

        <div className="supporting-metrics" aria-label={t("results.exposureMetric")}>
          <div><strong>{baseline.metrics.score} → {redesigned.metrics.score}</strong><span>{t("results.exposureMetric")}</span></div>
          <div><strong>{comparison.removedDisclosureIds.length}</strong><span>{t("results.disclosuresRemoved")}</span></div>
          <div><strong>{comparison.removedAccountEdgeIds.length}</strong><span>{t("results.edgesRemoved")}</span></div>
          <div><strong>{comparison.removedInferenceIds.length}</strong><span>{t("results.inferencesRemoved")}</span></div>
        </div>

        <RealNetworkProof
          mode={networkMode}
          paymentState={metroPayment.state}
          transaction={selectFreshestMetroTransaction(metroPayment)}
        />

        <blockquote>{t("results.final")}</blockquote>
        <div className="dialog-actions result-actions">
          <Link className="button ghost" to="/architecture">{t("results.architecture")}</Link>
          <button className="button primary" onClick={reset}>{t("results.replay")}</button>
        </div>
      </section>
    </div>
  );
}
