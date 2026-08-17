import { useMemo } from "react";
import { useI18n } from "../i18n/I18nProvider";
import type { TranslationKey } from "../i18n/en";
import { compareProfiles, deriveProfile } from "../privacy/engine";
import { useGameStore } from "../stores/gameStore";
import type {
  ExposureProfile,
  ScenarioComparison,
  ServiceId,
  StoryStage,
  WatcherEvent,
} from "../types/game";
import {
  WatcherGraph,
  type WatcherEdgeState,
  type WatcherGraphEdge,
  type WatcherGraphModel,
  type WatcherGraphNode,
} from "./WatcherGraph";

const serviceLabelKeys: Record<ServiceId, string> = {
  payment: "watcher.node.payment",
  metro: "watcher.node.metro",
  cafe: "watcher.node.cafe",
  clinic: "watcher.node.clinic",
  club: "watcher.node.club",
};

const proofLabelKeys: Record<ServiceId, string> = {
  payment: "watcher.node.proof",
  metro: "watcher.node.proof",
  cafe: "watcher.node.proof",
  clinic: "watcher.node.proof",
  club: "watcher.node.proof",
};

const inferenceLabelKeys = {
  "daily-routine": "watcher.node.inference.dailyRoutine",
  "health-activity": "watcher.node.inference.healthActivity",
  "nightlife-activity": "watcher.node.inference.nightlifeActivity",
} as const;

const comparisonStages = new Set<StoryStage>([
  "clinic-compare",
  "metro-compare",
  "club-compare",
  "results",
]);

const baselineStages = new Set<StoryStage>([
  "spawn",
  "metro-ticket",
  "metro-gate",
  "cafe",
  "clinic",
  "perspective-shift",
]);

const asTranslationKey = (key: string) => key as TranslationKey;

function edgeStateForActiveSignal(
  latest: WatcherEvent | undefined,
  services: ServiceId[],
): WatcherEdgeState {
  if (!latest?.scenarioId || !latest.id.startsWith("baseline:")) return "existing";
  return services.includes(latest.scenarioId) ? "added" : "existing";
}

export function createWatcherGraphModel({
  active,
  baseline,
  comparison,
  latest,
  proofServices,
  showComparison,
}: {
  active: ExposureProfile;
  baseline: ExposureProfile;
  comparison: ScenarioComparison;
  latest?: WatcherEvent;
  proofServices: ServiceId[];
  showComparison: boolean;
}): WatcherGraphModel {
  const nodes = new Map<string, WatcherGraphNode>();
  const edges = new Map<string, WatcherGraphEdge>();
  const removedAccountEdges = new Set(showComparison ? comparison.removedAccountEdgeIds : []);
  const removedCrossLinks = new Set(showComparison ? comparison.removedCrossServiceLinkIds : []);
  const removedInferences = new Set(showComparison ? comparison.removedInferenceIds : []);

  const addNode = (node: WatcherGraphNode) => {
    const existing = nodes.get(node.id);
    if (!existing || existing.state === "removed" || node.state === "added") nodes.set(node.id, node);
  };
  const addService = (serviceId: ServiceId, state: WatcherEdgeState = "existing") => {
    addNode({ id: serviceId, labelKey: serviceLabelKeys[serviceId], kind: "service", state });
  };
  const addIdentity = (state: WatcherEdgeState = "existing") => {
    addNode({ id: "account", labelKey: "watcher.node.account", kind: "identity", state });
  };

  if (showComparison) {
    baseline.accountEdges.forEach((edge) => {
      if (!removedAccountEdges.has(edge.id)) return;
      addIdentity("removed");
      addService(edge.to, "removed");
      edges.set(`account:${edge.id}`, {
        id: `account:${edge.id}`,
        from: "account",
        to: edge.to,
        reasonKey: edge.reasonKey,
        state: "removed",
      });
    });

    baseline.crossServiceLinks.forEach((link) => {
      if (!removedCrossLinks.has(link.id)) return;
      const [from, to] = link.services;
      addService(from, "removed");
      addService(to, "removed");
      edges.set(`cross:${link.id}`, {
        id: `cross:${link.id}`,
        from,
        to,
        reasonKey: link.reasonKey,
        state: "removed",
      });
    });
  }

  active.accountEdges.forEach((edge) => {
    const state = edgeStateForActiveSignal(latest, [edge.to]);
    addIdentity(state);
    addService(edge.to, state);
    edges.set(`account:${edge.id}`, {
      id: `account:${edge.id}`,
      from: "account",
      to: edge.to,
      reasonKey: edge.reasonKey,
      state,
    });
  });

  active.crossServiceLinks.forEach((link) => {
    const state = edgeStateForActiveSignal(latest, [...link.services]);
    const [from, to] = link.services;
    addService(from, state);
    addService(to, state);
    edges.set(`cross:${link.id}`, {
      id: `cross:${link.id}`,
      from,
      to,
      reasonKey: link.reasonKey,
      state,
    });
  });

  const activePredicateServices = new Set(
    active.disclosures
      .filter((disclosure) => disclosure.kind === "predicate")
      .map((disclosure) => disclosure.serviceId),
  );
  proofServices.filter((serviceId) => activePredicateServices.has(serviceId)).forEach((serviceId) => {
    const proofId = `${serviceId}-proof`;
    const blocked = latest?.id === "authorization-reuse" && latest.kind === "blocked" && serviceId === "metro";
    addService(serviceId);
    addNode({
      id: proofId,
      labelKey: proofLabelKeys[serviceId],
      kind: "proof",
      state: blocked ? "blocked" : "added",
    });
    edges.set(`proof:${serviceId}`, {
      id: `proof:${serviceId}`,
      from: proofId,
      to: serviceId,
      reasonKey: blocked ? "watcher.reasonSingleUseBlocked" : "watcher.reasonScopedProof",
      state: blocked ? "blocked" : "added",
    });
  });

  const inferenceById = new Map(active.inferences.map((inference) => [inference.id, inference]));
  if (showComparison) {
    baseline.inferences.forEach((inference) => {
      if (!removedInferences.has(inference.id)) return;
      const inferenceNodeId = `inference-${inference.id}`;
      addNode({
        id: inferenceNodeId,
        labelKey: inferenceLabelKeys[inference.id],
        kind: "inference",
        state: "removed",
      });
      inference.sourceServices.forEach((serviceId) => {
        addService(serviceId, "removed");
        edges.set(`inference:${inference.id}:${serviceId}`, {
          id: `inference:${inference.id}:${serviceId}`,
          from: serviceId,
          to: inferenceNodeId,
          reasonKey: inference.detailKey,
          state: "removed",
        });
      });
    });
  }

  inferenceById.forEach((inference) => {
    const state = edgeStateForActiveSignal(latest, inference.sourceServices);
    const inferenceNodeId = `inference-${inference.id}`;
    addNode({ id: inferenceNodeId, labelKey: inferenceLabelKeys[inference.id], kind: "inference", state });
    inference.sourceServices.forEach((serviceId) => {
      addService(serviceId, state);
      edges.set(`inference:${inference.id}:${serviceId}`, {
        id: `inference:${inference.id}:${serviceId}`,
        from: serviceId,
        to: inferenceNodeId,
        reasonKey: inference.detailKey,
        state,
      });
    });
  });

  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}

export function WatcherPanel({ sheet = false, onClose }: { sheet?: boolean; onClose?: () => void }) {
  const { t } = useI18n();
  const stage = useGameStore((state) => state.stage);
  const baselineRuns = useGameStore((state) => state.baselineRuns);
  const redesignedRuns = useGameStore((state) => state.redesignedRuns);
  const watcherEvents = useGameStore((state) => state.watcherEvents);
  const baselineProfile = useMemo(() => deriveProfile(baselineRuns), [baselineRuns]);
  const redesignedProfile = useMemo(() => deriveProfile(redesignedRuns), [redesignedRuns]);
  const comparison = useMemo(
    () => compareProfiles(baselineRuns, redesignedRuns),
    [baselineRuns, redesignedRuns],
  );
  const activeProfile = baselineStages.has(stage) ? baselineProfile : redesignedProfile;
  const latest = watcherEvents.at(-1);
  const showComparison = comparisonStages.has(stage);
  const proofServices = useMemo(() => [
    ...new Set(
      redesignedRuns
        .filter((run) => run.choice !== "standard")
        .flatMap((run) => run.disclosures)
        .filter((disclosure) => disclosure.kind === "predicate")
        .map((disclosure) => disclosure.serviceId),
    ),
  ], [redesignedRuns]);
  const graphModel = createWatcherGraphModel({
    active: activeProfile,
    baseline: baselineProfile,
    comparison,
    latest,
    proofServices,
    showComparison,
  });
  const score = activeProfile.metrics.score;
  const activeServiceCount = graphModel.nodes.filter(
    (node) => node.kind === "service" && node.state !== "removed",
  ).length;
  const removedLinkCount = comparison.removedAccountEdgeIds.length + comparison.removedCrossServiceLinkIds.length;
  const hasRedesignReduction = redesignedProfile.disclosures.length > 0 && (
    comparison.scoreReduction > 0 || removedLinkCount > 0 || comparison.removedInferenceIds.length > 0
  );

  return (
    <aside
      id={sheet ? "watcher-sheet" : undefined}
      className={`watcher-panel watcher-dock ${sheet ? "is-sheet" : ""}`}
      aria-labelledby={sheet ? "watcher-sheet-title" : "watcher-dock-title"}
    >
      {sheet && <span className="watcher-panel__handle" aria-hidden="true" />}
      <div className="watcher-panel__heading">
        <div>
          <span className="watcher-panel__eyebrow">{t("common.simulation")}</span>
          <h2 id={sheet ? "watcher-sheet-title" : "watcher-dock-title"}>
            <span className="eye-icon" aria-hidden="true" />{t("game.watcher")}
          </h2>
        </div>
        {sheet && onClose && <button className="icon-button" onClick={onClose} aria-label={t("common.close")}>×</button>}
      </div>

      <div className="watcher-exposure">
        <div className="watcher-exposure__copy">
          <span>{t("game.profile")}</span>
          <small>{t(asTranslationKey("watcher.currentView"))}</small>
        </div>
        <strong className="watcher-exposure__score">{score}%</strong>
        <div
          className="watcher-exposure__track"
          role="progressbar"
          aria-label={t("game.profile")}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={score}
        >
          <span style={{ width: `${score}%` }} />
        </div>
      </div>

      <div className="watcher-stats-grid" aria-label={t(asTranslationKey("watcher.currentView"))}>
        <div className="watcher-stat"><span>{t(asTranslationKey("watcher.nodes"))}</span><strong>{activeServiceCount}</strong></div>
        <div className="watcher-stat"><span>{t("watcher.links")}</span><strong>{activeProfile.metrics.crossServiceLinkCount}</strong></div>
        <div className="watcher-stat"><span>{t(asTranslationKey("watcher.inferences"))}</span><strong>{activeProfile.metrics.inferenceCount}</strong></div>
      </div>

      <WatcherGraph model={graphModel} />

      <section className="watcher-inferences" aria-labelledby={sheet ? "watcher-sheet-inferences" : "watcher-dock-inferences"}>
        <h3 id={sheet ? "watcher-sheet-inferences" : "watcher-dock-inferences"} className="watcher-section-title">
          {t(asTranslationKey("watcher.inferences"))}
        </h3>
        {activeProfile.inferences.length > 0 ? (
          <ul className="watcher-inference-list">
            {activeProfile.inferences.map((inference) => (
              <li className="watcher-inference" key={inference.id}>
                <strong>{t(asTranslationKey(inference.titleKey))}</strong>
                <p>{t(asTranslationKey(inference.detailKey))}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="watcher-inference-empty">{t(asTranslationKey("watcher.noInference"))}</p>
        )}
      </section>

      {hasRedesignReduction && (
        <div className="watcher-reduction" role="status">
          <span className="watcher-reduction__mark" aria-hidden="true">−</span>
          <span className="watcher-reduction__label">{t(asTranslationKey("watcher.reduction"))}</span>
          <strong>−{comparison.scoreReduction} {t(asTranslationKey("compare.exposureReduction"))}</strong>
          <p>
            {removedLinkCount} {t(asTranslationKey("compare.removedEdges"))} · {comparison.removedInferenceIds.length} {t(asTranslationKey("compare.removedInferences"))}
          </p>
        </div>
      )}

      {latest && (
        <div className="watcher-latest" data-kind={latest.kind} key={latest.id} aria-live="polite">
          <div className="watcher-latest__topline">
            <span className="watcher-latest__label">{t("watcher.latest")}</span>
            <b className="watcher-latest__delta">
              {latest.delta > 0 ? `+${latest.delta}%` : latest.delta < 0 ? `${latest.delta}%` : "—"}
            </b>
          </div>
          <strong>{t(latest.titleKey as TranslationKey)}</strong>
          <p>{t(latest.detailKey as TranslationKey)}</p>
        </div>
      )}
    </aside>
  );
}
