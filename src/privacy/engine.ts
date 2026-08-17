import type { Disclosure, PersonalField, Predicate, ServiceId } from "../types/game";

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

export const createFieldDisclosure = (
  field: PersonalField,
  serviceId: ServiceId,
): Disclosure => ({
  id: `${serviceId}:${field}`,
  field,
  serviceId,
  sensitivity: fieldWeight[field],
  persistent: persistentFields.has(field),
});

export const createPredicateDisclosure = (
  predicate: Predicate,
  serviceId: ServiceId,
): Disclosure => ({
  id: `${serviceId}:predicate:${predicate}`,
  predicate,
  serviceId,
  sensitivity: 1,
  persistent: false,
});

export const hasCrossServiceReuse = (disclosures: Disclosure[], field: PersonalField): boolean => {
  const services = new Set(
    disclosures.filter((item) => item.field === field).map((item) => item.serviceId),
  );
  return services.size > 1;
};

export const clampScore = (score: number): number => Math.max(3, Math.min(100, score));
