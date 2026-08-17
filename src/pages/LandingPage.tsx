import { Link } from "react-router-dom";
import type { TranslationKey } from "../i18n/en";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { SiteHeader } from "../components/SiteHeader";
import { useI18n } from "../i18n/I18nProvider";

export function LandingPage() {
  const { t } = useI18n();
  return (
    <div className="site-page landing-page">
      <SiteHeader />
      <main>
        <section className="landing-hero">
          <div className="hero-copy">
            <span className="eyebrow"><i className="live-dot" />{t("landing.eyebrow")}</span>
            <h1>{t("landing.title")}</h1>
            <p>{t("landing.subtitle")}</p>
            <div className="mode-actions">
              <Link className="mode-card is-primary" to="/demo">
                <strong>{t("landing.start")}<span aria-hidden="true">→</span></strong>
                <small>{t("landing.startNote")}</small>
              </Link>
              <Link className="mode-card" to="/demo?network=testnet">
                <strong>{t("landing.startTestnet")}<span aria-hidden="true">→</span></strong>
                <small>{t("landing.startTestnetNote")}</small>
              </Link>
            </div>
            <div className="hero-actions">
              <a className="button ghost" href="#how">{t("landing.how")}</a>
            </div>
            <div className="trust-line"><span>✓ {t("landing.noSignup")}</span><span>◷ {t("landing.duration")}</span></div>
          </div>
          <div className="hero-visual" aria-hidden="true">
            <div className="city-window">
              <div className="pixel-sky"><span>ZITY / 08:42</span></div>
              <div className="pixel-buildings"><i /><i /><i /><i /></div>
              <div className="pixel-road"><span className="pixel-person" /><span className="pixel-marker">!</span></div>
              <div className="watcher-peek"><span className="eye-icon" /><b>{t("phase.analyze")}</b><div><i style={{ width: "66%" }} /></div><strong>3×</strong></div>
            </div>
            <span className="visual-label label-one">{t("landing.visualLive")}</span>
            <span className="visual-label label-two">{t("landing.visualRethink")}</span>
          </div>
        </section>

        <section className="how-section" id="how">
          <span className="eyebrow">ZITY / 01</span>
          <h2>{t("landing.question")}</h2>
          <div className="steps-grid">
            {([1, 2, 3] as const).map((step) => (
              <article key={step}><span>0{step}</span><h3>{t(`landing.step${step}Title` as TranslationKey)}</h3><p>{t(`landing.step${step}Body` as TranslationKey)}</p></article>
            ))}
          </div>
        </section>
      </main>
      <footer className="site-footer"><span>ZITY © 2026</span><p>{t("footer.note")}</p><LanguageSwitcher compact /></footer>
    </div>
  );
}
