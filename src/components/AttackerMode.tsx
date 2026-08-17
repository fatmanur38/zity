import { useState } from "react";
import type { TranslationKey } from "../i18n/en";
import { useI18n } from "../i18n/I18nProvider";
import { useGameStore } from "../stores/gameStore";

type RecordSet = "standard" | "private";

export function AttackerMode() {
  const { t } = useI18n();
  const stage = useGameStore((state) => state.stage);
  const showResults = useGameStore((state) => state.showResults);
  const [selected, setSelected] = useState<RecordSet>("standard");
  const [matched, setMatched] = useState<RecordSet | null>(null);
  if (stage !== "attacker") return null;

  const isStandard = selected === "standard";
  return (
    <div className="attacker-overlay">
      <div className="attacker-header"><span className="eye-icon" /><div><span className="eyebrow">{t("results.attacker")}</span><h2>{t("attacker.title")}</h2></div></div>
      <p>{t("attacker.body")}</p>
      <div className="record-tabs">
        <button className={isStandard ? "is-active" : ""} onClick={() => { setSelected("standard"); setMatched(null); }}>{t("attacker.standard")}</button>
        <button className={!isStandard ? "is-active" : ""} onClick={() => { setSelected("private"); setMatched(null); }}>{t("attacker.private")}</button>
      </div>
      <div className="records-board">
        {(isStandard
          ? ["attacker.metroAccount", "attacker.cafeAccount", "attacker.clinicAccount"]
          : ["attacker.metroAuth", "attacker.clubAuth", "attacker.accountUnavailable"]
        ).map((key) => <div className="record" key={key}><span className="record-dot" />{t(key as TranslationKey)}</div>)}
        <button className="match-button" onClick={() => setMatched(selected)}>{t("attacker.match")}</button>
      </div>
      {matched && (
        <div className={`match-result ${matched === "standard" ? "is-success" : "is-blocked"}`}>
          <strong>{matched === "standard" ? t("attacker.success") : t("attacker.insufficient")}</strong>
          <p>{matched === "standard" ? t("attacker.successBody") : t("attacker.insufficientBody")}</p>
        </div>
      )}
      <button className="button ghost attacker-finish" onClick={showResults}>{t("attacker.finish")}</button>
    </div>
  );
}
