import { SiteHeader } from "../components/SiteHeader";
import { useI18n } from "../i18n/I18nProvider";

export function ArchitecturePage() {
  const { t } = useI18n();
  const layers = [
    ["01", "architecture.world"],
    ["02", "architecture.interaction"],
    ["03", "architecture.privacy"],
    ["04", "architecture.authorization"],
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
          <div className="stack-brand">ZITY</div>
          {layers.map(([number, key]) => <div className="stack-layer" key={key}><span>{number}</span><strong>{t(key)}</strong></div>)}
          <div className="stack-layer settlement-layer"><span>05</span><strong>{t("architecture.settlement")}</strong><div><b>{t("architecture.mock")}</b><b>{t("architecture.zcash")}</b></div></div>
        </div>
        <section className="zcash-note">
          <span className="rail-mark">Z</span><div><h2>{t("architecture.zcash")}</h2><p>{t("architecture.zcashBody")}</p></div>
        </section>
        <div className="architecture-notes">
          <article><span>01</span><h3>{t("architecture.boundaryTitle")}</h3><p>{t("architecture.boundaryBody")}</p></article>
          <article><span>02</span><h3>{t("architecture.flowTitle")}</h3><p className="code-flow">{t("architecture.flow")}</p></article>
          <article><span>03</span><h3>{t("architecture.dataTitle")}</h3><p>{t("architecture.data")}</p></article>
          <article><span>04</span><h3>{t("architecture.metricTitle")}</h3><p>{t("architecture.metric")}</p></article>
        </div>
      </main>
    </div>
  );
}
