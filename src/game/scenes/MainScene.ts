import Phaser from "phaser";
import { en, type TranslationKey } from "../../i18n/en";
import { tr } from "../../i18n/tr";
import { useGameStore } from "../../stores/gameStore";
import type { InteractableDefinition, InteractionId } from "../../types/game";
import { createFallbackTextures, preloadManifest, resolveAssetTexture } from "../assets/AssetLoader";
import type { AssetKey } from "../assets/manifest";
import { gameInput } from "../input/gameInput";
import { interactableDefinitions, isDefinitionActive } from "../interactables/definitions";

type WorldInteractable = {
  definition: InteractableDefinition;
  sprite: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  halo: Phaser.GameObjects.Arc;
};

type KeyMap = {
  up: Phaser.Input.Keyboard.Key;
  upAlt: Phaser.Input.Keyboard.Key;
  down: Phaser.Input.Keyboard.Key;
  downAlt: Phaser.Input.Keyboard.Key;
  left: Phaser.Input.Keyboard.Key;
  leftAlt: Phaser.Input.Keyboard.Key;
  right: Phaser.Input.Keyboard.Key;
  rightAlt: Phaser.Input.Keyboard.Key;
  interact: Phaser.Input.Keyboard.Key;
};

const WORLD_WIDTH = 960;
const WORLD_HEIGHT = 540;
const PLAYER_SPEED = 174;

const INTERACTABLE_SIZES: Partial<Record<AssetKey, readonly [number, number]>> = {
  metroKiosk: [58, 76],
  metroGate: [86, 76],
  cafeCounter: [124, 92],
  clinicTerminal: [136, 116],
  clubDoor: [132, 116],
};

export class MainScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Image;
  private keys!: KeyMap;
  private interactables: WorldInteractable[] = [];
  private autoTarget: Phaser.Math.Vector2 | null = null;
  private pendingInteraction: InteractionId | null = null;
  private marker!: Phaser.GameObjects.Image;
  private unsubscribeStore?: () => void;
  private labels: Array<{ text: Phaser.GameObjects.Text; key: TranslationKey }> = [];
  private wasMoving = false;

  constructor(private readonly availableAssets: ReadonlySet<AssetKey> = new Set()) {
    super("zity-main");
  }

  preload(): void {
    preloadManifest(this, this.availableAssets);
  }

  create(): void {
    createFallbackTextures(this);
    this.cameras.main.setBackgroundColor("#111821");
    this.drawWorld();
    this.createInteractables();

    this.player = this.add.image(108, 434, resolveAssetTexture(this, "player"));
    this.player.setDisplaySize(32, 48).setDepth(20);
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.startFollow(this.player, true, 0.13, 0.13);
    this.cameras.main.setDeadzone(170, 120);
    this.resizeCamera(this.scale.gameSize);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.resizeCamera, this);

    this.marker = this.add.image(0, 0, resolveAssetTexture(this, "cityMarker"));
    this.marker.setDisplaySize(24, 32).setDepth(30);

    const keyboard = this.input.keyboard;
    if (!keyboard) throw new Error("Keyboard input unavailable");
    const cursors = keyboard.createCursorKeys();
    const wasd = keyboard.addKeys("W,A,S,D,E") as Record<string, Phaser.Input.Keyboard.Key>;
    this.keys = {
      up: cursors.up,
      upAlt: wasd.W,
      down: cursors.down,
      downAlt: wasd.S,
      left: cursors.left,
      leftAlt: wasd.A,
      right: cursors.right,
      rightAlt: wasd.D,
      interact: wasd.E,
    };

    keyboard.on("keydown-W", () => this.cancelAutoWalk());
    keyboard.on("keydown-A", () => this.cancelAutoWalk());
    keyboard.on("keydown-S", () => this.cancelAutoWalk());
    keyboard.on("keydown-D", () => this.cancelAutoWalk());
    keyboard.on("keydown-UP", () => this.cancelAutoWalk());
    keyboard.on("keydown-DOWN", () => this.cancelAutoWalk());
    keyboard.on("keydown-LEFT", () => this.cancelAutoWalk());
    keyboard.on("keydown-RIGHT", () => this.cancelAutoWalk());

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (pointer.event.defaultPrevented || useGameStore.getState().currentInteraction) return;
      const point = pointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
      this.autoTarget = new Phaser.Math.Vector2(point.x, point.y);
      this.pendingInteraction = null;
    });

    this.unsubscribeStore = useGameStore.subscribe(() => this.syncWorldState());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubscribeStore?.();
      this.scale.off(Phaser.Scale.Events.RESIZE, this.resizeCamera, this);
      gameInput.clearJoystick();
    });

    this.syncWorldState();
  }

  update(_time: number, delta: number): void {
    const state = useGameStore.getState();
    if (state.paused || state.currentInteraction || state.stage === "results" || state.stage === "attacker") {
      return;
    }

    const joystick = gameInput.getJoystick();
    const leftDown = this.keys.left.isDown || this.keys.leftAlt.isDown;
    const rightDown = this.keys.right.isDown || this.keys.rightAlt.isDown;
    const upDown = this.keys.up.isDown || this.keys.upAlt.isDown;
    const downDown = this.keys.down.isDown || this.keys.downAlt.isDown;
    const manual = new Phaser.Math.Vector2(
      (leftDown || rightDown ? Number(rightDown) - Number(leftDown) : 0) + joystick.x,
      (upDown || downDown ? Number(downDown) - Number(upDown) : 0) + joystick.y,
    );

    if (manual.lengthSq() > 0.025) {
      this.cancelAutoWalk();
      this.movePlayer(manual.normalize(), delta);
      if (!this.wasMoving) useGameStore.getState().markMovement();
      this.wasMoving = true;
    } else if (this.autoTarget) {
      const direction = this.autoTarget.clone().subtract(new Phaser.Math.Vector2(this.player.x, this.player.y));
      const distance = direction.length();
      if (distance <= 7) {
        this.player.setPosition(this.autoTarget.x, this.autoTarget.y);
        const interaction = this.pendingInteraction;
        this.cancelAutoWalk();
        if (interaction) this.tryOpenInteraction(interaction);
      } else {
        this.movePlayer(direction.normalize(), delta);
        if (!this.wasMoving) useGameStore.getState().markMovement();
        this.wasMoving = true;
      }
    } else {
      this.wasMoving = false;
    }

    if (Phaser.Input.Keyboard.JustDown(this.keys.interact)) {
      const nearest = this.getNearestActiveInteractable();
      if (nearest) this.tryOpenInteraction(nearest.definition.id);
    }
  }

  private movePlayer(direction: Phaser.Math.Vector2, delta: number): void {
    const amount = PLAYER_SPEED * (delta / 1000);
    this.player.x = Phaser.Math.Clamp(this.player.x + direction.x * amount, 38, WORLD_WIDTH - 38);
    this.player.y = Phaser.Math.Clamp(this.player.y + direction.y * amount, 116, WORLD_HEIGHT - 24);
    this.player.setFlipX(direction.x < -0.1);
  }

  private cancelAutoWalk(): void {
    this.autoTarget = null;
    this.pendingInteraction = null;
  }

  private autoWalkTo(definition: InteractableDefinition): void {
    if (!isDefinitionActive(definition, useGameStore.getState().stage)) return;
    this.autoTarget = new Phaser.Math.Vector2(definition.interactionPoint.x, definition.interactionPoint.y);
    this.pendingInteraction = definition.id;
  }

  private tryOpenInteraction(id: InteractionId): void {
    const item = this.interactables.find((candidate) => candidate.definition.id === id);
    if (!item || !isDefinitionActive(item.definition, useGameStore.getState().stage)) return;
    const distance = Phaser.Math.Distance.Between(
      this.player.x,
      this.player.y,
      item.definition.interactionPoint.x,
      item.definition.interactionPoint.y,
    );
    if (distance <= item.definition.interactionRadius + 10) {
      const resolvedId = id === "metro-proof-gate" && useGameStore.getState().stage === "metro-reuse"
        ? "metro-reuse-gate"
        : id;
      useGameStore.getState().openInteraction(resolvedId);
    } else {
      this.autoWalkTo(item.definition);
    }
  }

  private getNearestActiveInteractable(): WorldInteractable | undefined {
    const stage = useGameStore.getState().stage;
    return this.interactables
      .filter((item) => isDefinitionActive(item.definition, stage))
      .map((item) => ({
        item,
        distance: Phaser.Math.Distance.Between(
          this.player.x,
          this.player.y,
          item.definition.interactionPoint.x,
          item.definition.interactionPoint.y,
        ),
      }))
      .filter(({ item, distance }) => distance <= item.definition.interactionRadius + 12)
      .sort((a, b) => a.distance - b.distance)[0]?.item;
  }

  private createInteractables(): void {
    interactableDefinitions.forEach((definition) => {
      const halo = this.add.circle(definition.position.x, definition.position.y + 12, 43, 0xd6ff3f, 0.07);
      halo.setStrokeStyle(2, 0xd6ff3f, 0.5).setDepth(5);

      const sprite = this.add.image(
        definition.position.x,
        definition.position.y,
        resolveAssetTexture(this, definition.assetKey as AssetKey),
      );
      const size = INTERACTABLE_SIZES[definition.assetKey as AssetKey]
        ?? (definition.type === "building" ? [82, 70] : definition.type === "gate" ? [62, 58] : [50, 62]);
      sprite.setDisplaySize(size[0], size[1]).setDepth(10).setInteractive({ useHandCursor: true });
      sprite.on("pointerdown", (_pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation();
        this.autoWalkTo(definition);
      });

      const key = definition.labelKey as TranslationKey;
      const label = this.add.text(definition.position.x, definition.position.y - size[1] / 2 - 14, this.translate(key), {
        fontFamily: "monospace",
        fontSize: "11px",
        color: "#f4f0e5",
        backgroundColor: "#080b10",
        padding: { x: 5, y: 3 },
      });
      label.setOrigin(0.5).setDepth(12);
      this.labels.push({ text: label, key });
      this.interactables.push({ definition, sprite, label, halo });
    });
  }

  private syncWorldState(): void {
    if (!this.marker) return;
    const state = useGameStore.getState();
    this.labels.forEach(({ text, key }) => text.setText(this.translate(key)));

    const active = this.interactables.find((item) => isDefinitionActive(item.definition, state.stage));
    this.interactables.forEach((item) => {
      const isActive = isDefinitionActive(item.definition, state.stage);
      if (item.definition.id === "metro-gate") {
        const gateTexture = state.completedMissions.includes("metro") ? "metroGateOpen" : "metroGate";
        item.sprite.setTexture(resolveAssetTexture(this, gateTexture));
      }
      if (item.definition.id === "metro-proof-gate") {
        const proofWasAccepted = state.usedAuthorizations.length > 0
          || state.completedMissions.includes("metro-proof-standard");
        const gateTexture = state.authorizationReuseAttempted
          ? "metroGateDenied"
          : proofWasAccepted
            ? "metroGateOpen"
            : "metroGate";
        item.sprite.setTexture(resolveAssetTexture(this, gateTexture));
      }
      item.sprite.setAlpha(isActive ? 1 : 0.58);
      item.label.setAlpha(isActive ? 1 : 0.58);
      item.halo.setVisible(isActive);
    });

    if (active && state.stage !== "results" && state.stage !== "attacker") {
      this.marker.setVisible(true).setPosition(active.definition.position.x, active.definition.position.y - 78);
      this.tweens.killTweensOf(this.marker);
      if (!state.reducedMotion) {
        this.tweens.add({
          targets: this.marker,
          y: this.marker.y - 8,
          duration: 650,
          yoyo: true,
          repeat: -1,
          ease: "Sine.inOut",
        });
      }
    } else {
      this.marker.setVisible(false);
    }
  }

  private translate(key: TranslationKey): string {
    return useGameStore.getState().language === "tr" ? tr[key] : en[key];
  }

  private resizeCamera(gameSize: Phaser.Structs.Size): void {
    const zoom = Math.max(gameSize.width / WORLD_WIDTH, gameSize.height / WORLD_HEIGHT);
    this.cameras.main.setZoom(zoom);
  }

  private drawWorld(): void {
    const g = this.add.graphics();
    g.fillStyle(0x101821, 1);
    g.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    // City blocks and storefront silhouettes.
    g.fillStyle(0x19232e, 1);
    g.fillRect(0, 88, WORLD_WIDTH, 104);
    g.fillStyle(0x202d39, 1);
    for (let x = 22; x < WORLD_WIDTH; x += 72) {
      g.fillRect(x, 112, 38, 34);
      g.fillStyle(0x263b46, 1);
      g.fillRect(x + 4, 118, 9, 12);
      g.fillRect(x + 24, 118, 9, 12);
      g.fillStyle(0x202d39, 1);
    }

    // Walkable loop.
    g.fillStyle(0x25313a, 1);
    g.fillRoundedRect(42, 218, 876, 270, 36);
    g.fillStyle(0x111821, 1);
    g.fillRoundedRect(112, 272, 736, 142, 30);
    g.lineStyle(3, 0x3a4650, 1);
    g.strokeRoundedRect(42, 218, 876, 270, 36);
    g.lineStyle(2, 0x66727b, 0.38);
    for (let x = 86; x < 900; x += 64) g.lineBetween(x, 480, x + 25, 480);

    // Metro platform edge.
    g.fillStyle(0x151b23, 1);
    g.fillRect(148, 316, 294, 118);
    g.lineStyle(5, 0xd6ff3f, 0.82);
    g.lineBetween(158, 426, 432, 426);

    // Clinic and cafe lots.
    g.fillStyle(0x173038, 1);
    g.fillRoundedRect(736, 208, 126, 152, 10);
    g.fillStyle(0x3a2b24, 1);
    g.fillRoundedRect(526, 272, 126, 136, 10);
    g.fillStyle(0x2c1b37, 1);
    g.fillRoundedRect(292, 132, 112, 142, 10);

    const cityText = this.add.text(22, 24, "ZITY / 08:42", {
      fontFamily: "monospace",
      fontSize: "19px",
      color: "#d6ff3f",
      letterSpacing: 2,
    });
    cityText.setDepth(3);

    const districtKey: TranslationKey = "world.central";
    const district = this.add.text(22, 55, this.translate(districtKey), {
      fontFamily: "monospace",
      fontSize: "11px",
      color: "#798896",
      letterSpacing: 1,
    });
    this.labels.push({ text: district, key: districtKey });

    [[112, 356], [474, 250], [890, 440]].forEach(([x, y]) => {
      const tree = this.add.image(x, y, resolveAssetTexture(this, "tree"));
      tree.setDisplaySize(36, 54).setDepth(8);
    });
    [128, 486, 896].forEach((x, index) => {
      const lamp = this.add.image(x, index === 1 ? 436 : 250, resolveAssetTexture(this, "streetLamp"));
      lamp.setDisplaySize(20, 50).setDepth(8);
    });

    this.addDecoration("bench", 500, 242, 66, 38);
    this.addDecoration("trashBin", 462, 393, 24, 34);
    this.addDecoration("planter", 744, 399, 68, 32);
    this.addDecoration("bicycle", 870, 400, 58, 36);
    this.addDecoration("hydrant", 912, 287, 22, 34);
    this.addDecoration("trafficLight", 54, 276, 24, 58);

    this.addDecoration("barista", 628, 368, 27, 42, 11);
    this.addDecoration("clinicReceptionist", 824, 340, 27, 42, 11);
    this.addDecoration("clubSecurity", 411, 242, 29, 44, 11);
    this.addDecoration("officeWorker", 522, 456, 27, 42, 11);
  }

  private addDecoration(
    key: AssetKey,
    x: number,
    y: number,
    width: number,
    height: number,
    depth = 8,
  ): void {
    this.add.image(x, y, resolveAssetTexture(this, key)).setDisplaySize(width, height).setDepth(depth);
  }
}
