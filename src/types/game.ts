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
  | "ageOver18"
  | "validMembership";

export type Requirement = {
  predicate: Predicate;
  labelKey: string;
};

export type CityService = {
  id: ServiceId;
  nameKey: string;
  actualRequirements: Requirement[];
  standardRequestedFields: PersonalField[];
  minimumDisclosureRequirements: Requirement[];
};

export type ServiceId = "payment" | "metro" | "cafe" | "clinic" | "metro-proof" | "club";

export type Disclosure = {
  id: string;
  field?: PersonalField;
  predicate?: Predicate;
  sensitivity: number;
  persistent: boolean;
  serviceId: ServiceId;
};

export type Correlation = {
  id: string;
  from: ServiceId | "account";
  to: ServiceId | "account";
  reasonKey: string;
};

export type StoryStage =
  | "spawn"
  | "metro-ticket"
  | "metro-gate"
  | "cafe"
  | "clinic"
  | "minimum-disclosure"
  | "metro-proof"
  | "metro-reuse"
  | "club"
  | "results"
  | "attacker";

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
};

export type InteractableDefinition = {
  id: InteractionId;
  assetKey: string;
  labelKey: string;
  position: { x: number; y: number };
  interactionPoint: { x: number; y: number };
  interactionRadius: number;
  stages: StoryStage[];
  type: "terminal" | "gate" | "building";
};
