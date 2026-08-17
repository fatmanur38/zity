import { SiteHeader } from "../components/SiteHeader";
import { useI18n } from "../i18n/I18nProvider";

export function ArchitecturePage() {
  const { t } = useI18n();
  const layers = [
    ["02", "architecture.experience"],
    ["03", "architecture.privacy"],
    ["04", "architecture.authorization"],
    ["05", "architecture.settlement"],
    ["06", "architecture.gateway"],
    ["07", "architecture.currentStack"],
    ["08", "architecture.testnetNetwork"],
  ] as const;
  return (
    <div className="site-page architecture-page">
      <SiteHeader />
      <main className="architecture-main">
        <div className="architecture-intro">
          <span className="eyebrow">{t("architecture.eyebrow")}</span>
          <h1>{t("architecture.title")}</h1>
          <p>{t("architecture.lead")}</p>
        </div>
        <div className="architecture-stack">
          <div className="stack-brand">01 · {t("architecture.user")}</div>
          {layers.map(([number, key]) => <div className="stack-layer" key={key}><span>{number}</span><strong>{t(key)}</strong></div>)}
        </div>
        <section className="zcash-note">
          <span className="rail-mark">Z</span><div><h2>{t("architecture.zcash")}</h2><p>{t("architecture.zcashBody")}</p></div>
        </section>
        <div className="architecture-notes">
          <article><span>01</span><h3>{t("architecture.applicationPrivacyTitle")}</h3><p>{t("architecture.applicationPrivacyBody")}</p></article>
          <article><span>02</span><h3>{t("architecture.settlementPrivacyTitle")}</h3><p>{t("architecture.settlementPrivacyBody")}</p></article>
          <article><span>03</span><h3>{t("architecture.boundaryTitle")}</h3><p>{t("architecture.boundaryBody")}</p></article>
          <article><span>04</span><h3>{t("architecture.flowTitle")}</h3><p className="code-flow">{t("architecture.flow")}</p></article>
          <article><span>05</span><h3>{t("architecture.dataTitle")}</h3><p>{t("architecture.data")}</p></article>
          <article><span>06</span><h3>{t("architecture.limitationsTitle")}</h3><p>{t("architecture.limitationsBody")}</p></article>
        </div>
      </main>
    </div>
  );
}
