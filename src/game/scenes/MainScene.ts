import Phaser from "phaser";
import { en, type TranslationKey } from "../../i18n/en";
import { tr } from "../../i18n/tr";
import { useGameStore } from "../../stores/gameStore";
import type { InteractableDefinition, InteractionId, StoryStage } from "../../types/game";
import { createFallbackTextures, preloadManifest, resolveAssetTexture } from "../assets/AssetLoader";
import type { AssetKey } from "../assets/manifest";
import { gameInput } from "../input/gameInput";
import { interactableDefinitions, isDefinitionActive } from "../interactables/definitions";

type GameSnapshot = ReturnType<typeof useGameStore.getState>;
type DesignChoice = GameSnapshot["designChoices"]["clinic"];

type WorldInteractable = {
  definition: InteractableDefinition;
  sprite: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  cue: Phaser.GameObjects.Text;
  halo: Phaser.GameObjects.Ellipse;
  displayHeight: number;
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

type Point = Readonly<{ x: number; y: number }>;

const WORLD_WIDTH = 960;
const WORLD_HEIGHT = 540;
const CAMERA_WORLD_HEIGHT = 720;
const PLAYER_SPEED = 174;
const PLAYER_MIN_Y = 312;
const APPROACH_DISTANCE = 112;
const ACCOUNT_POINT: Point = { x: 482, y: 72 };

const ANALYSIS_STAGES: ReadonlySet<StoryStage> = new Set([
  "perspective-shift",
  "clinic-compare",
  "metro-checkpoint",
  "metro-compare",
  "club-compare",
]);

const FIRST_METRO_PENDING: ReadonlySet<StoryStage> = new Set([
  "spawn",
  "metro-ticket",
  "metro-gate",
]);

const PROOF_COMPLETE_STAGES: ReadonlySet<StoryStage> = new Set([
  "metro-compare",
  "metro-reuse",
  "club",
  "club-compare",
  "results",
]);

const INTERACTABLE_SIZES: Partial<Record<AssetKey, readonly [number, number]>> = {
  metroKiosk: [62, 84],
  metroGate: [92, 92],
  cafeCounter: [200, 150],
  clinicTerminal: [190, 190],
  clubDoor: [188, 188],
};

const SERVICE_COLORS: Record<InteractionId, number> = {
  "metro-kiosk": 0x57d6ff,
  "metro-gate": 0x57d6ff,
  "cafe-counter": 0xffb36b,
  "clinic-terminal": 0x79f2d0,
  "metro-proof-gate": 0x79f2d0,
  "metro-reuse-gate": 0xff695e,
  "club-door": 0xf56ddd,
  "minimum-disclosure": 0x79f2d0,
  results: 0x79f2d0,
};

const isAnalysisStage = (stage: StoryStage): boolean => ANALYSIS_STAGES.has(stage);

export class MainScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Image;
  private keys!: KeyMap;
  private interactables: WorldInteractable[] = [];
  private worldSprites: Phaser.GameObjects.Image[] = [];
  private autoTarget: Phaser.Math.Vector2 | null = null;
  private pendingInteraction: InteractionId | null = null;
  private marker!: Phaser.GameObjects.Image;
  private edgeCue!: Phaser.GameObjects.Container;
  private edgeCuePlate!: Phaser.GameObjects.Arc;
  private edgeCueArrow!: Phaser.GameObjects.Triangle;
  private analysisVeil!: Phaser.GameObjects.Rectangle;
  private analysisGraph!: Phaser.GameObjects.Graphics;
  private unsubscribeStore?: () => void;
  private labels: Array<{ text: Phaser.GameObjects.Text; key: TranslationKey }> = [];
  private nearbyId: InteractionId | null = null;
  private activeId: InteractionId | null = null;
  private markerTargetId: InteractionId | null = null;
  private markerTween?: Phaser.Tweens.Tween;
  private haloTween?: Phaser.Tweens.Tween;
  private analysisVisible = false;
  private baseCameraZoom = 1;
  private cameraWorldHeight = CAMERA_WORLD_HEIGHT;
  private wasMoving = false;

  constructor() {
    super("zity-main");
  }

  preload(): void {
    preloadManifest(this);
  }

  create(): void {
    createFallbackTextures(this);
    this.cameras.main.setBackgroundColor("#0d151c");
    this.drawWorld();
    this.createInteractables();

    this.player = this.add.image(510, 506, resolveAssetTexture(this, "player"));
    this.player.setOrigin(0.5, 1).setDisplaySize(32, 48).setDepth(this.player.y);
    this.worldSprites.push(this.player);

    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, CAMERA_WORLD_HEIGHT);
    this.resizeCamera(this.scale.gameSize);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.resizeCamera, this);

    this.marker = this.add.image(0, 0, resolveAssetTexture(this, "cityMarker"));
    this.marker.setDisplaySize(24, 32).setDepth(920).setVisible(false);

    this.edgeCuePlate = this.add.circle(0, 0, 12, 0x071017, 0.88);
    this.edgeCuePlate.setStrokeStyle(2, 0xd6ff3f, 0.88);
    this.edgeCueArrow = this.add.triangle(1, 0, -5, -6, 7, 0, -5, 6, 0xd6ff3f, 1);
    this.edgeCue = this.add.container(0, 0, [this.edgeCuePlate, this.edgeCueArrow]);
    this.edgeCue.setDepth(940).setAlpha(0.9).setVisible(false);

    this.analysisVeil = this.add.rectangle(0, 0, WORLD_WIDTH, CAMERA_WORLD_HEIGHT, 0x061522, 0);
    this.analysisVeil.setOrigin(0).setDepth(800).setVisible(false);
    this.analysisGraph = this.add.graphics().setDepth(810).setAlpha(0).setVisible(false);

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

    ["W", "A", "S", "D", "UP", "DOWN", "LEFT", "RIGHT"].forEach((key) => {
      keyboard.on(`keydown-${key}`, () => this.cancelAutoWalk());
    });

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      const state = useGameStore.getState();
      if (pointer.event.defaultPrevented || state.currentInteraction || isAnalysisStage(state.stage)) return;
      const point = pointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
      this.autoTarget = new Phaser.Math.Vector2(
        Phaser.Math.Clamp(point.x, 38, WORLD_WIDTH - 38),
        Phaser.Math.Clamp(point.y, PLAYER_MIN_Y, WORLD_HEIGHT - 16),
      );
      this.pendingInteraction = null;
    });

    this.unsubscribeStore = useGameStore.subscribe(() => this.syncWorldState());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubscribeStore?.();
      this.scale.off(Phaser.Scale.Events.RESIZE, this.resizeCamera, this);
      this.markerTween?.destroy();
      this.haloTween?.destroy();
      gameInput.clearJoystick();
    });

    this.syncWorldState();
  }

  update(_time: number, delta: number): void {
    const state = useGameStore.getState();
    this.updateInteractionFocus(state);
    this.updateEdgeCue(state);

    if (state.paused || state.currentInteraction || state.stage === "results" || isAnalysisStage(state.stage)) {
      this.wasMoving = false;
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
        this.player.setPosition(this.autoTarget.x, this.autoTarget.y).setDepth(this.autoTarget.y);
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
      const nearest = this.getNearestActiveInteractable(76);
      if (nearest) this.tryOpenInteraction(nearest.definition.id);
    }
  }

  private movePlayer(direction: Phaser.Math.Vector2, delta: number): void {
    const amount = PLAYER_SPEED * (delta / 1000);
    this.player.x = Phaser.Math.Clamp(this.player.x + direction.x * amount, 38, WORLD_WIDTH - 38);
    this.player.y = Phaser.Math.Clamp(this.player.y + direction.y * amount, PLAYER_MIN_Y, WORLD_HEIGHT - 16);
    this.player.setFlipX(direction.x < -0.1).setDepth(this.player.y);
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
    const state = useGameStore.getState();
    if (!item || !isDefinitionActive(item.definition, state.stage)) return;
    const distance = Phaser.Math.Distance.Between(
      this.player.x,
      this.player.y,
      item.definition.interactionPoint.x,
      item.definition.interactionPoint.y,
    );
    if (distance <= item.definition.interactionRadius + 10) {
      const resolvedId = id === "metro-proof-gate" && state.stage === "metro-reuse"
        ? "metro-reuse-gate"
        : id;
      useGameStore.getState().openInteraction(resolvedId);
    } else {
      this.autoWalkTo(item.definition);
    }
  }

  private getNearestActiveInteractable(maxDistance = Number.POSITIVE_INFINITY): WorldInteractable | undefined {
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
      .filter(({ item, distance }) => distance <= Math.max(maxDistance, item.definition.interactionRadius + 12))
      .sort((a, b) => a.distance - b.distance)[0]?.item;
  }

  private updateInteractionFocus(state: GameSnapshot): void {
    if (state.currentInteraction || isAnalysisStage(state.stage)) {
      this.setNearbyInteractable(null, state.reducedMotion);
      return;
    }
    const nearest = this.getNearestActiveInteractable(APPROACH_DISTANCE);
    this.setNearbyInteractable(nearest ?? null, state.reducedMotion);
  }

  private setNearbyInteractable(item: WorldInteractable | null, reducedMotion: boolean): void {
    const nextId = item?.definition.id ?? null;
    if (nextId === this.nearbyId) return;

    this.haloTween?.destroy();
    this.haloTween = undefined;
    this.nearbyId = nextId;

    this.interactables.forEach((candidate) => {
      const active = candidate.definition.id === this.activeId;
      const nearby = candidate.definition.id === nextId;
      candidate.cue.setVisible(nearby && active);
      candidate.label.setAlpha(nearby ? 1 : active ? 0.82 : 0.28);
      candidate.halo.setAlpha(nearby ? 0.36 : active ? 0.13 : 0).setScale(1);
    });

    if (item && !reducedMotion) {
      this.haloTween = this.tweens.add({
        targets: item.halo,
        alpha: { from: 0.28, to: 0.48 },
        scaleX: { from: 0.96, to: 1.1 },
        scaleY: { from: 0.96, to: 1.1 },
        duration: 620,
        yoyo: true,
        repeat: -1,
        ease: "Sine.inOut",
      });
    }
  }

  private updateEdgeCue(state: GameSnapshot): void {
    if (
      state.currentInteraction
      || state.stage === "results"
      || isAnalysisStage(state.stage)
      || !this.marker.visible
      || !this.activeId
    ) {
      this.edgeCue.setVisible(false);
      return;
    }

    const active = this.interactables.find((item) => item.definition.id === this.activeId);
    const view = this.cameras.main.worldView;
    if (!active || view.width <= 0 || view.height <= 0) {
      this.edgeCue.setVisible(false);
      return;
    }

    const targetX = active.definition.position.x;
    const targetY = active.definition.position.y - active.displayHeight - 48;
    const cameraZoom = Math.max(this.cameras.main.zoom, 0.01);
    const markerPadding = 18 / cameraZoom;
    const visibleArea = new Phaser.Geom.Rectangle(
      view.x + markerPadding,
      view.y + markerPadding,
      Math.max(0, view.width - markerPadding * 2),
      Math.max(0, view.height - markerPadding * 2),
    );
    if (visibleArea.contains(targetX, targetY)) {
      this.edgeCue.setVisible(false);
      return;
    }

    const centerX = view.centerX;
    const centerY = view.centerY;
    const dx = targetX - centerX;
    const dy = targetY - centerY;
    const edgePadding = 25 / cameraZoom;
    const halfWidth = Math.max(1, view.width / 2 - edgePadding);
    const halfHeight = Math.max(1, view.height / 2 - edgePadding);
    const intersectionScale = Math.min(
      Math.abs(dx) > 0.001 ? halfWidth / Math.abs(dx) : Number.POSITIVE_INFINITY,
      Math.abs(dy) > 0.001 ? halfHeight / Math.abs(dy) : Number.POSITIVE_INFINITY,
    );
    const color = SERVICE_COLORS[active.definition.id];
    this.edgeCuePlate.setStrokeStyle(2, color, 0.88);
    this.edgeCueArrow.setFillStyle(color, 1);
    this.edgeCue
      .setPosition(centerX + dx * intersectionScale, centerY + dy * intersectionScale)
      .setRotation(Math.atan2(dy, dx))
      .setScale(1 / cameraZoom)
      .setVisible(true);
  }

  private createInteractables(): void {
    interactableDefinitions.forEach((definition) => {
      const color = SERVICE_COLORS[definition.id];
      const size = INTERACTABLE_SIZES[definition.assetKey]
        ?? (definition.type === "building" ? [124, 104] : definition.type === "gate" ? [82, 82] : [56, 74]);

      const footprint = this.add.ellipse(
        definition.position.x,
        definition.position.y - 2,
        size[0] * (definition.type === "building" ? 0.82 : 0.68),
        definition.type === "building" ? 25 : 15,
        0x020609,
        definition.type === "building" ? 0.32 : 0.24,
      );
      footprint.setDepth(definition.position.y - 2);

      const halo = this.add.ellipse(
        definition.interactionPoint.x,
        definition.interactionPoint.y,
        Math.max(54, definition.interactionRadius * 1.3),
        Math.max(22, definition.interactionRadius * 0.48),
        color,
        0,
      );
      halo.setStrokeStyle(2, color, 0.62).setDepth(4).setVisible(false);

      const sprite = this.add.image(
        definition.position.x,
        definition.position.y,
        resolveAssetTexture(this, definition.assetKey),
      );
      sprite
        .setOrigin(0.5, 1)
        .setDisplaySize(size[0], size[1])
        .setDepth(definition.position.y)
        .setInteractive({ useHandCursor: true });
      this.worldSprites.push(sprite);
      sprite.on(
        "pointerdown",
        (_pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
          if (!isDefinitionActive(definition, useGameStore.getState().stage)) return;
          event.stopPropagation();
          this.autoWalkTo(definition);
        },
      );

      const key = definition.labelKey as TranslationKey;
      const label = this.add.text(
        definition.position.x,
        definition.position.y - size[1] - 12,
        this.translate(key),
        {
          fontFamily: "monospace",
          fontSize: "10px",
          color: "#f4f0e5",
          backgroundColor: "#080b10",
          padding: { x: 5, y: 3 },
        },
      );
      label.setOrigin(0.5).setDepth(900).setAlpha(0.28);

      const cue = this.add.text(
        definition.interactionPoint.x,
        definition.interactionPoint.y - 24,
        this.translate("game.interact"),
        {
          fontFamily: "monospace",
          fontSize: "10px",
          fontStyle: "bold",
          color: "#071017",
          backgroundColor: `#${color.toString(16).padStart(6, "0")}`,
          padding: { x: 8, y: 5 },
        },
      );
      cue.setOrigin(0.5).setDepth(930).setVisible(false);

      this.labels.push({ text: label, key });
      this.interactables.push({ definition, sprite, label, cue, halo, displayHeight: size[1] });
    });
  }

  private syncWorldState(): void {
    if (!this.marker || !this.analysisVeil) return;
    const state = useGameStore.getState();
    this.labels.forEach(({ text, key }) => text.setText(this.translate(key)));
    this.interactables.forEach((item) => item.cue.setText(this.translate("game.interact")));

    const active = this.interactables.find((item) => isDefinitionActive(item.definition, state.stage));
    const nextActiveId = active?.definition.id ?? null;
    if (nextActiveId !== this.activeId) {
      this.setNearbyInteractable(null, state.reducedMotion);
      this.activeId = nextActiveId;
    }

    const firstMetroOpen = !FIRST_METRO_PENDING.has(state.stage);
    const proofWasAccepted = state.designChoices.metro != null && PROOF_COMPLETE_STAGES.has(state.stage);
    this.interactables.forEach((item) => {
      const activeItem = item.definition.id === nextActiveId;
      if (item.definition.id === "metro-gate") {
        item.sprite.setTexture(resolveAssetTexture(this, firstMetroOpen ? "metroGateOpen" : "metroGate"));
      }
      if (item.definition.id === "metro-proof-gate") {
        const gateTexture = state.authorizationReuseAttempted
          ? "metroGateDenied"
          : proofWasAccepted
            ? "metroGateOpen"
            : "metroGate";
        item.sprite.setTexture(resolveAssetTexture(this, gateTexture));
      }

      item.sprite.setAlpha(1);
      item.halo.setVisible(activeItem && !isAnalysisStage(state.stage));
      item.halo.setAlpha(activeItem ? (item.definition.id === this.nearbyId ? 0.36 : 0.13) : 0);
      item.label.setAlpha(activeItem ? (item.definition.id === this.nearbyId ? 1 : 0.82) : 0.28);
      item.cue.setVisible(activeItem && item.definition.id === this.nearbyId && !isAnalysisStage(state.stage));
    });

    this.syncMarker(active, state);
    this.syncAnalysisLayer(state);
  }

  private syncMarker(active: WorldInteractable | undefined, state: GameSnapshot): void {
    const shouldShow = Boolean(active) && !isAnalysisStage(state.stage) && state.stage !== "results";
    if (!active || !shouldShow) {
      this.marker.setVisible(false);
      this.markerTween?.destroy();
      this.markerTween = undefined;
      this.markerTargetId = null;
      return;
    }

    const markerY = active.definition.position.y - active.displayHeight - 48;
    const targetChanged = this.markerTargetId !== active.definition.id;
    if (targetChanged) {
      this.markerTween?.destroy();
      this.markerTween = undefined;
      this.markerTargetId = active.definition.id;
      this.marker.setPosition(active.definition.position.x, markerY);
    }
    this.marker.setVisible(true);
    if (state.reducedMotion) {
      this.markerTween?.destroy();
      this.markerTween = undefined;
      this.marker.setPosition(active.definition.position.x, markerY);
      return;
    }

    if (!this.markerTween) {
      this.markerTween = this.tweens.add({
        targets: this.marker,
        y: markerY - 8,
        duration: 650,
        yoyo: true,
        repeat: -1,
        ease: "Sine.inOut",
        paused: false,
      });
    }
  }

  private syncAnalysisLayer(state: GameSnapshot): void {
    const shouldShow = isAnalysisStage(state.stage);
    this.drawAnalysisGraph(state);
    if (shouldShow === this.analysisVisible) return;
    this.analysisVisible = shouldShow;

    this.tweens.killTweensOf(this.analysisVeil);
    this.tweens.killTweensOf(this.analysisGraph);
    if (shouldShow) {
      this.cancelAutoWalk();
      this.setNearbyInteractable(null, state.reducedMotion);
      this.analysisVeil.setVisible(true).setAlpha(state.reducedMotion ? 0.44 : 0);
      this.analysisGraph.setVisible(true).setAlpha(state.reducedMotion ? 1 : 0);
      this.worldSprites.forEach((sprite) => sprite.setTint(0x9eb7c5));
      this.cameras.main.stopFollow();
      if (state.reducedMotion) {
        this.cameras.main.centerOn(WORLD_WIDTH / 2, this.cameraWorldHeight / 2);
      } else {
        this.tweens.add({ targets: this.analysisVeil, alpha: 0.44, duration: 520, ease: "Sine.out" });
        this.tweens.add({ targets: this.analysisGraph, alpha: 1, duration: 680, delay: 180, ease: "Sine.out" });
        this.cameras.main.pan(WORLD_WIDTH / 2, this.cameraWorldHeight / 2, 650, "Sine.inOut");
        this.cameras.main.zoomTo(this.baseCameraZoom * 1.025, 650, "Sine.inOut");
      }
      return;
    }

    this.worldSprites.forEach((sprite) => sprite.clearTint());
    if (state.reducedMotion) {
      this.analysisVeil.setVisible(false).setAlpha(0);
      this.analysisGraph.setVisible(false).setAlpha(0);
      this.resizeCamera(this.scale.gameSize);
    } else {
      this.tweens.add({
        targets: [this.analysisVeil, this.analysisGraph],
        alpha: 0,
        duration: 300,
        ease: "Sine.in",
        onComplete: () => {
          this.analysisVeil.setVisible(false);
          this.analysisGraph.setVisible(false);
        },
      });
      this.cameras.main.zoomTo(this.baseCameraZoom, 360, "Sine.inOut");
      this.time.delayedCall(370, () => this.resizeCamera(this.scale.gameSize));
    }
  }

  private drawAnalysisGraph(state: GameSnapshot): void {
    if (!isAnalysisStage(state.stage)) return;
    const g = this.analysisGraph;
    g.clear();

    const servicePoints: Array<{ id: "metro" | "cafe" | "clinic" | "club"; point: Point; color: number }> = [
      { id: "metro", point: { x: 252, y: 432 }, color: 0x57d6ff },
      { id: "cafe", point: { x: 470, y: 310 }, color: 0xffb36b },
      { id: "clinic", point: { x: 790, y: 296 }, color: 0x79f2d0 },
    ];
    if (state.stage === "club-compare") {
      servicePoints.push({ id: "club", point: { x: 150, y: 292 }, color: 0xf56ddd });
    }

    servicePoints.forEach((service) => {
      const choice = service.id === "cafe" ? null : state.designChoices[service.id];
      this.drawAnalysisEdge(g, ACCOUNT_POINT, service.point, choice);
    });

    g.fillStyle(0xb7d9eb, 0.96);
    g.fillCircle(ACCOUNT_POINT.x, ACCOUNT_POINT.y, 12);
    g.fillStyle(0x061522, 1);
    g.fillCircle(ACCOUNT_POINT.x, ACCOUNT_POINT.y, 5);
    g.lineStyle(2, 0x8fdcff, 0.82);
    g.strokeCircle(ACCOUNT_POINT.x, ACCOUNT_POINT.y, 18);

    servicePoints.forEach(({ point, color }) => {
      g.fillStyle(0x07131d, 0.92);
      g.fillCircle(point.x, point.y, 15);
      g.lineStyle(3, color, 0.92);
      g.strokeCircle(point.x, point.y, 15);
      g.fillStyle(color, 0.96);
      g.fillCircle(point.x, point.y, 5);
    });
  }

  private drawAnalysisEdge(
    graphics: Phaser.GameObjects.Graphics,
    from: Point,
    to: Point,
    choice: DesignChoice | null,
  ): void {
    if (choice === "minimum") {
      this.drawDashedLine(graphics, from, to, 0x79f2d0);
      const midpoint = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
      graphics.lineStyle(3, 0x79f2d0, 0.95);
      graphics.lineBetween(midpoint.x - 8, midpoint.y - 8, midpoint.x + 8, midpoint.y + 8);
      graphics.lineBetween(midpoint.x + 8, midpoint.y - 8, midpoint.x - 8, midpoint.y + 8);
      return;
    }

    const color = choice === "hybrid" ? 0xffb36b : 0xff695e;
    graphics.lineStyle(choice === "hybrid" ? 2 : 3, color, choice === "hybrid" ? 0.72 : 0.82);
    graphics.lineBetween(from.x, from.y, to.x, to.y);
  }

  private drawDashedLine(
    graphics: Phaser.GameObjects.Graphics,
    from: Point,
    to: Point,
    color: number,
  ): void {
    const distance = Phaser.Math.Distance.Between(from.x, from.y, to.x, to.y);
    const dashLength = 11;
    const gapLength = 8;
    const dx = (to.x - from.x) / distance;
    const dy = (to.y - from.y) / distance;
    graphics.lineStyle(2, color, 0.88);
    for (let cursor = 0; cursor < distance; cursor += dashLength + gapLength) {
      const end = Math.min(cursor + dashLength, distance);
      graphics.lineBetween(
        from.x + dx * cursor,
        from.y + dy * cursor,
        from.x + dx * end,
        from.y + dy * end,
      );
    }
  }

  private translate(key: TranslationKey): string {
    return useGameStore.getState().language === "tr" ? tr[key] : en[key];
  }

  private resizeCamera(gameSize: Phaser.Structs.Size): void {
    if (!this.player) return;
    const mobileLayout = typeof window !== "undefined"
      && window.matchMedia("(max-width: 900px)").matches;
    const portrait = mobileLayout && gameSize.width < gameSize.height;
    this.cameraWorldHeight = portrait ? WORLD_HEIGHT : CAMERA_WORLD_HEIGHT;
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, this.cameraWorldHeight);
    this.baseCameraZoom = portrait
      ? Math.max(gameSize.width / WORLD_WIDTH, gameSize.height / WORLD_HEIGHT)
      : Math.min(gameSize.width / WORLD_WIDTH, gameSize.height / CAMERA_WORLD_HEIGHT);

    if (this.analysisVisible) {
      this.cameras.main.stopFollow();
      this.cameras.main.setZoom(this.baseCameraZoom * 1.025);
      this.cameras.main.centerOn(WORLD_WIDTH / 2, this.cameraWorldHeight / 2);
      return;
    }
    this.cameras.main.setZoom(this.baseCameraZoom);
    if (portrait) {
      this.cameras.main.startFollow(this.player, true, 0.13, 0.13);
      this.cameras.main.setDeadzone(150, 110);
    } else {
      this.cameras.main.stopFollow();
      this.cameras.main.setDeadzone(0, 0);
      this.cameras.main.centerOn(WORLD_WIDTH / 2, this.cameraWorldHeight / 2);
    }
  }

  private drawWorld(): void {
    const g = this.add.graphics().setDepth(0);
    g.fillStyle(0x0d151c, 1);
    g.fillRect(0, 0, WORLD_WIDTH, CAMERA_WORLD_HEIGHT);

    // Distant Central District silhouettes.
    g.fillStyle(0x16232c, 1);
    g.fillRect(0, 88, WORLD_WIDTH, 58);
    g.fillStyle(0x1c2b35, 1);
    for (let x = 20; x < WORLD_WIDTH; x += 70) {
      const height = 28 + ((x / 70) % 3) * 8;
      g.fillRect(x, 118 - height, 44, height);
      g.fillStyle(0x29404a, 0.72);
      g.fillRect(x + 7, 96 - height / 2, 8, 8);
      g.fillRect(x + 27, 96 - height / 2, 8, 8);
      g.fillStyle(0x1c2b35, 1);
    }

    // One compact raised service plaza.
    g.fillStyle(0x25323a, 1);
    g.fillRoundedRect(24, 118, 912, 226, 16);
    g.lineStyle(2, 0x3b4b54, 0.7);
    g.strokeRoundedRect(24, 118, 912, 226, 16);
    g.lineStyle(1, 0x42515a, 0.28);
    for (let x = 40; x < 930; x += 32) g.lineBetween(x, 126, x, 338);
    for (let y = 134; y < 338; y += 24) g.lineBetween(32, y, 928, y);

    // Building pads share one base tone so the plaza reads as a single
    // coherent block; each pad's accent edge is the only per-service color.
    this.drawServicePad(g, 54, 252, 192, 78, SERVICE_COLORS["club-door"]);
    this.drawServicePad(g, 354, 268, 232, 68, SERVICE_COLORS["cafe-counter"]);
    this.drawServicePad(g, 674, 252, 230, 78, SERVICE_COLORS["clinic-terminal"]);

    // Road and front sidewalk establish a readable movement lane.
    g.fillStyle(0x121a22, 1);
    g.fillRect(0, 344, WORLD_WIDTH, 120);
    g.lineStyle(2, 0x52606a, 0.46);
    g.lineBetween(0, 348, WORLD_WIDTH, 348);
    g.lineBetween(0, 460, WORLD_WIDTH, 460);
    g.lineStyle(3, 0xc9b75c, 0.42);
    for (let x = 438; x < 930; x += 76) g.lineBetween(x, 405, x + 35, 405);

    g.fillStyle(0x28353d, 1);
    g.fillRect(0, 464, WORLD_WIDTH, 76);
    g.lineStyle(1, 0x43525b, 0.38);
    for (let x = 0; x < WORLD_WIDTH; x += 48) g.lineBetween(x, 466, x, WORLD_HEIGHT);
    g.lineBetween(0, 504, WORLD_WIDTH, 504);

    // A foreground apron fills tall desktop viewports and adds diorama depth
    // without enlarging the playable route.
    g.fillStyle(0x1f2b33, 1);
    g.fillRect(0, WORLD_HEIGHT, WORLD_WIDTH, CAMERA_WORLD_HEIGHT - WORLD_HEIGHT);
    g.lineStyle(2, 0x3f4e57, 0.48);
    g.lineBetween(0, WORLD_HEIGHT, WORLD_WIDTH, WORLD_HEIGHT);
    g.lineStyle(1, 0x38464f, 0.3);
    for (let x = 0; x < WORLD_WIDTH; x += 48) {
      g.lineBetween(x, WORLD_HEIGHT, x, CAMERA_WORLD_HEIGHT);
    }
    for (let y = WORLD_HEIGHT + 40; y < CAMERA_WORLD_HEIGHT; y += 40) {
      g.lineBetween(0, y, WORLD_WIDTH, y);
    }

    // Metro bay uses the same base tone as the service pads above, so the
    // whole district reads as one place rather than mismatched fragments.
    g.fillStyle(0x05090c, 0.22);
    g.fillRoundedRect(67, 357, 350, 142, 12);
    g.fillStyle(0x243138, 0.96);
    g.fillRoundedRect(62, 350, 350, 142, 12);
    g.lineStyle(2, 0x3d4c56, 0.5);
    g.strokeRoundedRect(62, 350, 350, 142, 12);
    g.lineStyle(3, 0x57d6ff, 0.68);
    g.lineBetween(76, 353, 388, 353);
    g.lineStyle(5, 0xd6ff3f, 0.76);
    g.lineBetween(76, 484, 400, 484);
    g.lineStyle(1, 0x57d6ff, 0.2);
    for (let x = 82; x < 402; x += 32) g.lineBetween(x, 360, x, 478);

    const cityText = this.add.text(22, 20, "ZITY / 08:42", {
      fontFamily: "monospace",
      fontSize: "18px",
      color: "#d6ff3f",
      letterSpacing: 2,
    });
    cityText.setDepth(3);

    const districtKey: TranslationKey = "world.central";
    const district = this.add.text(22, 50, this.translate(districtKey), {
      fontFamily: "monospace",
      fontSize: "10px",
      color: "#82939e",
      letterSpacing: 1,
    });
    district.setDepth(3);
    this.labels.push({ text: district, key: districtKey });

    // Props are grouped by place instead of sprinkled evenly.
    this.addDecoration("tree", 42, 334, 38, 58);
    this.addDecoration("streetLamp", 78, 368, 20, 52);
    this.addDecoration("trashBin", 92, 474, 24, 34);

    this.addDecoration("bench", 574, 334, 68, 40);
    this.addDecoration("tree", 626, 334, 36, 56);
    this.addDecoration("streetLamp", 650, 342, 19, 50);

    this.addDecoration("planter", 868, 330, 72, 34);
    this.addDecoration("bicycle", 906, 352, 58, 36);
    this.addDecoration("hydrant", 930, 466, 22, 34);
    this.addDecoration("trafficLight", 44, 468, 24, 58);

    this.addDecoration("clubSecurity", 202, 330, 29, 44);
    this.addDecoration("barista", 526, 340, 27, 42);
    this.addDecoration("clinicReceptionist", 846, 332, 27, 42);
    this.addDecoration("officeWorker", 694, 500, 27, 42);
  }

  private drawServicePad(
    graphics: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    width: number,
    height: number,
    accent: number,
  ): void {
    graphics.fillStyle(0x05090c, 0.26);
    graphics.fillRoundedRect(x + 5, y + 7, width, height, 9);
    // Shared base tone, close to the plaza floor, keeps every pad reading as
    // one continuous block instead of separate colored islands.
    graphics.fillStyle(0x263440, 0.95);
    graphics.fillRoundedRect(x, y, width, height, 9);
    graphics.lineStyle(2, 0x3d4c56, 0.5);
    graphics.strokeRoundedRect(x, y, width, height, 9);
    // The accent edge is the only place a service's color appears on its pad.
    graphics.lineStyle(3, accent, 0.68);
    graphics.lineBetween(x + 14, y + 3, x + width - 14, y + 3);
    graphics.fillStyle(accent, 0.85);
    graphics.fillCircle(x + 14, y + 3, 2.4);
    graphics.fillCircle(x + width - 14, y + 3, 2.4);
  }

  private addDecoration(
    key: AssetKey,
    x: number,
    y: number,
    width: number,
    height: number,
  ): void {
    const shadow = this.add.ellipse(x, y - 2, width * 0.68, Math.max(8, height * 0.18), 0x020609, 0.25);
    shadow.setDepth(y - 1);
    const sprite = this.add.image(x, y, resolveAssetTexture(this, key));
    sprite.setOrigin(0.5, 1).setDisplaySize(width, height).setDepth(y);
    this.worldSprites.push(sprite);
  }
}
