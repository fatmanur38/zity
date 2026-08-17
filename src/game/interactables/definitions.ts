import type { InteractableDefinition, StoryStage } from "../../types/game";

export const interactableDefinitions: InteractableDefinition[] = [
  {
    id: "metro-kiosk",
    assetKey: "metroKiosk",
    labelKey: "world.kiosk",
    position: { x: 222, y: 354 },
    interactionPoint: { x: 222, y: 418 },
    interactionRadius: 58,
    stages: ["spawn", "metro-ticket"],
    type: "terminal",
  },
  {
    id: "metro-gate",
    assetKey: "metroGate",
    labelKey: "world.gate",
    position: { x: 378, y: 354 },
    interactionPoint: { x: 378, y: 420 },
    interactionRadius: 60,
    stages: ["metro-gate"],
    type: "gate",
  },
  {
    id: "cafe-counter",
    assetKey: "cafeCounter",
    labelKey: "world.cafe",
    position: { x: 588, y: 324 },
    interactionPoint: { x: 588, y: 402 },
    interactionRadius: 66,
    stages: ["cafe"],
    type: "building",
  },
  {
    id: "clinic-terminal",
    assetKey: "clinicTerminal",
    labelKey: "world.clinic",
    position: { x: 798, y: 260 },
    interactionPoint: { x: 798, y: 344 },
    interactionRadius: 64,
    stages: ["clinic"],
    type: "terminal",
  },
  {
    id: "metro-proof-gate",
    assetKey: "metroGate",
    labelKey: "world.proofGate",
    position: { x: 678, y: 470 },
    interactionPoint: { x: 610, y: 470 },
    interactionRadius: 64,
    stages: ["metro-proof", "metro-reuse"],
    type: "gate",
  },
  {
    id: "club-door",
    assetKey: "clubDoor",
    labelKey: "world.club",
    position: { x: 348, y: 174 },
    interactionPoint: { x: 348, y: 258 },
    interactionRadius: 66,
    stages: ["club"],
    type: "building",
  },
];

export const isDefinitionActive = (
  definition: InteractableDefinition,
  stage: StoryStage,
): boolean => definition.stages.includes(stage);
