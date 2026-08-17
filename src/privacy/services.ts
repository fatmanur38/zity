import type { CityService } from "../types/game";

export const cityServices: Record<string, CityService> = {
  metro: {
    id: "metro",
    nameKey: "services.metro",
    actualRequirements: [{ predicate: "validTicket", labelKey: "requirements.validTicket" }],
    standardRequestedFields: ["accountId", "purchaseHistory", "location"],
    minimumDisclosureRequirements: [{ predicate: "validTicket", labelKey: "requirements.validTicket" }],
  },
  cafe: {
    id: "cafe",
    nameKey: "services.cafe",
    actualRequirements: [],
    standardRequestedFields: ["accountId", "purchaseHistory", "location"],
    minimumDisclosureRequirements: [],
  },
  clinic: {
    id: "clinic",
    nameKey: "services.clinic",
    actualRequirements: [{ predicate: "validAppointment", labelKey: "requirements.validAppointment" }],
    standardRequestedFields: ["accountId", "medicalRelationship", "location"],
    minimumDisclosureRequirements: [{ predicate: "validAppointment", labelKey: "requirements.validAppointment" }],
  },
  club: {
    id: "club",
    nameKey: "services.club",
    actualRequirements: [
      { predicate: "ageOver18", labelKey: "requirements.ageOver18" },
      { predicate: "validTicket", labelKey: "requirements.validTicket" },
    ],
    standardRequestedFields: ["name", "birthDate", "email", "accountId"],
    minimumDisclosureRequirements: [
      { predicate: "ageOver18", labelKey: "requirements.ageOver18" },
      { predicate: "validTicket", labelKey: "requirements.validTicket" },
    ],
  },
};
