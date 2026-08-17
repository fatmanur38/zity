import Phaser from "phaser";
import { assetList, assetManifest, type AssetDefinition, type AssetKey } from "./manifest";

const fileKey = (key: AssetKey): string => `asset-file:${key}`;
const placeholderKey = (key: AssetKey): string => `asset-placeholder:${key}`;

export function preloadManifest(scene: Phaser.Scene, availableAssets: ReadonlySet<AssetKey>): void {
  assetList.filter((asset) => availableAssets.has(asset.key)).forEach((asset) => {
    scene.load.image(fileKey(asset.key), asset.path);
  });
}

function drawFallback(scene: Phaser.Scene, asset: AssetDefinition): void {
  const key = placeholderKey(asset.key);
  if (scene.textures.exists(key)) return;

  const graphics = scene.add.graphics({ x: 0, y: 0 });
  const { width, height, color, accent, shape } = asset;

  graphics.fillStyle(0x080b10, 0.22);
  graphics.fillRect(3, 4, width - 2, height - 2);
  graphics.fillStyle(color, 1);

  if (shape === "person") {
    graphics.fillRect(7, 14, width - 14, height - 16);
    graphics.fillStyle(accent, 1);
    graphics.fillRect(8, 2, width - 16, 12);
    graphics.fillRect(4, 17, 4, 13);
    graphics.fillRect(width - 8, 17, 4, 13);
    graphics.fillStyle(0x080b10, 1);
    graphics.fillRect(9, height - 7, 4, 7);
    graphics.fillRect(width - 13, height - 7, 4, 7);
  } else if (shape === "gate") {
    graphics.fillRect(2, 2, 12, height - 2);
    graphics.fillRect(width - 14, 2, 12, height - 2);
    graphics.fillRect(2, 2, width - 4, 9);
    graphics.fillStyle(accent, 1);
    graphics.fillRect(18, 18, width - 36, 6);
    graphics.fillRect(18, 29, width - 36, 6);
  } else if (shape === "terminal") {
    graphics.fillRect(4, 2, width - 8, height - 2);
    graphics.fillStyle(accent, 1);
    graphics.fillRect(9, 8, width - 18, Math.max(10, height * 0.3));
    graphics.fillStyle(0x080b10, 1);
    graphics.fillRect(12, 12, width - 24, 3);
    graphics.fillRect(width / 2 - 3, height - 12, 6, 4);
  } else if (shape === "building") {
    graphics.fillRect(2, 8, width - 4, height - 8);
    graphics.fillStyle(accent, 1);
    graphics.fillRect(8, 15, width - 16, 8);
    graphics.fillRect(width / 2 - 9, height - 24, 18, 24);
  } else if (shape === "prop") {
    graphics.fillRect(width / 2 - 3, height / 2, 6, height / 2);
    graphics.fillStyle(accent, 1);
    graphics.fillCircle(width / 2, height / 3, Math.min(width, height) / 3);
  } else {
    graphics.fillStyle(accent, 1);
    graphics.fillCircle(width / 2, height / 2, Math.min(width, height) / 2 - 2);
    graphics.fillStyle(0x080b10, 1);
    graphics.fillCircle(width / 2, height / 2, Math.min(width, height) / 5);
  }

  graphics.generateTexture(key, width, height);
  graphics.destroy();
}

export function createFallbackTextures(scene: Phaser.Scene): void {
  assetList.forEach((asset) => drawFallback(scene, asset));
}

export function resolveAssetTexture(scene: Phaser.Scene, key: AssetKey): string {
  const loadedKey = fileKey(key);
  if (scene.textures.exists(loadedKey)) return loadedKey;

  const fallback = placeholderKey(key);
  if (!scene.textures.exists(fallback)) drawFallback(scene, assetManifest[key]);
  return fallback;
}
