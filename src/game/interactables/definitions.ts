import type { InteractableDefinition, StoryStage } from "../../types/game";

export const interactableDefinitions: InteractableDefinition[] = [
  {
    id: "metro-kiosk",
    assetKey: "metroKiosk",
    labelKey: "world.kiosk",
    position: { x: 146, y: 454 },
    interactionPoint: { x: 146, y: 500 },
    interactionRadius: 58,
    stages: ["spawn", "metro-ticket"],
    type: "terminal",
  },
  {
    id: "metro-gate",
    assetKey: "metroGate",
    labelKey: "world.gate",
    position: { x: 252, y: 454 },
    interactionPoint: { x: 252, y: 500 },
    interactionRadius: 60,
    stages: ["metro-gate"],
    type: "gate",
  },
  {
    id: "cafe-counter",
    assetKey: "cafeCounter",
    labelKey: "world.cafe",
    position: { x: 470, y: 306 },
    interactionPoint: { x: 470, y: 340 },
    interactionRadius: 66,
    stages: ["cafe"],
    type: "building",
  },
  {
    id: "clinic-terminal",
    assetKey: "clinicTerminal",
    labelKey: "world.clinic",
    position: { x: 790, y: 296 },
    interactionPoint: { x: 790, y: 332 },
    interactionRadius: 64,
    stages: ["clinic", "clinic-rethink"],
    type: "terminal",
  },
  {
    id: "metro-proof-gate",
    assetKey: "metroGate",
    labelKey: "world.proofGate",
    position: { x: 350, y: 454 },
    interactionPoint: { x: 350, y: 500 },
    interactionRadius: 64,
    stages: ["metro-rethink", "metro-reuse"],
    type: "gate",
  },
  {
    id: "club-door",
    assetKey: "clubDoor",
    labelKey: "world.club",
    position: { x: 150, y: 292 },
    interactionPoint: { x: 150, y: 328 },
    interactionRadius: 66,
    stages: ["club"],
    type: "building",
  },
];

export const isDefinitionActive = (
  definition: InteractableDefinition,
  stage: StoryStage,
): boolean => definition.stages.includes(stage);
