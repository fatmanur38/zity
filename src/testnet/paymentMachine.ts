import type {
  CreatePaymentChallengeInput,
  NetworkMode,
  PaymentChallenge,
  PaymentChallengeStatus,
  PaymentVerification,
  TestnetEntitlement,
  TestnetEvent,
  TestnetPaymentState,
} from "./contracts";

export type MetroPaymentSession = {
  networkMode: NetworkMode;
  state: TestnetPaymentState;
  request: CreatePaymentChallengeInput | null;
  challenge: PaymentChallenge | null;
  status: PaymentChallengeStatus | null;
  verification: PaymentVerification | null;
  entitlement: TestnetEntitlement | null;
  events: TestnetEvent[];
};

type TransitionMeta = {
  eventId: string;
  at: string;
};

export type MetroPaymentTransition =
  | (TransitionMeta & {
      type: "payment/start";
      request: CreatePaymentChallengeInput;
    })
  | (TransitionMeta & {
      type: "payment/challenge-received";
      challenge: PaymentChallenge;
    })
  | (TransitionMeta & {
      type: "payment/status-received";
      status: PaymentChallengeStatus;
    })
  | (TransitionMeta & {
      type: "payment/verification-received";
      verification: PaymentVerification;
    })
  | (TransitionMeta & {
      type: "payment/demo-verified";
      entitlement: TestnetEntitlement;
    })
  | (TransitionMeta & {
      type: "payment/failed";
      state: Extract<
        TestnetPaymentState,
        "expired" | "failed" | "network-error" | "invalid-payment"
      >;
      detail: string;
    })
  | (TransitionMeta & {
      type: "payment/entitlement-consumed";
    })
  | (TransitionMeta & {
      type: "payment/reset";
    });

const MAX_EVENTS = 40;

const progressRank: Partial<Record<TestnetPaymentState, number>> = {
  "not-created": 0,
  creating: 1,
  "payment-request-created": 2,
  waiting: 3,
  detected: 4,
  confirming: 5,
  verified: 6,
};

const terminalFailureStates = new Set<TestnetPaymentState>([
  "expired",
  "failed",
  "network-error",
  "invalid-payment",
]);

const eventTxid = (transition: MetroPaymentTransition): string | undefined => {
  if (transition.type === "payment/status-received") {
    return transition.status.transaction?.txid;
  }
  if (transition.type === "payment/verification-received") {
    return transition.verification.transaction?.txid;
  }
  return undefined;
};

const appendEvent = (
  session: MetroPaymentSession,
  transition: MetroPaymentTransition,
  state: TestnetPaymentState,
  detail: string,
): TestnetEvent[] => {
  if (session.events.some((event) => event.id === transition.eventId)) return session.events;
  return [
    ...session.events,
    {
      id: transition.eventId,
      at: transition.at,
      state,
      detail,
      txid: eventTxid(transition),
    },
  ].slice(-MAX_EVENTS);
};

const failClosed = (
  session: MetroPaymentSession,
  transition: MetroPaymentTransition,
  detail: string,
  state: Extract<TestnetPaymentState, "expired" | "failed" | "network-error" | "invalid-payment">
    = "invalid-payment",
): MetroPaymentSession => ({
  ...session,
  state,
  verification: null,
  entitlement: null,
  events: appendEvent(session, transition, state, detail),
});

const timestamp = (value: string): number => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};

const challengeMatchesStatus = (
  challenge: PaymentChallenge,
  status: PaymentChallengeStatus,
): boolean => status.challengeId === challenge.challengeId
  && status.network === challenge.network
  && status.providerMode === challenge.providerMode
  && status.amount === challenge.amount
  && status.recipient === challenge.recipient
  && status.expiresAt === challenge.expiresAt;

const verificationMatchesPolicy = (verification: PaymentVerification): boolean => {
  if (!verification.unlockEligible || !verification.transaction) return false;
  if (verification.unlockPolicy === "confirmed") {
    return verification.verified
      && verification.state === "verified"
      && verification.transaction.confirmations > 0
      && Boolean(verification.transaction.confirmedAt);
  }
  return verification.verified === (verification.state === "verified")
    && (verification.state === "detected"
    || verification.state === "confirming"
    || verification.state === "verified");
};

export const issueTestnetMetroEntitlement = (
  challenge: PaymentChallenge,
  verification: PaymentVerification,
  at: string,
): TestnetEntitlement | null => {
  const txid = verification.transaction?.txid;
  const atMs = timestamp(at);
  const detectedAt = verification.transaction ? timestamp(verification.transaction.detectedAt) : Number.NaN;
  const challengeExpiresAt = timestamp(challenge.expiresAt);
  if (!txid
    || !Number.isFinite(atMs)
    || !Number.isFinite(detectedAt)
    || !Number.isFinite(challengeExpiresAt)
    || detectedAt > challengeExpiresAt) {
    return null;
  }
  return {
    id: `metro-${challenge.challengeId}`,
    type: "metro-access",
    source: {
      mode: "testnet",
      challengeId: challenge.challengeId,
      txid,
    },
    issuedAt: atMs,
    maxUses: 1,
    useCount: 0,
  };
};

const validDemoEntitlement = (
  entitlement: TestnetEntitlement,
  at: string,
): boolean => {
  const atMs = timestamp(at);
  return entitlement.type === "metro-access"
    && entitlement.source.mode === "demo"
    && entitlement.maxUses === 1
    && entitlement.useCount === 0
    && Number.isFinite(atMs)
    && entitlement.issuedAt <= atMs
    && (entitlement.expiresAt === undefined || entitlement.expiresAt > atMs);
};

export function resolveConfiguredNetworkMode(value: unknown): NetworkMode {
  if (value === undefined || value === "demo") return "demo";
  if (value === "testnet") return "testnet";
  throw new Error(`Unsupported ZITY network mode: ${String(value)}`);
}

export function createInitialMetroPaymentSession(
  networkMode: NetworkMode,
): MetroPaymentSession {
  return {
    networkMode,
    state: "not-created",
    request: null,
    challenge: null,
    status: null,
    verification: null,
    entitlement: null,
    events: [],
  };
}

export function createDemoMetroEntitlement(
  id: string,
  issuedAt: number,
): TestnetEntitlement {
  return {
    id,
    type: "metro-access",
    source: { mode: "demo" },
    issuedAt,
    maxUses: 1,
    useCount: 0,
  };
}

export function hasUsableMetroEntitlement(
  session: MetroPaymentSession,
  atMs: number,
): boolean {
  const entitlement = session.entitlement;
  if (!entitlement || entitlement.type !== "metro-access") return false;
  if (entitlement.useCount >= entitlement.maxUses) return false;
  if (entitlement.issuedAt > atMs) return false;
  if (entitlement.expiresAt !== undefined && entitlement.expiresAt <= atMs) return false;

  if (session.networkMode === "demo") {
    return entitlement.source.mode === "demo" && session.state === "verified";
  }

  if (entitlement.source.mode !== "testnet" || !session.challenge || !session.verification) {
    return false;
  }
  return verificationMatchesPolicy(session.verification)
    && entitlement.source.challengeId === session.challenge.challengeId
    && entitlement.source.txid === session.verification.transaction?.txid;
}

export function transitionMetroPayment(
  session: MetroPaymentSession,
  transition: MetroPaymentTransition,
): MetroPaymentSession {
  if (session.events.some((event) => event.id === transition.eventId)) return session;

  if (transition.type === "payment/reset") {
    return createInitialMetroPaymentSession(session.networkMode);
  }

  // Consumption is terminal until an explicit presenter reset. A late poll or
  // duplicated verification must never mint the same one-use grant again.
  if (session.entitlement?.useCount === 1) return session;
  if (session.state === "expired"
    || session.state === "failed"
    || session.state === "invalid-payment") return session;

  if (transition.type === "payment/start") {
    if (session.networkMode !== "testnet") {
      return failClosed(session, transition, "testnet-payment-requested-in-demo-mode");
    }
    if (transition.request.purpose !== "metro-access") {
      return failClosed(session, transition, "unsupported-payment-purpose");
    }
    const next: MetroPaymentSession = {
      ...createInitialMetroPaymentSession(session.networkMode),
      state: "creating",
      request: transition.request,
    };
    return {
      ...next,
      events: appendEvent(session, transition, next.state, "payment-requested"),
    };
  }

  if (transition.type === "payment/demo-verified") {
    if (session.networkMode !== "demo" || !validDemoEntitlement(transition.entitlement, transition.at)) {
      return failClosed(session, transition, "invalid-demo-entitlement");
    }
    return {
      ...session,
      state: "verified",
      entitlement: transition.entitlement,
      events: appendEvent(session, transition, "verified", "demo-payment-verified"),
    };
  }

  if (transition.type === "payment/challenge-received") {
    if (session.networkMode !== "testnet" || session.state !== "creating" || !session.request) {
      return failClosed(session, transition, "unexpected-payment-challenge");
    }
    if (timestamp(transition.challenge.expiresAt) <= timestamp(transition.at)) {
      return failClosed(session, transition, "payment-challenge-expired", "expired");
    }
    return {
      ...session,
      state: "payment-request-created",
      challenge: transition.challenge,
      events: appendEvent(
        session,
        transition,
        "payment-request-created",
        "payment-challenge-received",
      ),
    };
  }

  if (transition.type === "payment/status-received") {
    if (session.networkMode !== "testnet" || !session.challenge) {
      return failClosed(session, transition, "status-without-payment-challenge");
    }
    if (!challengeMatchesStatus(session.challenge, transition.status)) {
      return failClosed(session, transition, "payment-status-mismatch");
    }
    const knownTransaction = session.verification?.transaction ?? session.status?.transaction;
    if (knownTransaction
      && transition.status.transaction
      && knownTransaction.txid.toLowerCase() !== transition.status.transaction.txid.toLowerCase()) {
      return failClosed(
        { ...session, status: transition.status },
        transition,
        "challenge-transaction-changed",
      );
    }
    if (terminalFailureStates.has(transition.status.state)) {
      const failureState = transition.status.state as Extract<
        TestnetPaymentState,
        "expired" | "failed" | "network-error" | "invalid-payment"
      >;
      return failClosed(
        { ...session, status: transition.status },
        transition,
        transition.status.errorCode ?? "payment-status-failed",
        failureState,
      );
    }

    const currentRank = progressRank[session.state] ?? -1;
    const incomingRank = progressRank[transition.status.state] ?? -1;
    if (incomingRank < currentRank) {
      return {
        ...session,
        state: transition.status.state,
        status: transition.status,
        verification: null,
        entitlement: null,
        events: appendEvent(
          session,
          transition,
          transition.status.state,
          "payment-status-regressed",
        ),
      };
    }

    return {
      ...session,
      state: transition.status.state,
      status: transition.status,
      events: appendEvent(
        session,
        transition,
        transition.status.state,
        `payment-status-${transition.status.state}`,
      ),
    };
  }

  if (transition.type === "payment/verification-received") {
    const { verification } = transition;
    if (session.networkMode !== "testnet" || !session.challenge || !session.status) {
      return failClosed(session, transition, "verification-without-eligible-status");
    }
    if (verification.challengeId !== session.challenge.challengeId
      || verification.network !== "zcash-testnet"
      || verification.providerMode !== "real") {
      return failClosed(session, transition, "payment-verification-mismatch");
    }
    const observedTransaction = session.status.transaction;
    const verifiedTransaction = verification.transaction;
    const statusRank = progressRank[session.status.state] ?? -1;
    const verificationRank = progressRank[verification.state] ?? -1;
    if (!session.status.unlockEligible
      || !observedTransaction
      || !verifiedTransaction
      || observedTransaction.txid.toLowerCase() !== verifiedTransaction.txid.toLowerCase()
      || verification.unlockPolicy !== session.status.unlockPolicy
      || verificationRank < statusRank) {
      return failClosed(session, transition, "payment-verification-provenance-mismatch");
    }
    if (verification.unlockPolicy === "confirmed"
      && (session.status.state !== "verified"
        || session.status.confirmations < session.status.requiredConfirmations)) {
      return failClosed(session, transition, "payment-confirmation-threshold-mismatch");
    }
    if (!verificationMatchesPolicy(verification)) {
      return failClosed(session, transition, "payment-not-verified");
    }
    const entitlement = issueTestnetMetroEntitlement(
      session.challenge,
      verification,
      transition.at,
    );
    if (!entitlement) return failClosed(session, transition, "payment-entitlement-mismatch");

    return {
      ...session,
      state: verification.state,
      verification,
      entitlement,
      events: appendEvent(
        session,
        transition,
        verification.state,
        verification.state === "verified"
          ? "payment-confirmed"
          : "payment-detected-unlock-eligible",
      ),
    };
  }

  if (transition.type === "payment/failed") {
    return failClosed(session, transition, transition.detail, transition.state);
  }

  if (transition.type === "payment/entitlement-consumed") {
    const atMs = timestamp(transition.at);
    if (!hasUsableMetroEntitlement(session, atMs) || !session.entitlement) {
      return failClosed(session, transition, "metro-entitlement-unavailable");
    }
    return {
      ...session,
      entitlement: {
        ...session.entitlement,
        useCount: 1,
      },
      events: appendEvent(session, transition, session.state, "metro-entitlement-consumed"),
    };
  }

  return session;
}
