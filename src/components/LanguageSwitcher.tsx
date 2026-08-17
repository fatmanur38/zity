import { useI18n } from "../i18n/I18nProvider";

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { language, setLanguage, t } = useI18n();

  return (
    <div className={`language-switcher ${compact ? "is-compact" : ""}`} aria-label={t("pause.language")}>
      <button
        type="button"
        className={language === "en" ? "is-active" : ""}
        onClick={() => setLanguage("en")}
        aria-pressed={language === "en"}
      >
        EN
      </button>
      <span aria-hidden="true">/</span>
      <button
        type="button"
        className={language === "tr" ? "is-active" : ""}
        onClick={() => setLanguage("tr")}
        aria-pressed={language === "tr"}
      >
        TR
      </button>
    </div>
  );
}
