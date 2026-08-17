import { describe, expect, it } from "vitest";
import {
  compareProfiles,
  consumeAuthorization,
  createFieldDisclosure,
  createPredicateDisclosure,
  deriveProfile,
  hasCrossServiceReuse,
} from "./engine";
import { createBaselineRun, simulateScenario } from "./scenarios";

describe("privacy engine", () => {
  it("models fields and predicate proofs as distinct disclosure variants", () => {
    const account = createFieldDisclosure("accountId", "metro");
    const pass = createPredicateDisclosure("validPass", "metro");

    expect(account.kind).toBe("field");
    expect(account.persistent).toBe(true);
    expect(pass.kind).toBe("predicate");
    expect(pass.persistent).toBe(false);
    expect(account.sensitivity).toBeGreaterThan(pass.sensitivity);
  });

  it("authorizes both standard and minimum designs for the same requirement", () => {
    const standard = simulateScenario("clinic", "standard", "baseline");
    const minimum = simulateScenario("clinic", "minimum", "redesigned");

    expect(standard.authorized).toBe(true);
    expect(minimum.authorized).toBe(true);
    expect(standard.requirements).toEqual(minimum.requirements);
    expect(standard.disclosures.some((item) => item.kind === "field")).toBe(true);
    expect(minimum.disclosures.every((item) => item.kind === "predicate")).toBe(true);
  });

  it("creates a cross-service link only when a persistent identifier is reused", () => {
    const standard = deriveProfile([
      createBaselineRun("metro"),
      createBaselineRun("cafe"),
    ]);
    const minimum = deriveProfile([
      simulateScenario("metro", "minimum", "redesigned"),
      simulateScenario("cafe", "standard", "redesigned"),
    ]);

    expect(hasCrossServiceReuse(standard.disclosures, "accountId")).toBe(true);
    expect(standard.crossServiceLinks.length).toBeGreaterThan(0);
    expect(hasCrossServiceReuse(minimum.disclosures, "accountId")).toBe(false);
    expect(minimum.crossServiceLinks).toHaveLength(0);
  });

  it("removes the clinic inference when appointment validity is not linked to an account", () => {
    const baseline = deriveProfile([
      createBaselineRun("metro"),
      createBaselineRun("cafe"),
      createBaselineRun("clinic"),
    ]);
    const redesigned = deriveProfile([
      simulateScenario("metro", "minimum", "redesigned"),
      simulateScenario("cafe", "standard", "redesigned"),
      simulateScenario("clinic", "minimum", "redesigned"),
    ]);

    expect(baseline.inferences.some((item) => item.id === "health-activity")).toBe(true);
    expect(redesigned.inferences.some((item) => item.id === "health-activity")).toBe(false);
  });

  it("denies identity-free reuse through the authorization ledger", () => {
    const authorization = simulateScenario("metro", "minimum", "redesigned").authorization;
    expect(authorization).toBeDefined();
    if (!authorization) return;

    const firstUse = consumeAuthorization(authorization, {});
    const secondUse = consumeAuthorization(authorization, firstUse.ledger);

    expect(firstUse.granted).toBe(true);
    expect(secondUse.granted).toBe(false);
    expect(secondUse.reason).toBe("already-used");
    expect(secondUse.identityRevealed).toBe(false);
  });

  it("derives meaningful profile and comparison differences", () => {
    const baselineRuns = ["metro", "cafe", "clinic", "club"].map((scenario) =>
      createBaselineRun(scenario as "metro" | "cafe" | "clinic" | "club"));
    const redesignedRuns = [
      simulateScenario("metro", "minimum", "redesigned"),
      simulateScenario("cafe", "standard", "redesigned"),
      simulateScenario("clinic", "minimum", "redesigned"),
      simulateScenario("club", "minimum", "redesigned"),
    ];
    const comparison = compareProfiles(baselineRuns, redesignedRuns);

    expect(comparison.baseline.metrics.score).toBe(90);
    expect(comparison.redesigned.metrics.score).toBe(20);
    expect(comparison.scoreReduction).toBe(70);
    expect(comparison.removedDisclosureIds.length).toBeGreaterThan(0);
    expect(comparison.removedCrossServiceLinkIds.length).toBeGreaterThan(0);
    expect(comparison.removedInferenceIds).toContain("health-activity");
  });
});
