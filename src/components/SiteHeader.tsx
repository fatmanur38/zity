import { Link, NavLink } from "react-router-dom";
import { useI18n } from "../i18n/I18nProvider";
import { LanguageSwitcher } from "./LanguageSwitcher";

export function SiteHeader() {
  const { t } = useI18n();
  return (
    <header className="site-header">
      <Link to="/" className="wordmark" aria-label="ZITY">
        <span className="wordmark-eye" aria-hidden="true" />
        ZITY
      </Link>
      <nav className="site-nav">
        <NavLink to="/demo">{t("nav.demo")}</NavLink>
        <NavLink to="/about">{t("nav.about")}</NavLink>
        <NavLink to="/architecture">{t("nav.architecture")}</NavLink>
      </nav>
      <LanguageSwitcher compact />
    </header>
  );
}
