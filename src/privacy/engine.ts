import type {
  AccountServiceEdge,
  AuthorizationLedger,
  AuthorizationProof,
  AuthorizationUseResult,
  CrossServiceLink,
  Disclosure,
  ExposureProfile,
  FieldDisclosure,
  Inference,
  PersonalField,
  Predicate,
  PredicateDisclosure,
  ScenarioComparison,
  ScenarioRun,
  ServiceId,
} from "../types/game";

const fieldWeight: Record<PersonalField, number> = {
  name: 8,
  email: 13,
  phone: 14,
  age: 4,
  birthDate: 11,
  accountId: 14,
  walletId: 14,
  deviceId: 15,
  location: 9,
  purchaseHistory: 8,
  medicalRelationship: 18,
};

const persistentFields = new Set<PersonalField>([
  "email",
  "phone",
  "accountId",
  "walletId",
  "deviceId",
]);

const profileCache = new WeakMap<ScenarioRun[], ExposureProfile>();
const comparisonCache = new WeakMap<ScenarioRun[], WeakMap<ScenarioRun[], ScenarioComparison>>();

const serviceOrder: ServiceId[] = ["payment", "metro", "cafe", "clinic", "club"];

const sortServices = (services: ServiceId[]): ServiceId[] =>
  [...services].sort((left, right) => serviceOrder.indexOf(left) - serviceOrder.indexOf(right));

const uniqueById = <T extends { id: string }>(items: T[]): T[] => {
  const unique = new Map<string, T>();
  items.forEach((item) => unique.set(item.id, item));
  return [...unique.values()];
};

export const createFieldDisclosure = (
  field: PersonalField,
  serviceId: ServiceId,
): FieldDisclosure => ({
  id: `${serviceId}:field:${field}`,
  kind: "field",
  field,
  serviceId,
  sensitivity: fieldWeight[field],
  persistent: persistentFields.has(field),
});

export const createPredicateDisclosure = (
  predicate: Predicate,
  serviceId: ServiceId,
): PredicateDisclosure => ({
  id: `${serviceId}:predicate:${predicate}`,
  kind: "predicate",
  predicate,
  serviceId,
  sensitivity: 1,
  persistent: false,
});

export const hasCrossServiceReuse = (
  disclosures: Disclosure[],
  field: PersonalField,
): boolean => {
  const services = new Set(
    disclosures
      .filter((item): item is FieldDisclosure => item.kind === "field" && item.field === field)
      .map((item) => item.serviceId),
  );
  return services.size > 1;
};

export const clampScore = (score: number): number => Math.max(0, Math.min(100, score));

function deriveAccountEdges(disclosures: Disclosure[]): AccountServiceEdge[] {
  const identifiersByService = new Map<ServiceId, Set<PersonalField>>();

  disclosures.forEach((disclosure) => {
    if (disclosure.kind !== "field" || !disclosure.persistent) return;
    const identifiers = identifiersByService.get(disclosure.serviceId) ?? new Set<PersonalField>();
    identifiers.add(disclosure.field);
    identifiersByService.set(disclosure.serviceId, identifiers);
  });

  return sortServices([...identifiersByService.keys()]).map((serviceId) => ({
    id: `account:${serviceId}`,
    from: "account",
    to: serviceId,
    identifiers: [...(identifiersByService.get(serviceId) ?? [])].sort(),
    reasonKey: "watcher.reasonPersistentIdentifier",
  }));
}

function deriveCrossServiceLinks(disclosures: Disclosure[]): CrossServiceLink[] {
  const servicesByIdentifier = new Map<PersonalField, Set<ServiceId>>();

  disclosures.forEach((disclosure) => {
    if (disclosure.kind !== "field" || !disclosure.persistent) return;
    const services = servicesByIdentifier.get(disclosure.field) ?? new Set<ServiceId>();
    services.add(disclosure.serviceId);
    servicesByIdentifier.set(disclosure.field, services);
  });

  const links: CrossServiceLink[] = [];
  servicesByIdentifier.forEach((serviceSet, field) => {
    const services = sortServices([...serviceSet]);
    for (let left = 0; left < services.length; left += 1) {
      for (let right = left + 1; right < services.length; right += 1) {
        const pair: [ServiceId, ServiceId] = [services[left], services[right]];
        links.push({
          id: `${field}:${pair[0]}:${pair[1]}`,
          services: pair,
          via: field,
          reasonKey: "watcher.reasonCrossServiceIdentifier",
        });
      }
    }
  });

  return links.sort((left, right) => left.id.localeCompare(right.id));
}

function deriveInferences(links: CrossServiceLink[]): Inference[] {
  const linksService = (serviceId: ServiceId) =>
    links.filter((link) => link.services.includes(serviceId));
  const hasPair = (first: ServiceId, second: ServiceId) =>
    links.some((link) => link.services.includes(first) && link.services.includes(second));
  const inferences: Inference[] = [];

  if (hasPair("metro", "cafe")) {
    inferences.push({
      id: "daily-routine",
      sourceServices: ["metro", "cafe"],
      titleKey: "inference.dailyRoutine.title",
      detailKey: "inference.dailyRoutine.detail",
      sensitivity: 8,
    });
  }

  const clinicLinks = linksService("clinic");
  if (clinicLinks.length > 0) {
    inferences.push({
      id: "health-activity",
      sourceServices: sortServices([...new Set<ServiceId>([
        "clinic",
        ...clinicLinks.flatMap((link) => link.services.filter((service) => service !== "clinic")),
      ])]),
      titleKey: "inference.healthActivity.title",
      detailKey: "inference.healthActivity.detail",
      sensitivity: 18,
    });
  }

  const clubLinks = linksService("club");
  if (clubLinks.length > 0) {
    inferences.push({
      id: "nightlife-activity",
      sourceServices: sortServices([...new Set<ServiceId>([
        "club",
        ...clubLinks.flatMap((link) => link.services.filter((service) => service !== "club")),
      ])]),
      titleKey: "inference.nightlifeActivity.title",
      detailKey: "inference.nightlifeActivity.detail",
      sensitivity: 12,
    });
  }

  return inferences;
}

export function deriveProfile(runs: ScenarioRun[]): ExposureProfile {
  const cached = profileCache.get(runs);
  if (cached) return cached;

  const normalizedRuns = uniqueById(runs);
  const disclosures = uniqueById(normalizedRuns.flatMap((run) => run.disclosures));
  const accountEdges = deriveAccountEdges(disclosures);
  const crossServiceLinks = deriveCrossServiceLinks(disclosures);
  const inferences = deriveInferences(crossServiceLinks);
  const fieldDisclosures = disclosures.filter(
    (disclosure): disclosure is FieldDisclosure => disclosure.kind === "field",
  );
  const predicateDisclosures = disclosures.filter(
    (disclosure): disclosure is PredicateDisclosure => disclosure.kind === "predicate",
  );
  const persistentDisclosures = fieldDisclosures.filter((disclosure) => disclosure.persistent);

  const profile: ExposureProfile = {
    disclosures,
    accountEdges,
    crossServiceLinks,
    inferences,
    metrics: {
      score: clampScore(normalizedRuns.reduce((total, run) => total + run.scoreImpact, 0)),
      disclosedFieldCount: fieldDisclosures.length,
      predicateCount: predicateDisclosures.length,
      persistentIdentifierCount: new Set(
        persistentDisclosures.map((disclosure) => disclosure.field),
      ).size,
      persistentDisclosureCount: persistentDisclosures.length,
      linkedServiceCount: accountEdges.length,
      crossServiceLinkCount: crossServiceLinks.length,
      inferenceCount: inferences.length,
    },
  };
  profileCache.set(runs, profile);
  return profile;
}

export function compareProfiles(
  baselineRuns: ScenarioRun[],
  redesignedRuns: ScenarioRun[],
): ScenarioComparison {
  const cached = comparisonCache.get(baselineRuns)?.get(redesignedRuns);
  if (cached) return cached;

  const baseline = deriveProfile(baselineRuns);
  const redesigned = deriveProfile(redesignedRuns);
  const redesignedDisclosureIds = new Set(redesigned.disclosures.map((item) => item.id));
  const baselineDisclosureIds = new Set(baseline.disclosures.map((item) => item.id));
  const redesignedEdgeIds = new Set(redesigned.accountEdges.map((item) => item.id));
  const redesignedLinkIds = new Set(redesigned.crossServiceLinks.map((item) => item.id));
  const redesignedInferenceIds = new Set(redesigned.inferences.map((item) => item.id));

  const comparison: ScenarioComparison = {
    baseline,
    redesigned,
    removedDisclosureIds: baseline.disclosures
      .filter((item) => !redesignedDisclosureIds.has(item.id))
      .map((item) => item.id),
    addedDisclosureIds: redesigned.disclosures
      .filter((item) => !baselineDisclosureIds.has(item.id))
      .map((item) => item.id),
    removedAccountEdgeIds: baseline.accountEdges
      .filter((item) => !redesignedEdgeIds.has(item.id))
      .map((item) => item.id),
    removedCrossServiceLinkIds: baseline.crossServiceLinks
      .filter((item) => !redesignedLinkIds.has(item.id))
      .map((item) => item.id),
    removedInferenceIds: baseline.inferences
      .filter((item) => !redesignedInferenceIds.has(item.id))
      .map((item) => item.id),
    scoreReduction: Math.max(0, baseline.metrics.score - redesigned.metrics.score),
  };
  const byRedesign = comparisonCache.get(baselineRuns) ?? new WeakMap<ScenarioRun[], ScenarioComparison>();
  byRedesign.set(redesignedRuns, comparison);
  comparisonCache.set(baselineRuns, byRedesign);
  return comparison;
}

export function consumeAuthorization(
  authorization: AuthorizationProof,
  ledger: AuthorizationLedger,
): AuthorizationUseResult {
  const previousUses = ledger[authorization.id] ?? 0;
  const alreadyUsed = authorization.singleUse && previousUses > 0;
  if (alreadyUsed) {
    return {
      authorizationId: authorization.id,
      granted: false,
      reason: "already-used",
      identityRevealed: authorization.exposesIdentity,
      ledger: { ...ledger },
    };
  }

  const nextLedger = { ...ledger, [authorization.id]: previousUses + 1 };
  return {
    authorizationId: authorization.id,
    granted: true,
    reason: "accepted",
    identityRevealed: authorization.exposesIdentity,
    ledger: nextLedger,
  };
}
