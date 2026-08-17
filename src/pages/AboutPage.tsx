import { Link } from "react-router-dom";
import { SiteHeader } from "../components/SiteHeader";
import { useI18n } from "../i18n/I18nProvider";

export function AboutPage() {
  const { t } = useI18n();
  return (
    <div className="site-page info-page">
      <SiteHeader />
      <main className="info-main">
        <span className="eyebrow">ZITY / {t("nav.about")}</span>
        <h1>{t("about.title")}</h1>
        <p className="info-lead">{t("about.lead")}</p>
        <div className="info-grid">
          <article><span>01</span><h2>{t("about.whatTitle")}</h2><p>{t("about.whatBody")}</p></article>
          <article><span>02</span><h2>{t("about.notTitle")}</h2><p>{t("about.notBody")}</p></article>
        </div>
        <blockquote>{t("about.principle")}</blockquote>
        <Link to="/demo" className="button primary large">{t("landing.start")} →</Link>
      </main>
    </div>
  );
}
