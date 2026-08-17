export type AssetKey =
  | "player"
  | "metroKiosk"
  | "metroGate"
  | "metroGateOpen"
  | "metroGateDenied"
  | "cafeCounter"
  | "clinicTerminal"
  | "clubDoor"
  | "barista"
  | "clinicReceptionist"
  | "clubSecurity"
  | "officeWorker"
  | "watcher"
  | "cityMarker"
  | "proofEffect"
  | "tree"
  | "streetLamp"
  | "bench"
  | "trashBin"
  | "bicycle"
  | "planter"
  | "hydrant"
  | "trafficLight";

export type AssetDefinition = {
  key: AssetKey;
  path: string;
  width: number;
  height: number;
  color: number;
  accent: number;
  shape: "person" | "terminal" | "gate" | "building" | "icon" | "prop";
};

export const assetManifest: Record<AssetKey, AssetDefinition> = {
  player: {
    key: "player",
    path: "/assets/player/idle.png",
    width: 26,
    height: 38,
    color: 0xf4f0e5,
    accent: 0xd6ff3f,
    shape: "person",
  },
  metroKiosk: {
    key: "metroKiosk",
    path: "/assets/metro/kiosk.png",
    width: 42,
    height: 54,
    color: 0x253547,
    accent: 0x57d6ff,
    shape: "terminal",
  },
  metroGate: {
    key: "metroGate",
    path: "/assets/metro/gate-closed.png",
    width: 56,
    height: 54,
    color: 0x253547,
    accent: 0xd6ff3f,
    shape: "gate",
  },
  metroGateOpen: {
    key: "metroGateOpen",
    path: "/assets/metro/gate-open.png",
    width: 56,
    height: 54,
    color: 0x253547,
    accent: 0x79f2d0,
    shape: "gate",
  },
  metroGateDenied: {
    key: "metroGateDenied",
    path: "/assets/metro/gate-denied.png",
    width: 56,
    height: 54,
    color: 0x3a2027,
    accent: 0xff695e,
    shape: "gate",
  },
  cafeCounter: {
    key: "cafeCounter",
    path: "/assets/cafe/counter.png",
    width: 76,
    height: 58,
    color: 0x7b4f34,
    accent: 0xffb36b,
    shape: "building",
  },
  clinicTerminal: {
    key: "clinicTerminal",
    path: "/assets/clinic/facade.png",
    width: 58,
    height: 68,
    color: 0x2d6670,
    accent: 0x79f2d0,
    shape: "terminal",
  },
  clubDoor: {
    key: "clubDoor",
    path: "/assets/club/facade.png",
    width: 68,
    height: 74,
    color: 0x4d285f,
    accent: 0xf56ddd,
    shape: "building",
  },
  barista: {
    key: "barista",
    path: "/assets/npc/barista.png",
    width: 26,
    height: 40,
    color: 0x79513c,
    accent: 0xffb36b,
    shape: "person",
  },
  clinicReceptionist: {
    key: "clinicReceptionist",
    path: "/assets/npc/clinic-receptionist.png",
    width: 26,
    height: 40,
    color: 0x2d6670,
    accent: 0x79f2d0,
    shape: "person",
  },
  clubSecurity: {
    key: "clubSecurity",
    path: "/assets/npc/club-security.png",
    width: 28,
    height: 42,
    color: 0x4d285f,
    accent: 0xf56ddd,
    shape: "person",
  },
  officeWorker: {
    key: "officeWorker",
    path: "/assets/npc/office-worker.png",
    width: 26,
    height: 40,
    color: 0x3a4650,
    accent: 0x57d6ff,
    shape: "person",
  },
  watcher: {
    key: "watcher",
    path: "/assets/watcher/idle.png",
    width: 34,
    height: 24,
    color: 0x151922,
    accent: 0xff695e,
    shape: "icon",
  },
  cityMarker: {
    key: "cityMarker",
    path: "/assets/ui/destination-marker.png",
    width: 24,
    height: 32,
    color: 0xd6ff3f,
    accent: 0xffffff,
    shape: "icon",
  },
  proofEffect: {
    key: "proofEffect",
    path: "/assets/effects/proof.png",
    width: 32,
    height: 32,
    color: 0x79f2d0,
    accent: 0xd6ff3f,
    shape: "icon",
  },
  tree: {
    key: "tree",
    path: "/assets/props/tree.png",
    width: 34,
    height: 52,
    color: 0x254b3d,
    accent: 0x77c66e,
    shape: "prop",
  },
  streetLamp: {
    key: "streetLamp",
    path: "/assets/props/street-lamp.png",
    width: 18,
    height: 48,
    color: 0x303945,
    accent: 0xffdf79,
    shape: "prop",
  },
  bench: {
    key: "bench",
    path: "/assets/props/bench.png",
    width: 62,
    height: 34,
    color: 0x5b4537,
    accent: 0xc39a63,
    shape: "prop",
  },
  trashBin: {
    key: "trashBin",
    path: "/assets/props/trash-bin.png",
    width: 24,
    height: 34,
    color: 0x35434b,
    accent: 0x79f2d0,
    shape: "prop",
  },
  bicycle: {
    key: "bicycle",
    path: "/assets/props/bicycle.png",
    width: 54,
    height: 34,
    color: 0x27343f,
    accent: 0xff695e,
    shape: "prop",
  },
  planter: {
    key: "planter",
    path: "/assets/props/planter-long.png",
    width: 62,
    height: 30,
    color: 0x365447,
    accent: 0xffb36b,
    shape: "prop",
  },
  hydrant: {
    key: "hydrant",
    path: "/assets/props/hydrant.png",
    width: 22,
    height: 34,
    color: 0xb44235,
    accent: 0xffb36b,
    shape: "prop",
  },
  trafficLight: {
    key: "trafficLight",
    path: "/assets/props/traffic-light.png",
    width: 24,
    height: 58,
    color: 0x303945,
    accent: 0xd6ff3f,
    shape: "prop",
  },
};

export const assetList = Object.values(assetManifest);

export async function discoverAvailableAssets(): Promise<Set<AssetKey>> {
  const checks = await Promise.all(
    assetList.map(async (asset): Promise<[AssetKey, boolean]> => {
      try {
        const response = await fetch(asset.path, { method: "HEAD", cache: "no-store" });
        const contentType = response.headers.get("content-type") ?? "";
        return [asset.key, response.ok && contentType.startsWith("image/")];
      } catch {
        return [asset.key, false];
      }
    }),
  );
  return new Set(checks.filter(([, available]) => available).map(([key]) => key));
}
