import { useId } from "react";
import type { TranslationKey } from "../i18n/en";
import { useI18n } from "../i18n/I18nProvider";

export type WatcherNodeKind = "identity" | "service" | "proof" | "inference";
export type WatcherEdgeState = "existing" | "added" | "removed" | "blocked";

export type WatcherGraphNode = {
  id: string;
  labelKey: string;
  kind: WatcherNodeKind;
  state?: WatcherEdgeState;
};

export type WatcherGraphEdge = {
  id: string;
  from: string;
  to: string;
  reasonKey: string;
  state: WatcherEdgeState;
};

export type WatcherGraphModel = {
  nodes: WatcherGraphNode[];
  edges: WatcherGraphEdge[];
};

type Point = { x: number; y: number };

const fixedPositions: Record<string, Point> = {
  account: { x: 200, y: 42 },
  identity: { x: 200, y: 42 },
  payment: { x: 44, y: 135 },
  metro: { x: 122, y: 135 },
  cafe: { x: 200, y: 135 },
  clinic: { x: 278, y: 135 },
  club: { x: 356, y: 135 },
  "payment-proof": { x: 38, y: 220 },
  "metro-proof": { x: 90, y: 220 },
  "cafe-proof": { x: 200, y: 220 },
  "clinic-proof": { x: 200, y: 220 },
  "club-proof": { x: 310, y: 220 },
  "inference-daily-routine": { x: 65, y: 286 },
  "inference-health-activity": { x: 200, y: 286 },
  "inference-nightlife-activity": { x: 335, y: 286 },
};

const fallbackPositions: Record<WatcherNodeKind, Point[]> = {
  identity: [{ x: 200, y: 42 }],
  service: [
    { x: 44, y: 135 },
    { x: 122, y: 135 },
    { x: 200, y: 135 },
    { x: 278, y: 135 },
    { x: 356, y: 135 },
  ],
  proof: [
    { x: 90, y: 220 },
    { x: 200, y: 220 },
    { x: 310, y: 220 },
  ],
  inference: [
    { x: 65, y: 286 },
    { x: 200, y: 286 },
    { x: 335, y: 286 },
  ],
};

const nodeWidths: Record<WatcherNodeKind, number> = {
  identity: 112,
  service: 72,
  proof: 108,
  inference: 108,
};

const asTranslationKey = (key: string) => key as TranslationKey;

function createPositionMap(nodes: WatcherGraphNode[]) {
  const positions = new Map<string, Point>();
  const grouped = new Map<WatcherNodeKind, WatcherGraphNode[]>();

  nodes.forEach((node) => {
    if (fixedPositions[node.id]) {
      positions.set(node.id, fixedPositions[node.id]);
      return;
    }
    const group = grouped.get(node.kind) ?? [];
    group.push(node);
    grouped.set(node.kind, group);
  });

  grouped.forEach((group, kind) => {
    group
      .sort((left, right) => left.id.localeCompare(right.id))
      .forEach((node, index) => {
        const slots = fallbackPositions[kind];
        positions.set(node.id, slots[index % slots.length]);
      });
  });

  return positions;
}

function edgePath(from: Point, to: Point) {
  const verticalDistance = Math.abs(to.y - from.y);
  if (verticalDistance < 16) {
    const lift = Math.min(62, 24 + Math.abs(to.x - from.x) * 0.2);
    return `M ${from.x} ${from.y} C ${from.x} ${from.y - lift}, ${to.x} ${to.y - lift}, ${to.x} ${to.y}`;
  }
  const bend = from.y + (to.y - from.y) * 0.52;
  return `M ${from.x} ${from.y} C ${from.x} ${bend}, ${to.x} ${bend}, ${to.x} ${to.y}`;
}

export function WatcherGraph({ model }: { model: WatcherGraphModel }) {
  const { t } = useI18n();
  const titleId = useId();
  const descriptionId = useId();
  const markerId = useId().replaceAll(":", "");
  const positions = createPositionMap(model.nodes);
  const hasSignal = model.nodes.length > 0 || model.edges.length > 0;
  const inferenceCount = model.nodes.filter((node) => node.kind === "inference").length;

  if (!hasSignal) {
    return (
      <div className="watcher-graph-empty" role="status">
        <span className="watcher-graph-empty__scan" aria-hidden="true" />
        <strong>{t("game.unknownPerson")}</strong>
        <small>{t("game.noLinks")}</small>
      </div>
    );
  }

  return (
    <figure className="watcher-graph-shell">
      <svg
        className="watcher-graph-svg"
        viewBox="0 0 400 320"
        role="img"
        aria-labelledby={`${titleId} ${descriptionId}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <title id={titleId}>{t(asTranslationKey("watcher.currentView"))}</title>
        <desc id={descriptionId}>
          {t(asTranslationKey("watcher.currentView"))}: {model.nodes.length} {t(asTranslationKey("watcher.nodes"))}, {model.edges.length} {t("watcher.links")}, {inferenceCount} {t(asTranslationKey("watcher.inferences"))}.
        </desc>

        <defs>
          <pattern id={`${markerId}-grid`} width="16" height="16" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.8" className="watcher-graph-grid-dot" />
          </pattern>
          <marker id={`${markerId}-arrow`} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M 0 0 L 6 3 L 0 6 z" className="watcher-edge-arrow" />
          </marker>
        </defs>

        <rect className="watcher-graph-grid" width="400" height="320" fill={`url(#${markerId}-grid)`} />

        <g className="watcher-graph-edges" aria-hidden="true">
          {model.edges.map((edge) => {
            const from = positions.get(edge.from);
            const to = positions.get(edge.to);
            if (!from || !to) return null;
            const path = edgePath(from, to);
            const midpoint = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };

            return (
              <g className="watcher-edge-group" data-state={edge.state} key={edge.id}>
                <path
                  className="watcher-edge"
                  d={path}
                  pathLength={1}
                  markerEnd={edge.state === "existing" || edge.state === "added" ? `url(#${markerId}-arrow)` : undefined}
                />
                {(edge.state === "removed" || edge.state === "blocked") && (
                  <g className="watcher-edge-break" transform={`translate(${midpoint.x} ${midpoint.y})`}>
                    <circle r="10" />
                    <path d="M -4 -4 L 4 4 M 4 -4 L -4 4" />
                  </g>
                )}
              </g>
            );
          })}
        </g>

        <g className="watcher-graph-nodes" aria-hidden="true">
          {model.nodes.map((node) => {
            const point = positions.get(node.id);
            if (!point) return null;
            const nodeWidth = nodeWidths[node.kind];
            return (
              <g
                className="watcher-graph-node"
                data-kind={node.kind}
                data-state={node.state ?? "existing"}
                key={node.id}
                transform={`translate(${point.x} ${point.y})`}
              >
                <rect x={-nodeWidth / 2} y="-17" width={nodeWidth} height="34" rx="4" />
                <circle cx={-nodeWidth / 2 + 11} cy="0" r="3.5" />
                <text x="7" y="1" textAnchor="middle" dominantBaseline="middle">
                  {t(asTranslationKey(node.labelKey))}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      <figcaption className="sr-only">
        <ul>
          {model.edges.map((edge) => (
            <li key={edge.id}>
              {t(asTranslationKey(`watcher.edge.${edge.state}`))}: {t(asTranslationKey(edge.reasonKey))}
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}
