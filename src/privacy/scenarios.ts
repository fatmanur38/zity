import { createFieldDisclosure, createPredicateDisclosure } from "./engine";
import type {
  DesignChoice,
  Predicate,
  RethinkScenarioId,
  ScenarioDefinition,
  ScenarioId,
  ScenarioRun,
  TrackId,
} from "../types/game";

const metroAuthorization = (choice: DesignChoice) => ({
  id: choice === "minimum" ? "metro-pass-M91" : `metro-pass-${choice}`,
  scope: "metro" as const,
  singleUse: true,
  exposesIdentity: choice !== "minimum",
});

export const scenarioRegistry = {
  metro: {
    id: "metro",
    serviceId: "metro",
    nameKey: "services.metro",
    requirements: [
      { predicate: "validTicket", labelKey: "requirements.validTicket" },
    ],
    requirementKeys: ["requirements.validTicket"],
    options: {
      standard: {
        choice: "standard",
        titleKey: "scenario.metro.option.standard.title",
        bodyKey: "scenario.metro.option.standard.body",
        revealsKeys: [
          "privacy.predicate.validTicket",
          "privacy.field.accountId",
          "privacy.field.purchaseHistory",
          "privacy.field.location",
        ],
        outcomeTitleKey: "scenario.metro.outcome.standard.title",
        outcomeDetailKey: "scenario.metro.outcome.standard.detail",
        tone: "warning",
        fields: ["accountId", "purchaseHistory", "location"],
        predicates: ["validTicket"],
        satisfies: ["validTicket"],
        scoreImpact: 20,
        authorization: metroAuthorization("standard"),
      },
      hybrid: {
        choice: "hybrid",
        titleKey: "scenario.metro.option.hybrid.title",
        bodyKey: "scenario.metro.option.hybrid.body",
        revealsKeys: ["privacy.predicate.validTicket", "privacy.field.accountId"],
        outcomeTitleKey: "scenario.metro.outcome.hybrid.title",
        outcomeDetailKey: "scenario.metro.outcome.hybrid.detail",
        tone: "neutral",
        fields: ["accountId"],
        predicates: ["validTicket"],
        satisfies: ["validTicket"],
        scoreImpact: 10,
        authorization: metroAuthorization("hybrid"),
      },
      minimum: {
        choice: "minimum",
        titleKey: "scenario.metro.option.minimum.title",
        bodyKey: "scenario.metro.option.minimum.body",
        revealsKeys: ["privacy.predicate.validTicket"],
        outcomeTitleKey: "scenario.metro.outcome.minimum.title",
        outcomeDetailKey: "scenario.metro.outcome.minimum.detail",
        tone: "success",
        fields: [],
        predicates: ["validTicket"],
        satisfies: ["validTicket"],
        scoreImpact: 3,
        authorization: metroAuthorization("minimum"),
      },
    },
  },
  cafe: {
    id: "cafe",
    serviceId: "cafe",
    nameKey: "services.cafe",
    requirements: [
      { predicate: "paymentAuthorized", labelKey: "requirements.paymentAuthorized" },
    ],
    requirementKeys: ["requirements.paymentAuthorized"],
    options: {
      standard: {
        choice: "standard",
        titleKey: "scenario.cafe.option.standard.title",
        bodyKey: "scenario.cafe.option.standard.body",
        revealsKeys: [
          "privacy.predicate.paymentAuthorized",
          "privacy.field.accountId",
          "privacy.field.purchaseHistory",
          "privacy.field.location",
        ],
        outcomeTitleKey: "scenario.cafe.outcome.standard.title",
        outcomeDetailKey: "scenario.cafe.outcome.standard.detail",
        tone: "warning",
        fields: ["accountId", "purchaseHistory", "location"],
        predicates: ["paymentAuthorized"],
        satisfies: ["paymentAuthorized"],
        scoreImpact: 10,
      },
    },
  },
  clinic: {
    id: "clinic",
    serviceId: "clinic",
    nameKey: "services.clinic",
    requirements: [
      { predicate: "validAppointment", labelKey: "requirements.validAppointment" },
    ],
    requirementKeys: ["requirements.validAppointment"],
    options: {
      standard: {
        choice: "standard",
        titleKey: "scenario.clinic.option.standard.title",
        bodyKey: "scenario.clinic.option.standard.body",
        revealsKeys: [
          "privacy.predicate.validAppointment",
          "privacy.field.accountId",
          "privacy.field.medicalRelationship",
          "privacy.field.location",
        ],
        outcomeTitleKey: "scenario.clinic.outcome.standard.title",
        outcomeDetailKey: "scenario.clinic.outcome.standard.detail",
        tone: "warning",
        fields: ["accountId", "medicalRelationship", "location"],
        predicates: ["validAppointment"],
        satisfies: ["validAppointment"],
        scoreImpact: 30,
      },
      hybrid: {
        choice: "hybrid",
        titleKey: "scenario.clinic.option.hybrid.title",
        bodyKey: "scenario.clinic.option.hybrid.body",
        revealsKeys: ["privacy.predicate.validAppointment", "privacy.field.accountId"],
        outcomeTitleKey: "scenario.clinic.outcome.hybrid.title",
        outcomeDetailKey: "scenario.clinic.outcome.hybrid.detail",
        tone: "neutral",
        fields: ["accountId"],
        predicates: ["validAppointment"],
        satisfies: ["validAppointment"],
        scoreImpact: 15,
      },
      minimum: {
        choice: "minimum",
        titleKey: "scenario.clinic.option.minimum.title",
        bodyKey: "scenario.clinic.option.minimum.body",
        revealsKeys: ["privacy.predicate.validAppointment"],
        outcomeTitleKey: "scenario.clinic.outcome.minimum.title",
        outcomeDetailKey: "scenario.clinic.outcome.minimum.detail",
        tone: "success",
        fields: [],
        predicates: ["validAppointment"],
        satisfies: ["validAppointment"],
        scoreImpact: 3,
      },
    },
  },
  club: {
    id: "club",
    serviceId: "club",
    nameKey: "services.club",
    requirements: [
      { predicate: "ageOver18", labelKey: "requirements.ageOver18" },
      { predicate: "validTicket", labelKey: "requirements.validTicket" },
    ],
    requirementKeys: ["requirements.ageOver18", "requirements.validTicket"],
    options: {
      standard: {
        choice: "standard",
        titleKey: "scenario.club.option.standard.title",
        bodyKey: "scenario.club.option.standard.body",
        revealsKeys: [
          "privacy.predicate.ageOver18",
          "privacy.predicate.validTicket",
          "privacy.field.name",
          "privacy.field.birthDate",
          "privacy.field.email",
          "privacy.field.accountId",
        ],
        outcomeTitleKey: "scenario.club.outcome.standard.title",
        outcomeDetailKey: "scenario.club.outcome.standard.detail",
        tone: "warning",
        fields: ["name", "birthDate", "email", "accountId"],
        predicates: ["ageOver18", "validTicket"],
        satisfies: ["ageOver18", "validTicket"],
        scoreImpact: 30,
      },
      hybrid: {
        choice: "hybrid",
        titleKey: "scenario.club.option.hybrid.title",
        bodyKey: "scenario.club.option.hybrid.body",
        revealsKeys: [
          "privacy.predicate.ageOver18",
          "privacy.predicate.validTicket",
          "privacy.field.accountId",
        ],
        outcomeTitleKey: "scenario.club.outcome.hybrid.title",
        outcomeDetailKey: "scenario.club.outcome.hybrid.detail",
        tone: "neutral",
        fields: ["accountId"],
        predicates: ["ageOver18", "validTicket"],
        satisfies: ["ageOver18", "validTicket"],
        scoreImpact: 14,
      },
      minimum: {
        choice: "minimum",
        titleKey: "scenario.club.option.minimum.title",
        bodyKey: "scenario.club.option.minimum.body",
        revealsKeys: ["privacy.predicate.ageOver18", "privacy.predicate.validTicket"],
        outcomeTitleKey: "scenario.club.outcome.minimum.title",
        outcomeDetailKey: "scenario.club.outcome.minimum.detail",
        tone: "success",
        fields: [],
        predicates: ["ageOver18", "validTicket"],
        satisfies: ["ageOver18", "validTicket"],
        scoreImpact: 4,
      },
    },
  },
} satisfies Record<ScenarioId, ScenarioDefinition>;

export const rethinkScenarioIds: RethinkScenarioId[] = ["clinic", "metro", "club"];

export function simulateScenario(
  scenarioId: ScenarioId,
  choice: DesignChoice,
  track: TrackId,
): ScenarioRun {
  const definition: ScenarioDefinition = scenarioRegistry[scenarioId];
  const option = definition.options[choice];
  if (!option) {
    throw new Error(`Scenario "${scenarioId}" does not support the "${choice}" design.`);
  }

  const requiredPredicates = definition.requirements.map((requirement) => requirement.predicate);
  const satisfied = new Set<Predicate>(option.satisfies);

  return {
    id: `${track}:${scenarioId}`,
    track,
    scenarioId,
    serviceId: definition.serviceId,
    choice,
    authorized: requiredPredicates.every((predicate) => satisfied.has(predicate)),
    requirements: requiredPredicates,
    disclosures: [
      ...option.fields.map((field) => createFieldDisclosure(field, definition.serviceId)),
      ...option.predicates.map((predicate) => createPredicateDisclosure(predicate, definition.serviceId)),
    ],
    scoreImpact: option.scoreImpact,
    outcomeTitleKey: option.outcomeTitleKey,
    outcomeDetailKey: option.outcomeDetailKey,
    tone: option.tone,
    authorization: option.authorization,
  };
}

export function createBaselineRun(scenarioId: ScenarioId): ScenarioRun {
  return simulateScenario(scenarioId, "standard", "baseline");
}

export function cloneRunForRedesign(run: ScenarioRun): ScenarioRun {
  return simulateScenario(run.scenarioId, run.choice, "redesigned");
}
