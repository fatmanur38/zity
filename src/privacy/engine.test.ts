import { describe, expect, it } from "vitest";
import { clampScore, createFieldDisclosure, createPredicateDisclosure, hasCrossServiceReuse } from "./engine";

describe("privacy engine", () => {
  it("marks persistent identifiers and predicate proofs differently", () => {
    const account = createFieldDisclosure("accountId", "metro");
    const pass = createPredicateDisclosure("validPass", "metro-proof");
    expect(account.persistent).toBe(true);
    expect(account.sensitivity).toBeGreaterThan(pass.sensitivity);
    expect(pass.persistent).toBe(false);
  });

  it("detects cross-service identifier reuse", () => {
    const disclosures = [
      createFieldDisclosure("accountId", "metro"),
      createFieldDisclosure("accountId", "cafe"),
    ];
    expect(hasCrossServiceReuse(disclosures, "accountId")).toBe(true);
    expect(hasCrossServiceReuse(disclosures, "email")).toBe(false);
  });

  it("keeps the educational score within its explainable range", () => {
    expect(clampScore(-4)).toBe(3);
    expect(clampScore(61)).toBe(61);
    expect(clampScore(130)).toBe(100);
  });
});
