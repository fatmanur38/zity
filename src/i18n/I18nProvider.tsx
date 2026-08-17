import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { en, type TranslationKey } from "./en";
import { tr } from "./tr";
import { useGameStore } from "../stores/gameStore";

type I18nContextValue = {
  language: "en" | "tr";
  t: (key: TranslationKey) => string;
  setLanguage: (language: "en" | "tr") => void;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const language = useGameStore((state) => state.language);
  const setLanguage = useGameStore((state) => state.setLanguage);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const value = useMemo<I18nContextValue>(() => ({
    language,
    setLanguage,
    t: (key) => (language === "tr" ? tr[key] : en[key]),
  }), [language, setLanguage]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used inside I18nProvider");
  return context;
}
