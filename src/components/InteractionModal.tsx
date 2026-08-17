import { useEffect, useRef, useState, type ReactNode } from "react";
import type { TranslationKey } from "../i18n/en";
import { useI18n } from "../i18n/I18nProvider";
import { useGameStore } from "../stores/gameStore";
import { createSettlementProvider } from "../settlement";

function DialogShell({
  eyebrow,
  title,
  children,
  actions,
  closeable = true,
  onClose,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
  actions: ReactNode;
  closeable?: boolean;
  onClose: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="overlay-backdrop" role="dialog" aria-modal="true" aria-label={title}>
      <div className="dialog-card">
        <div className="dialog-heading">
          <div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div>
          {closeable && <button type="button" className="icon-button" onClick={onClose} aria-label={t("common.close")}>×</button>}
        </div>
        <div className="dialog-body">{children}</div>
        <div className="dialog-actions">{actions}</div>
      </div>
    </div>
  );
}

export function InteractionModal() {
  const { t } = useI18n();
  const interaction = useGameStore((state) => state.currentInteraction);
  const stage = useGameStore((state) => state.stage);
  const authorizationReuseAttempted = useGameStore((state) => state.authorizationReuseAttempted);
  const close = useGameStore((state) => state.closeInteraction);
  const buyTicket = useGameStore((state) => state.buyTicket);
  const connectMetro = useGameStore((state) => state.connectMetro);
  const connectCafe = useGameStore((state) => state.connectCafe);
  const connectClinic = useGameStore((state) => state.connectClinic);
  const enableMinimum = useGameStore((state) => state.enableMinimumDisclosure);
  const useStandardProof = useGameStore((state) => state.useStandardProof);
  const useMinimumProof = useGameStore((state) => state.useMinimumProof);
  const reuseProof = useGameStore((state) => state.reuseMinimumProof);
  const completeClub = useGameStore((state) => state.completeClub);
  const [status, setStatus] = useState<TranslationKey | null>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    setStatus(null);
    return () => {
      timers.current.forEach((timer) => window.clearTimeout(timer));
      timers.current = [];
    };
  }, [interaction]);

  const runAfterStatus = (key: TranslationKey, action: () => void, delay = 650) => {
    setStatus(key);
    timers.current.push(window.setTimeout(action, delay));
  };

  const runProofSequence = () => {
    setStatus("proof.search1");
    timers.current.push(window.setTimeout(() => setStatus("proof.search2"), 380));
    timers.current.push(window.setTimeout(() => setStatus("proof.search3"), 760));
    timers.current.push(window.setTimeout(() => setStatus("proof.noIdentifier"), 1140));
    timers.current.push(window.setTimeout(useMinimumProof, 1480));
  };

  const runTicketPayment = () => {
    setStatus("metro.paymentComplete");
    try {
      void createSettlementProvider()
        .createPayment({ amount: 42, currency: "TRY", purpose: "metro-ticket" })
        .catch(() => undefined);
    } catch {
      // Gameplay is deliberately non-blocking if an optional adapter is misconfigured.
    }
    timers.current.push(window.setTimeout(buyTicket, 650));
  };

  if (!interaction || interaction === "results") return null;

  if (interaction === "metro-kiosk") {
    return (
      <DialogShell eyebrow={t("world.metro")} title={t("metro.ticketTitle")} onClose={close} actions={
        <button className="button primary" disabled={Boolean(status)} onClick={runTicketPayment}>
          {status ? t(status) : t("metro.buy")}
        </button>
      }>
        <p>{t("metro.ticketBody")}</p>
        <div className="receipt-line"><span>{t("requirements.validTicket")}</span><b>₺42</b></div>
      </DialogShell>
    );
  }

  if (interaction === "metro-gate") {
    return (
      <DialogShell eyebrow={t("world.gate")} title={t("metro.gateTitle")} onClose={close} actions={
        <button className="button primary" disabled={Boolean(status)} onClick={() => runAfterStatus("metro.accessGranted", connectMetro, 760)}>
          {status ? t(status) : t("metro.connect")}
        </button>
      }>
        <p>{t("metro.gateBody")}</p>
        <div className="data-request"><span>{t("results.account")}</span><strong>A827</strong></div>
      </DialogShell>
    );
  }

  if (interaction === "cafe-counter") {
    return (
      <DialogShell eyebrow={t("services.cafe")} title={t("cafe.title")} onClose={close} actions={
        <button className="button primary" disabled={Boolean(status)} onClick={() => runAfterStatus("cafe.done", connectCafe, 760)}>
          {status ? t(status) : t("cafe.order")}
        </button>
      }>
        <p>{t("cafe.body")}</p>
        <div className="data-request is-warning"><span>{t("results.account")}</span><strong>A827</strong></div>
      </DialogShell>
    );
  }

  if (interaction === "clinic-terminal") {
    return (
      <DialogShell eyebrow={t("services.clinic")} title={t("clinic.title")} onClose={close} actions={
        <button className="button primary" disabled={Boolean(status)} onClick={() => runAfterStatus("metro.accessGranted", connectClinic, 700)}>
          {status ? t(status) : t("clinic.checkin")}
        </button>
      }>
        <p>{t("clinic.body")}</p>
        <div className="need-vs-ask">
          <div><small>{t("requirements.validAppointment")}</small><b>{t("common.yes")}</b></div>
          <span>≠</span>
          <div><small>{t("results.account")}</small><b>A827</b></div>
        </div>
      </DialogShell>
    );
  }

  if (interaction === "minimum-disclosure") {
    return (
      <DialogShell eyebrow={t("clinic.turnTitle")} title={t("minimum.title")} onClose={close} closeable={false} actions={
        <button className="button primary" onClick={enableMinimum}>{t("minimum.enable")}</button>
      }>
        <div className="turning-point">
          <p>{t("clinic.turn1")}</p>
          <strong>{t("clinic.turn2")}</strong>
        </div>
        <div className="minimum-unlock"><span className="proof-glyph" aria-hidden="true">✓</span><p>{t("minimum.body")}</p></div>
      </DialogShell>
    );
  }

  if (interaction === "metro-proof-gate") {
    const proofCompleted = stage === "metro-reuse";
    if (proofCompleted) {
      return (
        <DialogShell eyebrow={t("game.watcher")} title={t("proof.linkFailed")} onClose={close} closeable={false} actions={
          <button className="button primary" onClick={close}>{t("common.continue")}</button>
        }>
          <div className="proof-result">
            <strong>{t("proof.validPass")}</strong>
            <span>{t("proof.name")}</span><span>{t("proof.account")}</span><span>{t("proof.wallet")}</span><span>{t("proof.paymentId")}</span>
          </div>
          <div className="link-failure"><span className="broken-link">×</span><div><b>{t("proof.noIdentifier")}</b><p>{t("proof.reduced")}</p></div></div>
        </DialogShell>
      );
    }

    return (
      <DialogShell eyebrow={t("world.proofGate")} title={t("proof.title")} onClose={close} actions={
        <div className="choice-grid">
          <button className="choice-card" disabled={Boolean(status)} onClick={() => runAfterStatus("metro.accessGranted", useStandardProof)}>
            <small>{t("proof.standard")}</small><b>{t("proof.connect")}</b><span>A827</span>
          </button>
          <button className="choice-card is-private" disabled={Boolean(status)} onClick={runProofSequence}>
            <small>{t("proof.minimum")}</small><b>{status ? t(status) : t("proof.prove")}</b><span>{t("proof.account")}</span>
          </button>
        </div>
      }>
        <p>{t("proof.body")}</p>
      </DialogShell>
    );
  }

  if (interaction === "metro-reuse-gate") {
    return (
      <DialogShell eyebrow={t("world.proofGate")} title={authorizationReuseAttempted ? t("reuse.denied") : t("reuse.title")} onClose={close} closeable={!authorizationReuseAttempted} actions={
        authorizationReuseAttempted
          ? <button className="button primary" onClick={close}>{t("common.continue")}</button>
          : <button className="button danger" onClick={reuseProof}>{t("reuse.try")}</button>
      }>
        {authorizationReuseAttempted ? (
          <div className="denied-result"><b>{t("reuse.used")}</b><p>{t("reuse.explain")}</p><span>{t("game.unknownPerson")}</span></div>
        ) : <p>{t("reuse.body")}</p>}
      </DialogShell>
    );
  }

  if (interaction === "club-door") {
    return (
      <DialogShell eyebrow={t("services.club")} title={t("club.title")} onClose={close} actions={
        <div className="choice-grid">
          <button className="choice-card" onClick={() => completeClub(false)}><small>{t("club.standardTitle")}</small><b>{t("club.enterStandard")}</b><span>{t("club.standardBody")}</span></button>
          <button className="choice-card is-private" onClick={() => completeClub(true)}><small>{t("club.minimumTitle")}</small><b>{t("club.enter")}</b><span>{t("club.minimumBody")}</span></button>
        </div>
      }>
        <p>{t("club.body")}</p>
      </DialogShell>
    );
  }

  return null;
}
