import { useI18n } from "../i18n/I18nProvider";
import { useGameStore } from "../stores/gameStore";

const serviceNodeKeys = {
  metro: "watcher.node.metro",
  cafe: "watcher.node.cafe",
  clinic: "watcher.node.clinic",
  club: "watcher.node.club",
} as const;

export function WatcherGraph() {
  const { t } = useI18n();
  const correlations = useGameStore((state) => state.correlations);
  const hasAccount = correlations.some((item) => item.from === "account" || item.to === "account");
  const services = Object.entries(serviceNodeKeys).filter(([service]) =>
    correlations.some((item) => item.from === service || item.to === service),
  );
  const hasProof = useGameStore((state) => state.usedAuthorizations.length > 0);
  const clubMinimum = useGameStore((state) => state.clubUsedMinimumDisclosure === true);

  if (!hasAccount && !hasProof) {
    return (
      <div className="watcher-empty">
        <span className="watcher-scan" aria-hidden="true" />
        <strong>{t("game.unknownPerson")}</strong>
        <small>{t("game.noLinks")}</small>
      </div>
    );
  }

  return (
    <div className="watcher-graph">
      {hasAccount && <div className="graph-node account-node">{t("watcher.node.account")}</div>}
      {services.map(([service, key], index) => (
        <div className={`graph-branch branch-${index}`} key={service}>
          <span className="graph-line" />
          <div className="graph-node service-node">{t(key)}</div>
        </div>
      ))}
      {hasProof && (
        <div className="proof-island">
          <span className="broken-line">× · · ·</span>
          <div className="graph-node proof-node">{t("watcher.node.proof")}</div>
        </div>
      )}
      {clubMinimum && <div className="graph-node club-proof-node">{t("watcher.node.club")}</div>}
    </div>
  );
}
