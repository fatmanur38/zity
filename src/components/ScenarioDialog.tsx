import { useEffect, useMemo, useRef, useState } from "react";
import type { TranslationKey } from "../i18n/en";
import { useI18n } from "../i18n/I18nProvider";
import { scenarioRegistry } from "../privacy/scenarios";
import { useGameStore } from "../stores/gameStore";
import type { DesignChoice, RethinkScenarioId } from "../types/game";
import { DialogShell } from "./DialogShell";

const choices: DesignChoice[] = ["standard", "hybrid", "minimum"];
const key = (value: string): TranslationKey => value as TranslationKey;

function linkTone(choice: DesignChoice): "linked" | "partial" | "isolated" {
  if (choice === "minimum") return "isolated";
  if (choice === "hybrid") return "partial";
  return "linked";
}

export function ScenarioDialog({ scenarioId }: { scenarioId: RethinkScenarioId }) {
  const { t } = useI18n();
  const close = useGameStore((state) => state.closeInteraction);
  const selectDesign = useGameStore((state) => state.selectDesign);
  const [selected, setSelected] = useState<DesignChoice | null>(null);
  const timer = useRef<number | null>(null);
  const definition = scenarioRegistry[scenarioId];
  const options = useMemo(
    () => choices.map((choice) => definition.options[choice]).filter((option) => option != null),
    [definition],
  );

  useEffect(() => () => {
    if (timer.current != null) window.clearTimeout(timer.current);
  }, []);

  const choose = (choice: DesignChoice) => {
    if (selected) return;
    setSelected(choice);
    timer.current = window.setTimeout(() => selectDesign(scenarioId, choice), 720);
  };

  return (
    <DialogShell
      eyebrow={t("phase.rethink")}
      title={t(key(`scenario.${scenarioId}.title`))}
      onClose={close}
      actions={<span className="scenario-authorization-note">✓ {t("scenario.authorized")}</span>}
      wide
    >
      <p>{t(key(`scenario.${scenarioId}.prompt`))}</p>
      <div className="scenario-context">
        <div>
          <small>{t("scenario.requirement")}</small>
          <strong>{definition.requirementKeys.map((requirement) => t(key(requirement))).join(" · ")}</strong>
        </div>
        <span className="requirement-status">{t("scenario.authorized")}</span>
      </div>
      <div className="choice-grid three-way" role="group" aria-label={t("scenario.reveals")}>
        {options.map((option, index) => {
          const tone = linkTone(option.choice);
          return (
            <button
              key={option.choice}
              type="button"
              className="choice-card"
              data-tone={tone}
              data-selected={selected === option.choice ? "true" : "false"}
              disabled={selected != null}
              onClick={() => choose(option.choice)}
            >
              <span className="choice-index">0{index + 1}</span>
              <small>{t(key(`scenario.choice.${option.choice}`))}</small>
              <b>{t(key(option.titleKey))}</b>
              <span className="choice-copy">{t(key(option.bodyKey))}</span>
              <span className="choice-link-state">{t(key(`scenario.${tone}`))}</span>
              <span className="choice-reveals">
                {option.revealsKeys.map((revealed) => <span key={revealed}>+ {t(key(revealed))}</span>)}
              </span>
            </button>
          );
        })}
      </div>
      {selected && (
        <div className="simulation-strip" role="status" aria-live="polite">
          <i aria-hidden="true" />
          {t("scenario.simulating")}
        </div>
      )}
    </DialogShell>
  );
}
