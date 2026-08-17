import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import type { TranslationKey } from "../i18n/en";
import { useI18n } from "../i18n/I18nProvider";
import type {
  NetworkMode,
  PaymentChallenge,
  TestnetEvent,
  TestnetHealth,
  TestnetPaymentState,
  TestnetTransactionInfo,
} from "../testnet/contracts";
import "../testnet-ui.css";

/**
 * Transport-agnostic UI contract for the optional real-testnet experience.
 * The controller/store owns polling, timeouts and URL sanitisation; these
 * components only render the latest serialisable snapshot and invoke actions.
 */
export type TestnetHealthRequestState = "idle" | "checking" | "ready" | "error";

export type TestnetHealthView = {
  requestState: TestnetHealthRequestState;
  result: TestnetHealth | null;
  /** Sanitised host/alias only. Never pass credentials or a full private URL. */
  endpointLabel?: string;
  latencyMs?: number;
  /** Stable application error code only; raw server details stay out of the UI. */
  errorCode?: string;
};

type HealthBadgeStatus = "idle" | "checking" | "healthy" | "degraded" | "offline";
type TestnetBadgeStatus = HealthBadgeStatus | TestnetPaymentState;

export type TestnetBadgeProps = {
  status: TestnetBadgeStatus;
  className?: string;
};

export type TestnetCheckpointProps = {
  status: TestnetPaymentState;
  health: TestnetHealthView;
  /** Includes the exact ZIP-321 paymentUri returned by the real server. */
  challenge?: PaymentChallenge | null;
  transaction?: TestnetTransactionInfo | null;
  /** True only when local state accepted a matching server verification response. */
  entitlementUsable: boolean;
  /** Must be a pre-validated public HTTPS explorer URL. */
  explorerUrl?: string;
  /** Presenter mode should set this true so the checkpoint cannot be dismissed. */
  required?: boolean;
  /** Stable, audience-safe error code. Never pass stacks or raw responses. */
  errorCode?: string;
  onStart: () => void;
  onCheckPayment: () => void;
  onRetry: () => void;
  onContinue: () => void;
  onClose?: () => void;
};

export type NetworkInspectorProps = {
  mode: NetworkMode;
  health: TestnetHealthView;
  paymentState: TestnetPaymentState;
  challenge?: PaymentChallenge | null;
  transaction?: TestnetTransactionInfo | null;
  events?: TestnetEvent[];
  errorCode?: string;
  busy?: boolean;
  presentation?: boolean;
  onRefresh: () => void;
  /** Resets network/checkpoint state only; it must not reset game progress. */
  onReset: () => void;
};

export type RealNetworkProofProps = {
  mode: NetworkMode;
  paymentState: TestnetPaymentState;
  transaction?: TestnetTransactionInfo | null;
  /** Must be a pre-validated public HTTPS explorer URL. */
  explorerUrl?: string;
  className?: string;
};

const key = (value: string): TranslationKey => value as TranslationKey;

function statusKey(status: TestnetBadgeStatus): TranslationKey {
  return key(`testnet.status.${status}`);
}

function statusTone(status: TestnetBadgeStatus): "neutral" | "busy" | "ok" | "warning" | "error" {
  if (status === "healthy" || status === "verified") return "ok";
  if (status === "checking" || status === "creating" || status === "detected" || status === "confirming") return "busy";
  if (status === "degraded" || status === "payment-request-created" || status === "waiting") return "warning";
  if (
    status === "offline"
    || status === "expired"
    || status === "failed"
    || status === "network-error"
    || status === "invalid-payment"
  ) return "error";
  return "neutral";
}

export function deriveHealthBadgeStatus(health: TestnetHealthView): HealthBadgeStatus {
  if (health.requestState === "checking") return "checking";
  if (health.requestState === "error") return "offline";
  if (!health.result) return "idle";
  if (!health.result.connected) return "offline";
  if (
    health.result.providerMode !== "real"
    || !health.result.synced
    || !health.result.walletAvailable
    || !health.result.indexerAvailable
  ) return "degraded";
  return "healthy";
}

export function isRealTestnetReady(health: TestnetHealthView): boolean {
  return health.requestState !== "error"
    && health.result?.providerMode === "real"
    && health.result.connected
    && health.result.synced
    && health.result.walletAvailable
    && health.result.indexerAvailable;
}

function healthIssueKey(health: TestnetHealthView): TranslationKey {
  const diagnostic = `${health.errorCode ?? ""} ${health.result?.message ?? ""}`.toUpperCase();
  if (!health.result && health.requestState !== "error") return key("testnet.connectionHelp");
  if (health.result?.providerMode === "mock") return key("testnet.connectionBody");
  if (diagnostic.includes("AUTH")) return key("testnet.healthError.rpcAuth");
  if (!health.result?.connected) return key("testnet.healthError.nodeUnavailable");
  if (diagnostic.includes("SYNC") || diagnostic.includes("STALE")) {
    return key("testnet.healthError.syncUnavailable");
  }
  if (!health.result.walletAvailable) return key("testnet.healthError.walletUnavailable");
  if (!health.result.indexerAvailable) return key("testnet.healthError.indexerUnavailable");
  if (!health.result.synced) return key("testnet.healthError.syncUnavailable");
  return key("testnet.connectionHelp");
}

function safeExplorerUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function shortenTransactionId(value: string): string {
  if (value.length <= 24) return value;
  return `${value.slice(0, 12)}…${value.slice(-10)}`;
}

function formatTimestamp(value: string | undefined, language: "en" | "tr"): string | undefined {
  if (!value) return undefined;
  try {
    return new Intl.DateTimeFormat(language === "tr" ? "tr-TR" : "en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function CopyValueButton({ value, labelKey }: { value: string; labelKey: TranslationKey }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setCopied(false);
  }, [value]);

  const copy = async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button type="button" className="testnet-copy-button" onClick={copy}>
      {copied ? t(key("testnet.copyDone")) : t(labelKey)}
    </button>
  );
}

export function TestnetBadge({ status, className = "" }: TestnetBadgeProps) {
  const { t } = useI18n();
  const tone = statusTone(status);
  const statusLabel = t(statusKey(status));

  return (
    <span
      className={`testnet-badge ${className}`.trim()}
      data-tone={tone}
      aria-label={`${t(key("testnet.badge"))}: ${statusLabel}`}
    >
      <i aria-hidden="true" />
      <b>{t(key("testnet.badge"))}</b>
      <span>{statusLabel}</span>
    </span>
  );
}

function ReceiptSummary({
  transaction,
  explorerUrl,
}: {
  transaction: TestnetTransactionInfo;
  explorerUrl?: string;
}) {
  const { language, t } = useI18n();
  const safeUrl = safeExplorerUrl(explorerUrl);
  const submittedAt = formatTimestamp(transaction.confirmedAt ?? transaction.detectedAt, language);

  return (
    <div className="testnet-receipt-summary">
      <div className="testnet-receipt-id">
        <span>{t(key("testnet.transaction"))}</span>
        <code title={transaction.txid}>{shortenTransactionId(transaction.txid)}</code>
        <CopyValueButton value={transaction.txid} labelKey={key("testnet.copyTransaction")} />
      </div>
      <dl>
        <div><dt>{t(key("testnet.network"))}</dt><dd>{transaction.network}</dd></div>
        {transaction.blockHeight != null && (
          <div><dt>{t(key("testnet.blockHeight"))}</dt><dd>{transaction.blockHeight.toLocaleString()}</dd></div>
        )}
        <div><dt>{t(key("testnet.confirmations"))}</dt><dd>{transaction.confirmations}</dd></div>
        {submittedAt && <div><dt>{t(key("testnet.submittedAt"))}</dt><dd>{submittedAt}</dd></div>}
      </dl>
      {safeUrl && (
        <a className="testnet-explorer-link" href={safeUrl} target="_blank" rel="noreferrer">
          {t(key("testnet.viewExplorer"))} <span aria-hidden="true">↗</span>
        </a>
      )}
    </div>
  );
}

export function TestnetCheckpoint({
  status,
  health,
  challenge,
  transaction,
  entitlementUsable,
  explorerUrl,
  required = false,
  errorCode,
  onStart,
  onCheckPayment,
  onRetry,
  onContinue,
  onClose,
}: TestnetCheckpointProps) {
  const { language, t } = useI18n();
  const isBusy = status === "creating"
    || status === "detected"
    || status === "confirming"
    || (status === "verified" && !entitlementUsable);
  const isAwaitingPayment = status === "payment-request-created" || status === "waiting";
  const providerReady = isRealTestnetReady(health);
  const providerUnavailable = health.requestState === "error"
    || (health.result != null && !providerReady);
  // entitlementUsable is derived by the fail-closed store selector and already
  // proves matching real challenge/verification/tx provenance. Once issued, it
  // remains locally consumable during a later health outage; no new network work
  // is allowed until providerReady becomes true again.
  const canProveAccess = entitlementUsable && transaction != null;
  const showRealEvidence = providerReady || canProveAccess;
  const transactionConfirmed = transaction != null
    && transaction.confirmations > 0
    && transaction.confirmedAt != null;
  const isFailure = status === "expired"
    || status === "failed"
    || status === "network-error"
    || status === "invalid-payment";
  const errorStatus = errorCode === "INCORRECT_AMOUNT"
    ? "incorrect-amount"
    : errorCode === "TRANSACTION_REJECTED"
      ? "transaction-rejected"
      : status === "verified"
        ? "invalid-payment"
        : status;
  const healthStatus = deriveHealthBadgeStatus(health);
  const canDismiss = !required && onClose != null;

  const primary = (() => {
    if (canProveAccess) {
      return { label: t(key("testnet.continue")), action: onContinue, disabled: false };
    }
    if (!providerReady) {
      return {
        label: t(key(providerUnavailable ? "testnet.connectionUnavailable" : "testnet.status.checking")),
        action: onCheckPayment,
        disabled: true,
      };
    }
    if (isAwaitingPayment) {
      return { label: t(key("testnet.checkPayment")), action: onCheckPayment, disabled: !challenge };
    }
    if (isFailure) {
      return { label: t(key("testnet.retry")), action: onRetry, disabled: false };
    }
    if (status === "not-created") {
      return { label: t(key("testnet.startCheckpoint")), action: onStart, disabled: false };
    }
    return { label: t(statusKey(status)), action: onCheckPayment, disabled: true };
  })();

  return (
    <div
      className="testnet-checkpoint-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="testnet-checkpoint-title"
    >
      <section className="testnet-checkpoint" data-state={status} aria-busy={isBusy}>
        <header className="testnet-checkpoint-heading">
          <div>
            <span className="testnet-kicker">
              {t(key(showRealEvidence ? "testnet.checkpointEyebrow" : "testnet.connectionEyebrow"))}
            </span>
            <h2 id="testnet-checkpoint-title">
              {t(key(showRealEvidence ? "testnet.checkpointTitle" : "testnet.connectionUnavailable"))}
            </h2>
          </div>
          <TestnetBadge status={showRealEvidence ? status : healthStatus} />
          {canDismiss && (
            <button type="button" className="icon-button" onClick={onClose} aria-label={t("common.close")}>×</button>
          )}
        </header>

        <div className="testnet-checkpoint-body">
          <div className="testnet-checkpoint-copy">
            <p>{t(key(showRealEvidence ? "testnet.checkpointBody" : "testnet.connectionBody"))}</p>
            {showRealEvidence && (
              <p className="testnet-privacy-note">
                <span aria-hidden="true">◇</span>
                {t(key("testnet.noIdentitySent"))}
              </p>
            )}
            {required && <p className="testnet-required-note">{t(key("testnet.presenterRequired"))}</p>}
          </div>

          {!showRealEvidence && (
            <div className="testnet-connection-unavailable" role={providerUnavailable ? "alert" : "status"}>
              <strong>{t(key(providerUnavailable ? "testnet.connectionUnavailable" : "testnet.status.checking"))}</strong>
              <p>{t(healthIssueKey(health))}</p>
              {health.errorCode && <code>{health.errorCode}</code>}
            </div>
          )}

          {canProveAccess && !providerReady && (
            <div className="testnet-stored-evidence" role="status">
              {t(key("testnet.storedEvidenceWarning"))}
            </div>
          )}

          {providerReady && isBusy && (
            <div className="testnet-progress" role="status" aria-live="polite">
              <i aria-hidden="true" />
              <strong>{t(key(status === "verified" ? "testnet.verifyingEntitlement" : statusKey(status)))}</strong>
            </div>
          )}

          {providerReady && challenge && !canProveAccess && (
            <div className="testnet-payment-request">
              <div className="testnet-qr" role="img" aria-label={t(key("testnet.qrTitle"))}>
                <QRCodeSVG
                  value={challenge.paymentUri}
                  size={188}
                  level="M"
                  marginSize={2}
                  title={t(key("testnet.qrTitle"))}
                />
              </div>
              <div>
                <span className="testnet-zip-label">ZIP-321</span>
                <h3>{t(key("testnet.scanTitle"))}</h3>
                <p>{t(key("testnet.scanBody"))}</p>
                <div className="testnet-challenge-meta">
                  <span>{challenge.amount} ZEC</span>
                  <span>{t(key("testnet.expiresAt"))}: {formatTimestamp(challenge.expiresAt, language)}</span>
                </div>
                <div className="testnet-recipient">
                  <span>{t(key("testnet.recipient"))}</span>
                  <code title={challenge.recipient}>{challenge.recipient}</code>
                </div>
                <div className="testnet-payment-actions">
                  <a className="testnet-explorer-link" href={challenge.paymentUri}>
                    {t(key("testnet.openPaymentRequest"))} <span aria-hidden="true">↗</span>
                  </a>
                  <CopyValueButton value={challenge.recipient} labelKey={key("testnet.copyAddress")} />
                </div>
                <CopyValueButton value={challenge.paymentUri} labelKey={key("testnet.copyPaymentUri")} />
              </div>
            </div>
          )}

          {canProveAccess && (
            <div className="testnet-confirmed" data-confirmed={transactionConfirmed} role="status" aria-live="polite">
              <div className="testnet-confirmed-heading">
                <span aria-hidden="true">{transactionConfirmed ? "✓" : "◌"}</span>
                <div>
                  <strong>{t(key(transactionConfirmed ? "testnet.confirmedTitle" : "testnet.detectedTitle"))}</strong>
                  <p>{t(key(transactionConfirmed ? "testnet.confirmedBody" : "testnet.detectedBody"))}</p>
                </div>
              </div>
              <ReceiptSummary transaction={transaction} explorerUrl={explorerUrl} />
            </div>
          )}

          {isFailure && (
            <div className="testnet-error" role="alert">
              <strong>{t(key(`testnet.error.${errorStatus}.title`))}</strong>
              <p>{t(key(`testnet.error.${errorStatus}.body`))}</p>
              {errorCode && <code className="testnet-error-code">{errorCode}</code>}
            </div>
          )}

          {showRealEvidence && <ol className="testnet-step-list" aria-label={t(key("testnet.stepsTitle"))}>
            <li data-state={challenge ? "complete" : status === "creating" ? "active" : "upcoming"}>
              <span>01</span><b>{t(key("testnet.step.request"))}</b>
            </li>
            <li data-state={transaction ? "complete" : challenge ? "active" : "upcoming"}>
              <span>02</span><b>{t(key("testnet.step.detected"))}</b>
            </li>
            <li data-state={transactionConfirmed ? "complete" : transaction ? "active" : "upcoming"}>
              <span>03</span><b>{t(key("testnet.step.confirmation"))}</b>
            </li>
          </ol>}

          <div className="testnet-health-line" data-health={healthStatus}>
            <i aria-hidden="true" />
            <span>{t(key("testnet.networkName"))}</span>
            <b>{t(statusKey(healthStatus))}</b>
            {health.result?.blockHeight != null && <small>#{health.result.blockHeight.toLocaleString()}</small>}
          </div>
        </div>

        <footer className="testnet-checkpoint-actions">
          <button type="button" className="button testnet-primary" onClick={primary.action} disabled={primary.disabled}>
            {primary.label} {!primary.disabled && <span aria-hidden="true">→</span>}
          </button>
        </footer>
      </section>
    </div>
  );
}

export function NetworkInspector({
  mode,
  health,
  paymentState,
  challenge,
  transaction,
  events = [],
  errorCode,
  busy = false,
  presentation = false,
  onRefresh,
  onReset,
}: NetworkInspectorProps) {
  const { language, t } = useI18n();
  const [resetArmed, setResetArmed] = useState(false);
  const healthStatus = deriveHealthBadgeStatus(health);
  const checkedAt = formatTimestamp(health.result?.checkedAt, language);

  useEffect(() => {
    setResetArmed(false);
  }, [mode, transaction?.txid]);

  const confirmReset = () => {
    setResetArmed(false);
    onReset();
  };

  return (
    <section className="network-inspector" data-mode={mode} aria-labelledby="network-inspector-title">
      <header>
        <div>
          <span className="testnet-kicker">{presentation ? t(key("testnet.presenterTools")) : t(key("testnet.networkTools"))}</span>
          <h3 id="network-inspector-title">{t(key("testnet.inspectorTitle"))}</h3>
        </div>
        {mode === "testnet" ? <TestnetBadge status={healthStatus} /> : <span className="network-demo-badge">{t(key("testnet.demoMode"))}</span>}
      </header>

      <div className="network-inspector-status" role="status" aria-live="polite">
        <i aria-hidden="true" />
        <div><strong>{t(key("testnet.networkName"))}</strong><span>{t(statusKey(healthStatus))}</span></div>
      </div>

      <dl className="network-inspector-grid">
        <div><dt>{t(key("testnet.endpoint"))}</dt><dd>{health.endpointLabel ?? t("common.unavailable")}</dd></div>
        <div><dt>{t(key("testnet.provider"))}</dt><dd>{health.result?.providerMode ?? "—"}</dd></div>
        <div><dt>{t(key("testnet.nodeHeight"))}</dt><dd>{health.result?.blockHeight?.toLocaleString() ?? "—"}</dd></div>
        <div><dt>{t(key("testnet.synced"))}</dt><dd>{health.result?.synced ? t("common.yes") : t("common.unavailable")}</dd></div>
        <div><dt>{t(key("testnet.wallet"))}</dt><dd>{health.result?.walletAvailable ? t("common.yes") : t("common.unavailable")}</dd></div>
        <div><dt>{t(key("testnet.indexer"))}</dt><dd>{health.result?.indexerAvailable ? t("common.yes") : t("common.unavailable")}</dd></div>
        <div><dt>{t(key("testnet.latency"))}</dt><dd>{health.latencyMs != null ? `${health.latencyMs} ms` : "—"}</dd></div>
        <div><dt>{t(key("testnet.lastChecked"))}</dt><dd>{checkedAt ?? t(key("testnet.neverChecked"))}</dd></div>
        <div><dt>{t(key("testnet.challenge"))}</dt><dd title={challenge?.challengeId}>{challenge?.challengeId ?? "—"}</dd></div>
        <div><dt>{t(key("testnet.amount"))}</dt><dd>{challenge ? `${challenge.amount} ZEC` : "—"}</dd></div>
        <div><dt>{t(key("testnet.checkpoint"))}</dt><dd>{t(statusKey(paymentState))}</dd></div>
        <div><dt>{t(key("testnet.transaction"))}</dt><dd title={transaction?.txid}>{transaction ? shortenTransactionId(transaction.txid) : "—"}</dd></div>
      </dl>

      {transaction && (
        <div className="network-inspector-receipt">
          <ReceiptSummary transaction={transaction} />
        </div>
      )}

      {(health.result?.message || health.errorCode || errorCode) && (
        <div className="network-error-detail" role="alert">
          <div>
            <strong>{t(key("testnet.errorDetail"))}</strong>
            {health.result?.message && <p>{health.result.message}</p>}
          </div>
          {(errorCode || health.errorCode) && <code>{errorCode ?? health.errorCode}</code>}
        </div>
      )}

      {presentation && events.length > 0 && (
        <div className="network-event-log">
          <strong>{t(key("testnet.eventLog"))}</strong>
          <ol>
            {events.slice(-6).reverse().map((event) => (
              <li key={event.id} data-tone={statusTone(event.state)}>
                <span>{t(statusKey(event.state))}</span>
                <code>{event.detail ?? event.state}</code>
                <time dateTime={event.at}>{formatTimestamp(event.at, language)}</time>
              </li>
            ))}
          </ol>
        </div>
      )}

      {resetArmed ? (
        <div className="network-reset-confirm" role="alert">
          <p>{t(key("testnet.resetWarning"))}</p>
          <div>
            <button type="button" className="button ghost" onClick={() => setResetArmed(false)}>{t(key("testnet.cancelReset"))}</button>
            <button type="button" className="button danger" onClick={confirmReset}>{t(key("testnet.confirmReset"))}</button>
          </div>
        </div>
      ) : (
        <div className="network-inspector-actions">
          <button type="button" className="button ghost" onClick={onRefresh} disabled={busy || health.requestState === "checking"}>
            {t(key("testnet.refreshHealth"))}
          </button>
          <button type="button" className="button ghost" onClick={() => setResetArmed(true)} disabled={busy}>
            {t(key("testnet.resetSession"))}
          </button>
        </div>
      )}
    </section>
  );
}

export function RealNetworkProof({
  mode,
  paymentState,
  transaction,
  explorerUrl,
  className = "",
}: RealNetworkProofProps) {
  const { t } = useI18n();
  const isConfirmed = mode === "testnet"
    && paymentState === "verified"
    && transaction != null
    && transaction.confirmations > 0
    && transaction.confirmedAt != null;
  const isPending = mode === "testnet" && transaction != null && !isConfirmed;
  const state = isConfirmed ? "confirmed" : isPending ? "pending" : mode === "demo" ? "demo" : "unavailable";

  return (
    <section
      className={`real-network-proof ${className}`.trim()}
      data-state={state}
      aria-labelledby="real-network-proof-title"
    >
      <header>
        <div>
          <span className="testnet-kicker">{t(key("testnet.resultEyebrow"))}</span>
          <h3 id="real-network-proof-title">{t(key(`testnet.result.${state}.title`))}</h3>
        </div>
        {mode === "testnet" ? <TestnetBadge status={paymentState} /> : <span className="network-demo-badge">{t(key("testnet.demoMode"))}</span>}
      </header>
      <p className="real-network-proof-lead">{t(key(`testnet.result.${state}.body`))}</p>
      {transaction && <ReceiptSummary transaction={transaction} explorerUrl={explorerUrl} />}
      <p className="real-network-proof-scope">
        <span aria-hidden="true">i</span>
        {t(key("testnet.proofScope"))}
      </p>
    </section>
  );
}
