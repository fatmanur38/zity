export type Language = "en" | "tr";

export type PersonalField =
  | "name"
  | "email"
  | "phone"
  | "age"
  | "birthDate"
  | "accountId"
  | "walletId"
  | "deviceId"
  | "location"
  | "purchaseHistory"
  | "medicalRelationship";

export type Predicate =
  | "validTicket"
  | "validAppointment"
  | "validPass"
  | "paymentAuthorized"
  | "ageOver18"
  | "validMembership";

export type Requirement = {
  predicate: Predicate;
  labelKey: string;
};

export type ServiceId = "payment" | "metro" | "cafe" | "clinic" | "club";
export type ScenarioId = "metro" | "cafe" | "clinic" | "club";
export type RethinkScenarioId = Exclude<ScenarioId, "cafe">;
export type DesignChoice = "standard" | "hybrid" | "minimum";
export type TrackId = "baseline" | "redesigned";
export type ScenarioTone = "warning" | "neutral" | "success";

export type CityService = {
  id: ServiceId;
  nameKey: string;
  actualRequirements: Requirement[];
  standardRequestedFields: PersonalField[];
  minimumDisclosureRequirements: Requirement[];
};

type DisclosureBase = {
  id: string;
  serviceId: ServiceId;
  sensitivity: number;
};

export type FieldDisclosure = DisclosureBase & {
  kind: "field";
  field: PersonalField;
  persistent: boolean;
};

export type PredicateDisclosure = DisclosureBase & {
  kind: "predicate";
  predicate: Predicate;
  persistent: false;
};

export type Disclosure = FieldDisclosure | PredicateDisclosure;

export type AuthorizationProof = {
  id: string;
  scope: ServiceId;
  singleUse: boolean;
  exposesIdentity: boolean;
};

export type AuthorizationLedger = Record<string, number>;

export type AuthorizationUseResult = {
  authorizationId: string;
  granted: boolean;
  reason: "accepted" | "already-used";
  identityRevealed: boolean;
  ledger: AuthorizationLedger;
};

export type ScenarioOptionDefinition = {
  choice: DesignChoice;
  titleKey: string;
  bodyKey: string;
  revealsKeys: string[];
  outcomeTitleKey: string;
  outcomeDetailKey: string;
  tone: ScenarioTone;
  fields: PersonalField[];
  predicates: Predicate[];
  satisfies: Predicate[];
  scoreImpact: number;
  authorization?: AuthorizationProof;
};

export type ScenarioDefinition = {
  id: ScenarioId;
  serviceId: ServiceId;
  nameKey: string;
  requirements: Requirement[];
  requirementKeys: string[];
  options: Partial<Record<DesignChoice, ScenarioOptionDefinition>>;
};

export type ScenarioRun = {
  id: string;
  track: TrackId;
  scenarioId: ScenarioId;
  serviceId: ServiceId;
  choice: DesignChoice;
  authorized: boolean;
  requirements: Predicate[];
  disclosures: Disclosure[];
  scoreImpact: number;
  outcomeTitleKey: string;
  outcomeDetailKey: string;
  tone: ScenarioTone;
  authorization?: AuthorizationProof;
};

export type AccountServiceEdge = {
  id: string;
  from: "account";
  to: ServiceId;
  identifiers: PersonalField[];
  reasonKey: string;
};

export type CrossServiceLink = {
  id: string;
  services: [ServiceId, ServiceId];
  via: PersonalField;
  reasonKey: string;
};

export type InferenceId = "daily-routine" | "health-activity" | "nightlife-activity";

export type Inference = {
  id: InferenceId;
  sourceServices: ServiceId[];
  titleKey: string;
  detailKey: string;
  sensitivity: number;
};

export type ExposureMetrics = {
  score: number;
  disclosedFieldCount: number;
  predicateCount: number;
  persistentIdentifierCount: number;
  persistentDisclosureCount: number;
  linkedServiceCount: number;
  crossServiceLinkCount: number;
  inferenceCount: number;
};

export type ExposureProfile = {
  disclosures: Disclosure[];
  accountEdges: AccountServiceEdge[];
  crossServiceLinks: CrossServiceLink[];
  inferences: Inference[];
  metrics: ExposureMetrics;
};

export type ScenarioComparison = {
  baseline: ExposureProfile;
  redesigned: ExposureProfile;
  removedDisclosureIds: string[];
  addedDisclosureIds: string[];
  removedAccountEdgeIds: string[];
  removedCrossServiceLinkIds: string[];
  removedInferenceIds: InferenceId[];
  scoreReduction: number;
};

export type StoryStage =
  | "spawn"
  | "metro-ticket"
  | "metro-gate"
  | "cafe"
  | "clinic"
  | "perspective-shift"
  | "clinic-rethink"
  | "clinic-compare"
  | "metro-rethink"
  | "metro-checkpoint"
  | "metro-compare"
  | "metro-reuse"
  | "club"
  | "club-compare"
  | "results";

export type InteractionId =
  | "metro-kiosk"
  | "metro-gate"
  | "cafe-counter"
  | "clinic-terminal"
  | "minimum-disclosure"
  | "metro-proof-gate"
  | "metro-reuse-gate"
  | "club-door"
  | "results";

export type WatcherEvent = {
  id: string;
  titleKey: string;
  detailKey: string;
  delta: number;
  kind: "neutral" | "warning" | "blocked" | "success";
  scenarioId?: ScenarioId;
  choice?: DesignChoice;
  removedLinks?: number;
  removedInferences?: number;
};

export type InteractableDefinition = {
  id: InteractionId;
  assetKey: AssetKey;
  labelKey: string;
  position: { x: number; y: number };
  interactionPoint: { x: number; y: number };
  interactionRadius: number;
  stages: StoryStage[];
  type: "terminal" | "gate" | "building";
};
import type { AssetKey } from "../game/assets/manifest";
