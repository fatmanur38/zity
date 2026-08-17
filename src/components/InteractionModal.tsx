import { useEffect, useRef, useState } from "react";
import type { TranslationKey } from "../i18n/en";
import { useI18n } from "../i18n/I18nProvider";
import { selectHasMetroEntitlement, selectMetroPayment, useGameStore } from "../stores/gameStore";
import { selectFreshestMetroTransaction } from "../testnet/controllerPolicy";
import type { MetroTestnetController } from "../testnet/useMetroTestnetController";
import { DialogShell } from "./DialogShell";
import { ScenarioDialog } from "./ScenarioDialog";
import { TestnetCheckpoint } from "./TestnetUi";

type InteractionModalProps = {
  testnet: MetroTestnetController;
  presentation?: boolean;
};

export function InteractionModal({ testnet, presentation = false }: InteractionModalProps) {
  const { t } = useI18n();
  const interaction = useGameStore((state) => state.currentInteraction);
  const stage = useGameStore((state) => state.stage);
  const designChoices = useGameStore((state) => state.designChoices);
  const networkMode = useGameStore((state) => state.networkMode);
  const metroPayment = useGameStore(selectMetroPayment);
  const metroEntitlementUsable = useGameStore(selectHasMetroEntitlement);
  const reuseAttempted = useGameStore((state) => state.authorizationReuseAttempted);
  const reuseResult = useGameStore((state) => state.authorizationReuseResult);
  const close = useGameStore((state) => state.closeInteraction);
  const buyTicket = useGameStore((state) => state.buyTicket);
  const connectMetro = useGameStore((state) => state.connectMetro);
  const connectCafe = useGameStore((state) => state.connectCafe);
  const connectClinic = useGameStore((state) => state.connectClinic);
  const attemptReuse = useGameStore((state) => state.attemptAuthorizationReuse);
  const finishReuse = useGameStore((state) => state.finishAuthorizationReuse);
  const proveMetroAccess = useGameStore((state) => state.proveMetroAccess);
  const [status, setStatus] = useState<TranslationKey | null>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    setStatus(null);
    return () => {
      timers.current.forEach((timer) => window.clearTimeout(timer));
      timers.current = [];
    };
  }, [interaction]);

  const runAfterStatus = (statusKey: TranslationKey, action: () => void, delay = 650) => {
    setStatus(statusKey);
    timers.current.push(window.setTimeout(action, delay));
  };

  const runTicketPayment = () => {
    setStatus("metro.paymentComplete");
    timers.current.push(window.setTimeout(buyTicket, 650));
  };

  if (stage === "metro-checkpoint" && networkMode === "testnet") {
    const transaction = selectFreshestMetroTransaction(metroPayment);
    return (
      <TestnetCheckpoint
        status={metroPayment.state}
        health={testnet.health}
        challenge={metroPayment.challenge}
        transaction={transaction}
        entitlementUsable={metroEntitlementUsable}
        errorCode={metroPayment.status?.errorCode ?? testnet.errorCode}
        required={presentation}
        onStart={() => void testnet.start()}
        onCheckPayment={() => void testnet.checkPayment()}
        onRetry={() => void testnet.retry()}
        onContinue={proveMetroAccess}
      />
    );
  }

  if (!interaction || interaction === "results") return null;

  if (interaction === "clinic-terminal" && stage === "clinic-rethink") {
    return <ScenarioDialog scenarioId="clinic" />;
  }
  if (interaction === "metro-proof-gate" && stage === "metro-rethink") {
    return <ScenarioDialog scenarioId="metro" />;
  }
  if (interaction === "club-door" && stage === "club") {
    return <ScenarioDialog scenarioId="club" />;
  }

  if (interaction === "metro-kiosk") {
    return (
      <DialogShell eyebrow={t("world.metro")} title={t("metro.ticketTitle")} onClose={close} actions={(
        <button className="button primary" disabled={Boolean(status)} onClick={runTicketPayment}>
          {status ? t(status) : t("metro.buy")}
        </button>
      )}>
        <p>{t("metro.ticketBody")}</p>
        <div className="receipt-line"><span>{t("requirements.validTicket")}</span><b>₺42</b></div>
      </DialogShell>
    );
  }

  if (interaction === "metro-gate") {
    return (
      <DialogShell eyebrow={t("phase.live")} title={t("metro.gateTitle")} onClose={close} actions={(
        <button className="button primary" disabled={Boolean(status)} onClick={() => runAfterStatus("metro.accessGranted", connectMetro, 760)}>
          {status ? t(status) : t("metro.connect")}
        </button>
      )}>
        <p>{t("metro.gateBody")}</p>
        <div className="scenario-context">
          <div><small>{t("scenario.requirement")}</small><strong>{t("requirements.validTicket")}</strong></div>
          <div><small>{t("scenario.reveals")}</small><strong className="is-linked">A827 · {t("privacy.field.purchaseHistory")}</strong></div>
        </div>
      </DialogShell>
    );
  }

  if (interaction === "cafe-counter") {
    return (
      <DialogShell eyebrow={t("phase.live")} title={t("cafe.title")} onClose={close} actions={(
        <button className="button primary" disabled={Boolean(status)} onClick={() => runAfterStatus("cafe.done", connectCafe, 760)}>
          {status ? t(status) : t("cafe.order")}
        </button>
      )}>
        <p>{t("cafe.body")}</p>
        <div className="data-request is-warning"><span>{t("privacy.field.accountId")}</span><strong>A827</strong></div>
      </DialogShell>
    );
  }

  if (interaction === "clinic-terminal") {
    return (
      <DialogShell eyebrow={t("phase.live")} title={t("clinic.title")} onClose={close} actions={(
        <button className="button primary" disabled={Boolean(status)} onClick={() => runAfterStatus("metro.accessGranted", connectClinic, 720)}>
          {status ? t(status) : t("clinic.checkin")}
        </button>
      )}>
        <p>{t("clinic.body")}</p>
        <div className="need-vs-ask">
          <div><small>{t("scenario.requirement")}</small><b>{t("requirements.validAppointment")}</b></div>
          <span>≠</span>
          <div><small>{t("scenario.reveals")}</small><b>A827 + {t("privacy.field.medicalRelationship")}</b></div>
        </div>
      </DialogShell>
    );
  }

  if (interaction === "metro-reuse-gate") {
    const choice = designChoices.metro ?? "standard";
    const resultKey: TranslationKey = reuseResult?.identityRevealed
      ? "reuse.deniedIdentityKnownDetail"
      : "reuse.deniedWithoutIdentityDetail";
    return (
      <DialogShell
        eyebrow={t("phase.analyze")}
        title={reuseAttempted ? t("reuse.denied") : t("reuse.title")}
        onClose={close}
        closeable={!reuseAttempted}
        actions={reuseAttempted
          ? <button className="button primary" onClick={finishReuse}>{t("common.continue")}</button>
          : <button className="button danger" onClick={attemptReuse}>{t("reuse.try")}</button>}
      >
        {reuseAttempted ? (
          <div className="denied-result">
            <b>{t("reuse.used")}</b>
            <p>{t(resultKey)}</p>
            <span>{t(`scenario.choice.${choice}` as TranslationKey)}</span>
          </div>
        ) : (
          <>
            <p>{t("reuse.body")}</p>
            <div className="proof-result">
              <strong>{t(`scenario.choice.${choice}` as TranslationKey)}</strong>
              <span>{t("reuse.explain")}</span>
            </div>
          </>
        )}
      </DialogShell>
    );
  }

  return null;
}
