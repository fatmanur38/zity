import type { TranslationKey } from "../i18n/en";
import { useI18n } from "../i18n/I18nProvider";
import { useGameStore } from "../stores/gameStore";

export function ObjectiveBar() {
  const stage = useGameStore((state) => state.stage);
  const { t } = useI18n();
  const key = `objectives.${stage}` as TranslationKey;

  return (
    <div className="objective-bar">
      <span>{t("game.objective")}</span>
      <strong>{t(key)}</strong>
    </div>
  );
}
