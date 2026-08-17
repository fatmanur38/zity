export type AssetKey =
  | "player"
  | "metroKiosk"
  | "metroGate"
  | "cafeCounter"
  | "clinicTerminal"
  | "clubDoor"
  | "watcher"
  | "cityMarker"
  | "proofEffect"
  | "tree"
  | "streetLamp";

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
    path: "/assets/metro/gate.png",
    width: 56,
    height: 54,
    color: 0x253547,
    accent: 0xd6ff3f,
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
    path: "/assets/clinic/terminal.png",
    width: 58,
    height: 68,
    color: 0x2d6670,
    accent: 0x79f2d0,
    shape: "terminal",
  },
  clubDoor: {
    key: "clubDoor",
    path: "/assets/club/entrance.png",
    width: 68,
    height: 74,
    color: 0x4d285f,
    accent: 0xf56ddd,
    shape: "building",
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
