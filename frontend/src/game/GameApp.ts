// Orchestrates one mission session in the 3D world: engine/scene lifecycle,
// input routing, HUD, overlays and the scene-by-scene story flow.
import { post } from "../api/client";
import type { SessionInfo, StoredEvent } from "../api/types";
import { getSettings, onSettingsChange, type Settings } from "../app/settings";
import { exists, onLanguageChange, t } from "../i18n";
import { MissionController, type EmitRecord } from "../mission/MissionController";
import { ruleOk, type ApplyResult } from "../mission/engine";
import type { AssistanceProfile, CriticalError, DialogueChoice, Interactable, MissionDef, Step, WorldEvent } from "../mission/types";
import { confirmDialog, h, toast } from "../ui/dom";
import { settingsPanel } from "../ui/screens/welcome";
import { audio } from "./audio/AudioManager";
import {
  Color3,
  Color4,
  CreateCylinder,
  DirectionalLight,
  Engine,
  FreeCamera,
  HemisphericLight,
  Scene,
  ShadowGenerator,
  StandardMaterial,
  TransformNode,
  Vector3,
} from "./babylon";
import { ChecklistDevice } from "./hud/ChecklistDevice";
import { Hud } from "./hud/Hud";
import { Minimap, type MapMarker } from "./hud/Minimap";
import { OverlayStack, type OverlayHandle } from "./hud/Overlays";
import {
  blockPanel,
  briefingPanel,
  comicPanel,
  failedPanel,
  inspectPanel,
  instructionKey,
  instructionsPanel,
  pausePanel,
  stationPanel,
  toolboxPanel,
} from "./hud/Panels";
import { workPanel } from "./hud/WorkPanels";
import { InputManager, type Action } from "./input/InputManager";
import { InteractionSystem } from "./interaction/InteractionSystem";
import { insideRect } from "./player/collision";
import { EYE_HEIGHT, FirstPersonController } from "./player/FirstPersonController";
import { Hands, type HeldTool } from "./player/Hands";
import { runDialogue, type DialogueOutcome } from "./story/Dialogue";
import { reachable } from "./world/reach";
import { buildWorld } from "./world/registry";
import type { WorldBuild } from "./world/types";

export class WebGLUnavailableError extends Error {}

export interface GameDeps {
  root: HTMLElement;
  mission: MissionDef;
  session: SessionInfo;
  history: StoredEvent[];
  navigate: (path: string) => void;
}

const tx = (key: string, opts?: Record<string, unknown>) => (exists(key) ? t(key, opts) : key);

export class GameApp {
  private engine!: Engine;
  private scene!: Scene;
  private camera!: FreeCamera;
  private world!: WorldBuild;
  private controller!: FirstPersonController;
  private hands!: Hands;
  private interaction!: InteractionSystem;
  private input!: InputManager;
  private hud!: Hud;
  private minimap!: Minimap;
  private overlays!: OverlayStack;
  private checklist!: ChecklistDevice;
  private ctrl: MissionController;
  private assistance: AssistanceProfile;
  private shadow: ShadowGenerator | null = null;
  private sun!: DirectionalLight;
  private marker: TransformNode | null = null;
  private canvas: HTMLCanvasElement;
  private el: HTMLElement;
  private disposers: (() => void)[] = [];
  private zonesInside = new Set<string>();
  private restrictedWarnAt = 0;
  private selectedTool: HeldTool = null;
  private flagged = new Set<string>();
  private hintCount = new Map<string, number>();
  private dialogueOpen = false;
  private cinematic: { t: number; dur: number; from: Vector3; to: Vector3; lookFrom: Vector3; lookTo: Vector3; done: () => void } | null = null;
  private expectUnlock = false;
  private pauseHandle: OverlayHandle | null = null;
  private activeMs: number;
  private time = 0;
  private lowFpsFor = 0;
  private lastStepAt = performance.now();
  private autoHintShownFor: string | null = null;
  private ending = false;
  private disposed = false;
  /** The original hand-built Silent Pump world keeps its bespoke flow. */
  private legacy: boolean;
  private selectedItems = new Set<string>();
  private firedEvents = new Set<string>();
  private detailOverride = new Map<string, string[]>();
  private workHandle: OverlayHandle | null = null;
  private eventTimers: number[] = [];

  private constructor(private deps: GameDeps) {
    this.ctrl = new MissionController(deps.mission, deps.session, deps.history);
    this.assistance = deps.mission.assistance[deps.session.experience];
    this.legacy = deps.mission.scene.id === "petrochem";
    // Restore panel state (flagged fields, selected items) from the server's event log.
    for (const e of deps.history) {
      if (!e.accepted || !e.target || ["prerequisite_missing", "rejected"].includes(e.outcome)) continue;
      if (e.type === "evidence_flagged") this.flagged.add(e.target);
      if (e.type === "item_selected") this.selectedItems.add(e.target);
    }
    const s = deps.session;
    const now = s.serverTime;
    this.activeMs = Math.max(0, (now - s.startedAt) * 1000 - s.pausedMs - (s.pausedAt ? (now - s.pausedAt) * 1000 : 0));
    this.canvas = h("canvas", { class: "game-canvas", id: "game-canvas", tabindex: "0", "aria-label": t(deps.mission.titleKey) });
    this.el = h("div", { class: "game-root" }, this.canvas);
    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  static async create(deps: GameDeps): Promise<GameApp> {
    const app = new GameApp(deps);
    deps.root.replaceChildren(app.el);
    await document.fonts?.ready;
    app.initEngine();
    app.initScene();
    app.initUi();
    app.bindEvents();
    app.engine.runRenderLoop(app.frame);
    app.begin();
    return app;
  }

  // ---------------------------------------------------------------- setup
  private initEngine(): void {
    try {
      this.engine = new Engine(this.canvas, true, { preserveDrawingBuffer: false, stencil: true, antialias: true, powerPreference: "high-performance" }, true);
    } catch (e) {
      throw new WebGLUnavailableError(String(e));
    }
    if (!this.engine.webGLVersion) throw new WebGLUnavailableError("no webgl");
    this.applyQuality(getSettings());
  }

  private initScene(): void {
    const scene = new Scene(this.engine);
    this.scene = scene;
    const time = this.deps.mission.scene.time ?? "day";
    const sky = { day: [0.62, 0.78, 0.91], dusk: [0.93, 0.6, 0.45], night: [0.07, 0.09, 0.18], overcast: [0.62, 0.66, 0.71] }[time];
    scene.clearColor = new Color4(sky[0], sky[1], sky[2], 1);
    scene.fogMode = Scene.FOGMODE_EXP2;
    scene.fogDensity = time === "overcast" ? 0.013 : time === "night" ? 0.012 : 0.0085;
    scene.fogColor = time === "day" ? new Color3(0.7, 0.8, 0.9) : new Color3(sky[0], sky[1], sky[2]);
    scene.skipPointerMovePicking = true;
    scene.setRenderingAutoClearDepthStencil(1, true, true, false);

    this.camera = new FreeCamera("fp", new Vector3(0, EYE_HEIGHT, 0), scene);
    this.camera.inputs.clear();
    this.camera.minZ = 0.03;
    this.camera.maxZ = 400;
    this.camera.fov = 1.05;

    const hemi = new HemisphericLight("hemi", new Vector3(0.2, 1, -0.3), scene);
    hemi.intensity = { day: 0.85, dusk: 0.72, night: 0.62, overcast: 0.9 }[time];
    hemi.groundColor = new Color3(0.35, 0.36, 0.4);
    if (time === "night") hemi.diffuse = new Color3(0.72, 0.8, 1);
    if (time === "dusk") hemi.diffuse = new Color3(1, 0.86, 0.72);
    this.sun = new DirectionalLight("sun", new Vector3(-0.45, -1, 0.35), scene);
    this.sun.position = new Vector3(30, 60, -30);
    this.sun.intensity = { day: 0.75, dusk: 0.5, night: 0.25, overcast: 0.35 }[time];

    this.world = buildWorld(this.deps.mission.scene.id, { scene, mission: this.deps.mission, quality: getSettings().quality, t: (k, o) => tx(k, o) });
    // Validate that the scenario's referenced objects exist in the world; missing assets warn, never crash.
    for (const it of this.deps.mission.interactables) if (!this.world.anchors.has(it.id)) console.error(`World ${this.world.id} has no object for ${it.id}`);
    this.applyHidden();
    this.runWorldEvents(false);
    this.setupShadows(getSettings());

    // Freeze static geometry for performance (labels are dynamic textures, not transforms).
    for (const m of scene.meshes) if (!m.parent && m.name !== "ground" && !(m.metadata as { dynamic?: boolean } | null)?.dynamic) m.freezeWorldMatrix();
    scene.blockMaterialDirtyMechanism = true;

    this.controller = new FirstPersonController(this.camera, this.world, this.deps.mission.scene.spawn);
    this.hands = new Hands(scene, this.camera);
    this.interaction = new InteractionSystem(scene, this.camera, this.world, (id, kind) => this.maxDistance(id, kind), getSettings().quality !== "low");
    this.marker = this.buildMarker();
  }

  private setupShadows(s: Settings): void {
    this.shadow?.dispose();
    this.shadow = null;
    if (s.quality === "low") return;
    const sg = new ShadowGenerator(s.quality === "high" ? 2048 : 1024, this.sun);
    sg.usePercentageCloserFiltering = true;
    sg.bias = 0.002;
    sg.darkness = 0.35;
    this.world.shadowCasters.forEach((m) => sg.addShadowCaster(m, false));
    this.shadow = sg;
    this.scene.getMeshByName("ground")!.receiveShadows = true;
  }

  private applyQuality(s: Settings): void {
    this.engine.setHardwareScalingLevel(s.quality === "low" ? 1.5 : s.quality === "medium" ? 1.15 : 1 / Math.min(1.5, window.devicePixelRatio || 1));
  }

  private buildMarker(): TransformNode {
    const root = new TransformNode("objMarker", this.scene);
    const mat = new StandardMaterial("markerMat", this.scene);
    mat.emissiveColor = Color3.FromHexString("#ffb000");
    mat.diffuseColor = Color3.FromHexString("#ff7a1a");
    mat.disableLighting = true;
    const top = CreateCylinder("mk1", { diameterTop: 0.45, diameterBottom: 0, height: 0.4, tessellation: 4 }, this.scene);
    const bot = CreateCylinder("mk2", { diameterTop: 0, diameterBottom: 0.45, height: 0.18, tessellation: 4 }, this.scene);
    bot.position.y = 0.29;
    for (const m of [top, bot]) {
      m.material = mat;
      m.parent = root;
      m.isPickable = false;
      m.renderOutline = true;
      m.outlineColor = Color3.FromHexString("#0b1220");
      m.outlineWidth = 0.02;
    }
    root.setEnabled(false);
    return root;
  }

  private initUi(): void {
    this.hud = new Hud({ onHelp: () => this.requestHint(), onChecklist: () => this.toggleChecklist(), onToolbox: () => this.openToolbox() });
    this.minimap = new Minimap(this.world.map, () => t("hud.north"));
    this.hud.mountMinimap(this.minimap.el);
    this.overlays = new OverlayStack(this.el);
    this.checklist = new ChecklistDevice(this.ctrl, this.assistance, () => this.overlays.closeTop());
    this.el.append(this.hud.el, this.checklist.el);
    this.hud.setMission(t(this.deps.mission.titleKey));
    this.hud.setTool(null);
    this.input = new InputManager(this.canvas);
    audio.setCaptionHandler((key) => this.hud.caption(t(key)));
    this.refreshHud();
  }

  private bindEvents(): void {
    const on = <K extends keyof WindowEventMap>(target: Window | Document, ev: K | string, fn: EventListener, opts?: AddEventListenerOptions) => {
      target.addEventListener(ev, fn, opts);
      this.disposers.push(() => target.removeEventListener(ev, fn, opts));
    };
    on(window, "resize", () => {
      this.engine.resize();
      this.minimap.onResize();
    });
    on(document, "pointerlockchange", () => this.onPointerLockChange());
    on(document, "pointerlockerror", () => this.onPointerLockDenied());
    on(window, "blur", () => this.onFocusLost());
    on(document, "visibilitychange", () => document.hidden && this.onFocusLost());
    on(window, "pagehide", () => void this.ctrl.flush());
    this.canvas.addEventListener("click", () => this.requestLock());
    this.disposers.push(this.input.onAction((a, e) => this.onAction(a, e)));
    this.disposers.push(this.overlays.onChange(() => this.onCaptureChange()));
    this.disposers.push(this.ctrl.onEmit((rec) => this.onEmitted(rec)));
    this.disposers.push(this.ctrl.onSync((online, pending) => this.hud.setSync(online, pending)));
    this.disposers.push(
      onSettingsChange((s) => {
        this.controller.sensitivity = s.sensitivity;
        this.controller.invertY = s.invertY;
        this.applyQuality(s);
        this.setupShadows(s);
      }),
    );
    this.disposers.push(
      onLanguageChange(() => {
        this.hud.relabel();
        this.world.relabel();
        this.hud.setMission(t(this.deps.mission.titleKey));
        this.hud.setTool(this.selectedTool ? t(`tool.${this.selectedTool}.name`) : null);
        if (this.checklist.isOpen) this.checklist.render();
        this.refreshHud();
      }),
    );
    this.engine.onContextLostObservable.add(() => {
      toast(t("notify.contextLost"), "warn");
      this.openPause();
    });
    this.engine.onContextRestoredObservable.add(() => toast(t("notify.contextRestored"), "success"));
    const s = getSettings();
    this.controller.sensitivity = s.sensitivity;
    this.controller.invertY = s.invertY;
    if (import.meta.env.DEV || new URLSearchParams(location.search).has("e2e")) this.exposeTestHooks();
  }

  // ---------------------------------------------------------------- lifecycle / story entry (Scene 01)
  private begin(): void {
    audio.unlock();
    audio.startAmbient();
    const fresh = this.ctrl.st.completed.length === 0 && this.ctrl.st.lastSeq === 0;
    if (fresh) {
      this.playIntro();
      return;
    }
    // Restored session (refresh / Continue Training): resume in a paused state so the trainee re-engages deliberately.
    toast(t("notify.sessionRestored"), "success");
    this.restorePosition();
    if (this.ctrl.state === "BLOCKED") {
      const rule = this.deps.mission.criticalErrors.find((c) => c.id === this.ctrl.st.blockedBy);
      if (rule) this.showBlock(rule);
    } else if (this.ctrl.state === "BRIEFING" && (this.legacy ? this.ctrl.isDone("meet_supervisor") : this.ctrl.current()?.trigger.type === "briefing_acknowledged")) {
      this.openBriefing();
    } else {
      this.openPause();
    }
  }

  /** After refresh, place the player near the last relevant area instead of the gate. */
  private restorePosition(): void {
    if (!this.legacy) {
      const sc = this.deps.mission.scene;
      const briefed = this.deps.mission.steps.some((s) => s.trigger.type === "briefing_acknowledged" && this.ctrl.isDone(s.id));
      const npc = this.deps.mission.npcs.find((n) => n.id === sc.briefingNpc) ?? this.deps.mission.npcs[0];
      if (briefed && sc.workPoint) this.controller.teleport(sc.workPoint.x, sc.workPoint.z, (sc.workPoint.heading * Math.PI) / 180, 0);
      else if (npc) {
        const hd = (npc.heading * Math.PI) / 180;
        this.controller.teleport(npc.x + Math.sin(hd) * 2.2, npc.z + Math.cos(hd) * 2.2, hd + Math.PI, 0);
      }
      return;
    }
    const cur = this.ctrl.current();
    const target = cur ? this.markerPosition(cur) : null;
    if (target && this.ctrl.isDone("briefing")) {
      this.controller.teleport(0, -2.5, 0, 0);
    } else if (this.ctrl.isDone("arrive")) {
      const npc = this.deps.mission.npcs[0];
      if (npc) this.controller.teleport(npc.x, npc.z - 2.5, 0, 0);
    }
  }

  private playIntro(): void {
    const spawn = this.deps.mission.scene.spawn;
    const cin = this.deps.mission.scene.cinematic;
    this.hud.setVisible(false);
    this.hands.setPose("hidden");
    this.cinematic = {
      t: 0,
      dur: 7,
      from: this.legacy ? new Vector3(-30, 34, -48) : new Vector3(spawn.x - 26, 30, spawn.z - 20),
      to: new Vector3(spawn.x, EYE_HEIGHT, spawn.z),
      lookFrom: this.legacy ? new Vector3(0, 4, 8) : new Vector3(0, 3, 2),
      lookTo: new Vector3(spawn.x, EYE_HEIGHT, spawn.z + 10),
      done: () => {
        this.cinematic = null;
        this.hud.setVisible(true);
        this.hands.setPose("idle");
        this.controller.teleport(spawn.x, spawn.z, (spawn.heading * Math.PI) / 180, 0);
        this.ctrl.emit("world_entered");
        const first = this.ctrl.current();
        void this.hud.showBanner(this.legacy || !first ? t("story.reportToSupervisor") : this.stepTitle(first), t("story.newObjective"), "objective");
        this.hud.showClickHint(!this.input.pointerLocked);
      },
    };
    if (cin) {
      const skip = h("button", { class: "btn btn-ghost cinematic-skip", id: "cinematic-skip", onclick: () => this.skipCinematic() }, t("story.skip"));
      const card = h("div", { class: "cinematic-card" }, h("div", { class: "cin-day" }, t(cin.dayKey)), h("div", { class: "cin-title" }, t(cin.titleKey)), h("div", { class: "cin-loc" }, t(cin.locationKey)), skip);
      this.el.append(h("div", { class: "cinematic-bars", id: "cinematic" }, card));
    }
    const onKey = (e: KeyboardEvent) => {
      if (["Space", "Enter", "Escape"].includes(e.code)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        this.skipCinematic();
      }
    };
    document.addEventListener("keydown", onKey, true);
    this.disposers.push(() => document.removeEventListener("keydown", onKey, true));
    this.cinematicKeyCleanup = () => document.removeEventListener("keydown", onKey, true);
  }

  private cinematicKeyCleanup: (() => void) | null = null;

  private skipCinematic(): void {
    if (!this.cinematic) return;
    const done = this.cinematic.done;
    this.cinematic = null;
    this.endCinematicUi();
    done();
  }

  private endCinematicUi(): void {
    this.el.querySelector("#cinematic")?.remove();
    this.cinematicKeyCleanup?.();
    this.cinematicKeyCleanup = null;
  }

  // ---------------------------------------------------------------- frame loop
  private frame = (): void => {
    if (this.disposed) return;
    const dt = Math.min(0.05, this.engine.getDeltaTime() / 1000);
    this.time += dt;
    if (this.cinematic) {
      const c = this.cinematic;
      c.t += dt;
      const k = Math.min(1, c.t / c.dur);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      this.camera.position = Vector3.Lerp(c.from, c.to, e);
      this.camera.setTarget(Vector3.Lerp(c.lookFrom, c.lookTo, e));
      if (k >= 1) {
        this.endCinematicUi();
        const done = c.done;
        this.cinematic = null;
        done();
      }
    } else {
      this.controller.enabled = this.canControl();
      this.controller.update(dt, this.input);
      if (this.canControl()) this.checkZones();
    }
    this.hands.update(dt, this.controller.speed);
    this.interaction.enabled = this.canControl();
    const target = this.interaction.update(); // returns null and clears highlight when disabled
    this.updatePrompt(target);
    const playerPos = this.camera.position;
    this.world.update(dt, this.time, playerPos);
    this.updateMarkers(dt);
    if (this.ctrl.state !== "PAUSED" && !this.ctrl.terminal) this.activeMs += dt * 1000;
    this.hud.setTimer(this.activeMs);
    this.hud.setFps(getSettings().showFps ? this.engine.getFps() : null);
    this.watchPerformance(dt);
    this.autoHint();
    this.scene.render();
  };

  private canControl(): boolean {
    return !this.cinematic && !this.overlays.open && !this.dialogueOpen && !this.checklist.isOpen && !this.ending && this.ctrl.state !== "PAUSED";
  }

  private watchPerformance(dt: number): void {
    const fps = this.engine.getFps();
    if (fps < 30 && getSettings().quality !== "low" && !this.cinematic) {
      this.lowFpsFor += dt;
      if (this.lowFpsFor > 6) {
        this.lowFpsFor = 0;
        const s = getSettings();
        // Step quality down for this session only (does not overwrite the saved preference).
        const next = s.quality === "high" ? "medium" : "low";
        this.applyQuality({ ...s, quality: next });
        this.setupShadows({ ...s, quality: next });
        toast(t("notify.lowFps"), "warn");
      }
    } else this.lowFpsFor = 0;
  }

  // ---------------------------------------------------------------- HUD state
  private stepTitle(step: Step | null): string {
    if (!step) return t("hud.noObjective");
    const always = ["arrive", "meet_supervisor", "briefing"].includes(step.id) || step.trigger.type === "npc_interacted" || step.trigger.type === "briefing_acknowledged";
    return this.assistance.objectiveDetail === "minimal" && !always ? t("hud.minimalObjective") : tx(step.titleKey);
  }

  private refreshHud(): void {
    const m = this.deps.mission;
    const cur = this.ctrl.current();
    const required = m.steps.filter((s) => !s.optional && (!s.condition || (s.condition.pathway ? s.condition.pathway === this.ctrl.ctx.pathway : this.ctrl.st.flags.includes(s.condition.flag ?? ""))));
    const done = required.filter((s) => this.ctrl.isDone(s.id)).length;
    const detail = cur && this.assistance.objectiveDetail === "full" && exists(instructionKey(cur)) ? t(instructionKey(cur)) : "";
    this.hud.setObjective(this.stepTitle(cur), detail, done, required.length);
    this.hud.setState(this.ctrl.state);
    const concepts = [...new Set(required.map((s) => s.concept))];
    const practised = concepts.filter((c) => required.some((s) => s.concept === c && this.ctrl.isDone(s.id))).length;
    this.hud.setScene(cur?.scene ? tx(`scene.${cur.scene}`) : "", t("hud.learning", { done: practised, total: concepts.length }));
    const budget = this.ctrl.ctx.hintBudget;
    this.hud.setHints(Math.max(0, budget - this.ctrl.st.counters.hints), !!cur && (cur.hintKeys?.length ?? 0) > 0);
    if (this.checklist.isOpen) this.checklist.render();
  }

  private markerPosition(step: Step): Vector3 | null {
    const id = step.marker ?? step.trigger.target ?? null;
    if (!id) return null;
    if (this.isHidden(id)) return null;
    const a = this.world.anchors.get(id);
    if (a) return a.focus;
    const z = this.deps.mission.zones.find((zz) => zz.id === id);
    return z ? new Vector3((z.minX + z.maxX) / 2, 0.5, (z.minZ + z.maxZ) / 2) : null;
  }

  private updateMarkers(dt: number): void {
    void dt;
    const cur = this.ctrl.current();
    const pos = cur ? this.markerPosition(cur) : null;
    const showWorld = !!pos && this.assistance.worldMarkers && !this.ctrl.terminal && !this.cinematic;
    if (this.marker) {
      this.marker.setEnabled(showWorld);
      if (showWorld && pos) {
        this.marker.position.set(pos.x, Math.max(pos.y + 0.9, 1.4) + Math.sin(this.time * 3) * 0.08, pos.z);
        this.marker.rotation.y += 0.04;
      }
    }
    const markers: MapMarker[] = [];
    for (const n of this.deps.mission.npcs) if (!this.isHidden(n.id)) markers.push({ x: n.x, z: n.z, kind: "npc" });
    if (pos && this.assistance.minimapMarkers) markers.push({ x: pos.x, z: pos.z, kind: "objective" });
    this.minimap.draw(this.camera.position.x, this.camera.position.z, this.controller.yaw, markers);
  }

  private updatePrompt(target: ReturnType<InteractionSystem["update"]>): void {
    if (!target) return this.hud.setPrompt(null);
    const name = this.anchorName(target.id, target.kind);
    if (!target.inRange) return this.hud.setPrompt(t("prompt.tooFar", { name }), true);
    if (target.kind === "npc") return this.hud.setPrompt(t("prompt.talk", { name }));
    if (this.selectedTool) return this.hud.setPrompt(t("prompt.useTool", { tool: t(`tool.${this.selectedTool}.name`), name }));
    const it = this.deps.mission.interactables.find((i) => i.id === target.id);
    this.hud.setPrompt(t("prompt.action", { action: t(`world.prompt.${it?.promptKey.split(".").pop() ?? "inspect"}`), name }));
  }

  private anchorName(id: string, kind: "npc" | "interactable"): string {
    if (kind === "npc") {
      const n = this.deps.mission.npcs.find((x) => x.id === id);
      return n ? t(n.nameKey) : id;
    }
    const it = this.deps.mission.interactables.find((x) => x.id === id);
    return it ? t(it.nameKey) : id;
  }

  private maxDistance(id: string, kind: "npc" | "interactable"): number | null {
    if (kind === "npc") return this.deps.mission.npcs.find((n) => n.id === id)?.maxDistance ?? null;
    return this.deps.mission.interactables.find((i) => i.id === id)?.maxDistance ?? null;
  }

  // ---------------------------------------------------------------- zones (Scenes 01, 04)
  private checkZones(): void {
    const p = this.controller.pos;
    for (const z of this.deps.mission.zones) {
      const inside = insideRect(p, z);
      const was = this.zonesInside.has(z.id);
      if (inside && !was) {
        this.zonesInside.add(z.id);
        const restricted = this.deps.mission.scene.restrictedZones.includes(z.id);
        const wanted = this.deps.mission.steps.some((s) => s.trigger.type === "zone_entered" && s.trigger.target === z.id && !this.ctrl.isDone(s.id));
        if (restricted) {
          const now = performance.now();
          if (now - this.restrictedWarnAt > 8000) {
            this.restrictedWarnAt = now;
            this.ctrl.emit("zone_entered", z.id);
          }
        } else if (wanted) this.ctrl.emit("zone_entered", z.id);
      } else if (!inside && was) this.zonesInside.delete(z.id);
    }
  }

  // ---------------------------------------------------------------- input
  private onAction(a: Action, e: KeyboardEvent): void {
    if (this.cinematic || this.ending) return;
    if (a === "pause") {
      // Esc with an overlay open is handled by the overlay stack; with the checklist open it closes it.
      if (this.overlays.open || this.dialogueOpen) return;
      // Consume this Esc so the overlay stack does not immediately close the menu it just opened.
      e.stopPropagation();
      e.preventDefault();
      this.openPause();
      return;
    }
    if (this.overlays.open && !(a === "checklist" && this.checklist.isOpen)) return;
    if (this.dialogueOpen) return;
    if (this.ctrl.state === "PAUSED") return;
    e.preventDefault();
    switch (a) {
      case "interact":
        return this.interact();
      case "checklist":
        return this.toggleChecklist();
      case "toolbox":
        return this.openToolbox();
      case "map":
        return this.minimap.toggle();
      case "instructions":
        return this.openInstructions();
      case "hint":
        return this.requestHint();
      case "tool1":
      case "tool2":
      case "tool3": {
        const tool = this.deps.mission.tools[Number(a.slice(-1)) - 1];
        if (tool) this.selectTool(this.selectedTool === tool.id ? null : (tool.id as HeldTool));
        return;
      }
      default:
        return;
    }
  }

  private requestLock(): void {
    if (this.overlays.open || this.dialogueOpen || this.cinematic || this.input.pointerLocked) return;
    audio.unlock();
    try {
      const r = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
      r?.catch?.(() => this.onPointerLockDenied());
    } catch {
      this.onPointerLockDenied();
    }
  }

  private onPointerLockChange(): void {
    const locked = this.input.pointerLocked;
    this.hud.showClickHint(!locked && this.canControl());
    if (!locked && !this.expectUnlock && this.canControl() && !this.disposed) {
      // Browser released the pointer (usually Esc): treat as a pause request.
      this.openPause();
    }
    this.expectUnlock = false;
  }

  private onPointerLockDenied(): void {
    toast(t("notify.pointerLockDenied"), "warn", 6000);
    this.input.setDragLook(false);
    this.hud.showClickHint(false);
  }

  private releasePointer(): void {
    if (this.input.pointerLocked) {
      this.expectUnlock = true;
      document.exitPointerLock();
    }
    this.input.clear();
  }

  private onCaptureChange(): void {
    if (this.overlays.open) this.releasePointer();
    else this.hud.showClickHint(this.canControl() && !this.input.pointerLocked);
  }

  private onFocusLost(): void {
    if (this.disposed || this.cinematic || this.ctrl.terminal || this.ending) return;
    if (this.ctrl.state === "PAUSED" || this.pauseHandle) return;
    toast(t("notify.focusLost"), "info");
    this.openPause();
  }

  // ---------------------------------------------------------------- interaction
  private interact(): void {
    const target = this.interaction.current;
    if (!target) {
      if (this.selectedTool) this.useTool(null);
      return;
    }
    const name = this.anchorName(target.id, target.kind);
    if (!target.inRange) {
      this.hud.warn(t("prompt.tooFar", { name }), "info", 2200);
      return;
    }
    if (target.kind === "npc") return void this.talkTo(target.id);
    if (this.selectedTool) return this.useTool(target.id);
    const it = this.deps.mission.interactables.find((i) => i.id === target.id);
    if (!it) return;
    audio.play("interact");
    this.hands.setPose("inspect");
    const res = this.ctrl.emit("object_inspected", it.id);
    if (this.legacy && it.id === "checklist_station") return this.openStation();
    if (!this.legacy && it.panel && it.panel !== "inspect") return this.openWork(it);
    let extra: string | null = null;
    if (res.outcome === "rejected" && res.reason === "briefing") extra = t("story.reportFirst");
    const shown = this.detailOverride.has(it.id) ? { ...it, detailKeys: this.detailOverride.get(it.id)! } : it;
    this.overlays.push(inspectPanel(this.deps.mission, shown, extra, () => this.overlays.closeTop()), { onClose: () => this.hands.setPose("idle") });
  }

  private useTool(targetId: string | null): void {
    if (!this.selectedTool) return;
    const tool = this.selectedTool;
    const res = this.ctrl.emit("tool_used", targetId, tool);
    if (res.outcome === "invalid_action") {
      audio.play("error");
      const toolName = t(`tool.${tool}.name`);
      this.hud.warn(res.reason === "tool_needs_target" ? t("toolbox.needsTarget", { tool: toolName }) : t("toolbox.invalid", { tool: toolName, target: targetId ? this.anchorName(targetId, "interactable") : "—" }));
    } else if (res.outcome === "no_effect" || res.outcome === "step_completed") {
      audio.play("interact");
      if (tool === "radio") this.hud.warn(t("toolbox.radioMessage"), "info", 6000);
      if (tool === "flashlight") this.hud.warn(t("toolbox.flashlightMessage"), "info", 6000);
    } else if (res.outcome === "rejected" && res.reason === "briefing") {
      this.hud.warn(t("story.reportFirst"), "info");
    }
  }

  private selectTool(tool: HeldTool): void {
    this.selectedTool = tool;
    this.hands.setTool(tool);
    this.hud.setTool(tool ? t(`tool.${tool}.name`) : null);
    if (tool) this.ctrl.emit("tool_selected", null, tool);
    audio.play("click");
  }

  // ---------------------------------------------------------------- Scenes 02–03: supervisor & briefing
  private async talkTo(npcId: string): Promise<void> {
    const m = this.deps.mission;
    const npc = m.npcs.find((n) => n.id === npcId);
    if (!npc) return;
    audio.play("interact");
    if (!this.legacy) return this.talkGeneric(npcId);
    if (!this.ctrl.isDone("meet_supervisor")) {
      if (!this.ctrl.isDone("arrive")) this.ctrl.emit("zone_entered", "zone_briefing");
      await this.playDialogue(m.dialogues.arrival ?? []);
      const res = this.ctrl.emit("npc_interacted", npcId);
      if (res.outcome === "step_completed") this.openBriefing();
      return;
    }
    if (!this.ctrl.isDone("briefing")) {
      this.openBriefing();
      return;
    }
    const cur = this.ctrl.current();
    await this.playDialogue(m.dialogues.revisit ?? [], cur ? [{ speaker: npcId, text: `${t("story.currentTask")}: ${this.stepTitle(cur)}`, mood: "neutral" }] : []);
    this.ctrl.emit("npc_interacted", npcId);
  }

  private async playDialogue(lines: MissionDef["dialogues"][string], extra: { speaker: string; text: string; mood: "friendly" | "neutral" | "serious" | "concerned" | "pleased" }[] = []): Promise<DialogueOutcome> {
    this.releasePointer();
    this.dialogueOpen = true;
    this.hands.setPose("idle");
    const run = runDialogue({ host: this.el, npcs: this.deps.mission.npcs, lines, extra });
    const out = await run.done;
    this.dialogueOpen = false;
    this.hud.showClickHint(this.canControl() && !this.input.pointerLocked);
    return out;
  }

  /** Data-driven conversation: first matching talk rule, choices map to decision events. */
  private async talkGeneric(npcId: string): Promise<void> {
    const m = this.deps.mission;
    const npc = m.npcs.find((n) => n.id === npcId)!;
    const cur = this.ctrl.current();
    // Talking to the briefing NPC while the briefing is pending reopens it.
    if (cur?.trigger.type === "briefing_acknowledged" && npcId === (m.scene.briefingNpc ?? m.npcs[0]?.id)) {
      this.openBriefing();
      return;
    }
    const rule = (npc.talk ?? []).find((r) => ruleOk(r.when, this.ctrl.st));
    const lines = rule ? m.dialogues[rule.dialogue] ?? [] : [];
    const extra = rule ? [] : [{ speaker: npcId, text: cur ? `${t("story.currentTask")}: ${this.stepTitle(cur)}` : t("story.nothingMore"), mood: "neutral" as const }];
    let out = await this.playDialogue(lines, extra);
    const res = this.ctrl.emit("npc_interacted", npcId);
    // A conversation choice is a recorded decision; it may continue into a follow-up dialogue.
    for (let guard = 0; out.how === "choice" && out.choice && guard < 5; guard++) {
      const choice: DialogueChoice = out.choice;
      const r = this.ctrl.emit("decision_made", choice.group, choice.value);
      if (r.outcome === "critical_block" || r.outcome === "critical_fail" || this.ending) return;
      if (!choice.next || !m.dialogues[choice.next]) break;
      out = await this.playDialogue(m.dialogues[choice.next]);
    }
    if (this.ending) return;
    const next = this.ctrl.current();
    if (res.outcome === "step_completed" && next?.trigger.type === "briefing_acknowledged") this.openBriefing();
  }

  // ---------------------------------------------------------------- mission-specific work panels
  private openWork(it: Interactable): void {
    const render = (): HTMLElement =>
      workPanel(
        this.deps.mission,
        it,
        this.ctrl,
        { flagged: this.flagged, selected: this.selectedItems, details: this.detailOverride.get(it.id) ?? it.detailKeys },
        {
          onFlag: (id) => {
            const r = this.ctrl.emit("evidence_flagged", id);
            if (r.outcome !== "rejected" && r.outcome !== "prerequisite_missing") this.flagged.add(id);
            rerender();
          },
          onSelect: (id) => {
            const r = this.ctrl.emit("item_selected", id);
            if (r.outcome !== "rejected" && r.outcome !== "prerequisite_missing") this.selectedItems.add(id);
            rerender();
          },
          onDecide: (group, value) => {
            const r = this.ctrl.emit("decision_made", group, value);
            if (r.outcome === "critical_block" || r.outcome === "critical_fail" || r.missionCompleted) return;
            // A decision that completes an objective closes the panel so the next objective is visible.
            if (r.outcome === "step_completed") this.workHandle?.close();
            else rerender();
          },
          onClose: () => this.workHandle?.close(),
        },
        this.world.map,
      );
    const rerender = () => {
      if (!this.workHandle || this.ctrl.terminal) return;
      const panel = this.workHandle.el.firstElementChild;
      if (panel) panel.replaceWith(render());
    };
    this.workHandle = this.overlays.push(render(), { onClose: () => { this.workHandle = null; this.hands.setPose("idle"); } });
  }

  // ---------------------------------------------------------------- hidden objects & scripted scenario changes
  private isHidden(id: string): boolean {
    const it = this.deps.mission.interactables.find((i) => i.id === id) ?? this.deps.mission.npcs.find((n) => n.id === id);
    return !!it?.hiddenUntil && !this.ctrl.isDone(it.hiddenUntil);
  }

  private applyHidden(): void {
    for (const it of [...this.deps.mission.interactables, ...this.deps.mission.npcs]) if (it.hiddenUntil) this.world.setAnchorVisible?.(it.id, !this.isHidden(it.id));
  }

  /** Fire pre-authored world events whose conditions now hold. `live` = with dialogue/banner/sound. */
  private runWorldEvents(live: boolean): void {
    for (const ev of this.deps.mission.worldEvents ?? []) {
      if (this.firedEvents.has(ev.id) || !ruleOk(ev.when, this.ctrl.st)) continue;
      this.firedEvents.add(ev.id);
      if (!live) {
        this.applyWorldActions(ev, false);
        continue;
      }
      const run = () => !this.disposed && !this.ending && void this.applyWorldActions(ev, true);
      if (ev.delay) this.eventTimers.push(window.setTimeout(run, ev.delay * 1000));
      else run();
    }
  }

  private async applyWorldActions(ev: WorldEvent, live: boolean): Promise<void> {
    for (const a of ev.actions) {
      if (a.type === "prop_state") this.world.setPropState?.(String(a.prop), String(a.state));
      else if (a.type === "details") this.detailOverride.set(String(a.object), a.detailKeys as string[]);
      else if (!live) continue;
      else if (a.type === "sound") audio.play(a.sound as "alarm" | "warning" | "radio");
      else if (a.type === "banner") void this.hud.showBanner(tx(String(a.textKey)), t("story.situationChanged"), (a.style as "danger" | "objective") ?? "danger", 3200);
      else if (a.type === "dialogue") {
        const lines = this.deps.mission.dialogues[String(a.name)];
        if (lines && !this.dialogueOpen) {
          this.overlays.closeAll();
          await this.playDialogue(lines);
        }
      }
    }
  }

  private openBriefing(): void {
    let handle: OverlayHandle | null = null;
    const panel = briefingPanel(this.deps.mission, this.deps.session.focusConcepts, () => {
      const res = this.ctrl.emit("briefing_acknowledged");
      if (res.outcome === "step_completed") {
        handle?.close();
        audio.play("complete");
        void this.hud.showBanner(t("story.checklistUnlocked"), t(this.deps.mission.titleKey), "start", 2800);
      } else if (res.outcome === "rejected") {
        this.hud.warn(t("feedback.prerequisite", { step: (res.missing ?? []).map((id) => this.stepName(id)).join(", ") }));
      }
    });
    handle = this.overlays.push(panel, { closable: false });
  }

  // ---------------------------------------------------------------- checklist, toolbox, instructions
  private checklistHandle: OverlayHandle | null = null;

  private toggleChecklist(): void {
    if (this.checklist.isOpen) {
      this.checklistHandle?.close();
      return;
    }
    if (this.overlays.open || this.dialogueOpen) return;
    this.ctrl.emit("checklist_opened");
    this.checklist.setOpen(true);
    this.hands.setPose("checklist");
    this.checklistHandle = this.overlays.push(h("div"), {
      clear: true,
      onClose: () => {
        this.checklist.setOpen(false);
        this.hands.setPose("idle");
        this.checklistHandle = null;
      },
    });
  }

  private openToolbox(): void {
    if (this.overlays.open || this.dialogueOpen) return;
    let handle: OverlayHandle | null = null;
    const render = () => toolboxPanel(this.deps.mission, this.selectedTool, (id) => {
      this.selectTool(id as HeldTool);
      handle?.close();
    }, () => handle?.close());
    handle = this.overlays.push(render());
  }

  private openInstructions(): void {
    if (this.overlays.open) return;
    const handle = this.overlays.push(instructionsPanel(this.deps.mission, this.ctrl.current(), this.assistance, () => handle.close()));
  }

  // ---------------------------------------------------------------- hints
  private requestHint(): void {
    if (this.ctrl.state !== "ACTIVE" && this.ctrl.state !== "BRIEFING") return;
    const cur = this.ctrl.current();
    if (!cur || !cur.hintKeys.length) return;
    const res = this.ctrl.emit("hint_requested", cur.id);
    if (res.outcome === "hint") {
      const n = this.hintCount.get(cur.id) ?? 0;
      this.hintCount.set(cur.id, n + 1);
      const key = cur.hintKeys[Math.min(n, cur.hintKeys.length - 1)];
      this.hud.warn(`${t("feedback.hintPrefix")} ${tx(key)}`, "hint", 8000);
      audio.narrate(tx(key), document.documentElement.lang);
    } else {
      this.hud.warn(t("feedback.noHints"), "info");
    }
  }

  /** Fresher assistance: after a long idle on one step, repeat the instruction (not counted as a hint). */
  private autoHint(): void {
    const secs = this.assistance.autoHintSeconds;
    if (!secs || !this.canControl()) return;
    const cur = this.ctrl.current();
    if (!cur || this.autoHintShownFor === cur.id) return;
    if (performance.now() - this.lastStepAt > secs * 1000) {
      this.autoHintShownFor = cur.id;
      if (exists(instructionKey(cur))) this.hud.warn(t(instructionKey(cur)), "info", 7000);
    }
  }

  // ---------------------------------------------------------------- Scenes 10–11: station & decision
  private stationHandle: OverlayHandle | null = null;

  private openStation(): void {
    const render = () =>
      stationPanel(
        this.deps.mission,
        this.ctrl,
        this.flagged,
        (id) => {
          const res = this.ctrl.emit("evidence_flagged", id);
          if (res.outcome === "step_completed") this.flagged.add(id);
          this.rerenderStation(render);
        },
        (value) => {
          const res = this.ctrl.emit("decision_made", null, value);
          if (res.outcome === "mistake") this.rerenderStation(render);
        },
        () => this.stationHandle?.close(),
      );
    this.stationHandle = this.overlays.push(render(), { onClose: () => { this.stationHandle = null; this.hands.setPose("idle"); } });
  }

  private rerenderStation(render: () => HTMLElement): void {
    if (!this.stationHandle) return;
    const panel = this.stationHandle.el.firstElementChild;
    if (panel && this.ctrl.state === "ACTIVE") panel.replaceWith(render());
  }

  // ---------------------------------------------------------------- engine results → feedback
  private stepName(id: string): string {
    const s = this.deps.mission.steps.find((x) => x.id === id);
    return s ? tx(s.titleKey) : id;
  }

  private onEmitted({ event, result }: EmitRecord): void {
    this.refreshHud();
    this.feedback(event.type, result);
  }

  private feedback(type: string, r: ApplyResult): void {
    switch (r.outcome) {
      case "step_completed": {
        this.lastStepAt = performance.now();
        if (!this.legacy) {
          this.applyHidden();
          if (!r.missionCompleted) this.runWorldEvents(true);
        }
        this.autoHintShownFor = null;
        const required = (r.steps ?? []).filter((id) => !this.deps.mission.steps.find((s) => s.id === id)?.optional);
        if (required.length) {
          audio.play("complete");
          this.hud.warn(t("feedback.stepDone", { step: required.map((id) => this.stepName(id)).join(" · ") }), "success", 3200);
          const next = this.ctrl.current();
          if (next && !r.missionCompleted && !["briefing"].includes(required[0])) void this.hud.showBanner(this.stepTitle(next), next.scene ? tx(`scene.${next.scene}`) : t("story.newObjective"), "objective", 2400);
        }
        if (r.missionCompleted) void this.endSequence("completed");
        return;
      }
      case "prerequisite_missing":
        if (type === "checklist_opened") return; // opening the checklist early is fine
        this.hud.warn(t("feedback.prerequisite", { step: (r.missing ?? []).map((id) => this.stepName(id)).join(", ") }), "info");
        return;
      case "mistake":
        audio.play("error");
        this.hud.warn(r.feedbackKey ? tx(r.feedbackKey) : t("feedback.invalidAction"));
        return;
      case "invalid_action":
        if (type === "tool_used") return; // handled with tool-specific text
        audio.play("warning");
        this.hud.warn(r.feedbackKey ? tx(r.feedbackKey) : t("feedback.invalidAction"));
        return;
      case "advisory":
        this.hud.warn(r.feedbackKey ? tx(r.feedbackKey) : "", "info", 5000);
        return;
      case "critical_block": {
        const rule = this.deps.mission.criticalErrors.find((c) => c.id === r.ruleId);
        if (rule) void this.criticalSequence(rule);
        return;
      }
      case "critical_fail":
        void this.failSequence();
        return;
      default:
        return;
    }
  }

  // ---------------------------------------------------------------- Scene 12: unsafe decision
  private async criticalSequence(rule: CriticalError): Promise<void> {
    audio.play("warning");
    this.overlays.closeAll();
    void this.hud.showBanner(t("block.title"), t("story.safetyStop"), "danger", 2200);
    if (rule.dialogue && this.deps.mission.dialogues[rule.dialogue]) await this.playDialogue(this.deps.mission.dialogues[rule.dialogue]);
    this.showBlock(rule);
  }

  private showBlock(rule: CriticalError): void {
    let handle: OverlayHandle | null = null;
    handle = this.overlays.push(
      blockPanel(rule, () => {
        const res = this.ctrl.emit("block_acknowledged");
        if (res.outcome !== "rejected") handle?.close();
      }),
      { closable: false },
    );
  }

  private async failSequence(): Promise<void> {
    audio.play("warning");
    this.overlays.closeAll();
    await new Promise<void>((resolve) => {
      const handle = this.overlays.push(failedPanel(() => { handle.close(); resolve(); }), { closable: false });
    });
    await this.endSequence("failed");
  }

  // ---------------------------------------------------------------- Scenes 12–14: completion, comic, debrief
  private async endSequence(kind: "completed" | "failed"): Promise<void> {
    if (this.ending) return;
    this.ending = true;
    this.overlays.closeAll();
    this.releasePointer();
    this.selectTool(null);
    if (kind === "completed") {
      await this.hud.showBanner(t("story.missionComplete"), t(this.deps.mission.titleKey), "complete", 2400);
      await this.playDialogue(this.deps.mission.dialogues.correct ?? []);
    }
    // Scene 13: conceptual comic consequence panel.
    await new Promise<void>((resolve) => {
      const handle = this.overlays.push(comicPanel(this.deps.mission, () => { handle.close(); resolve(); }), { closable: false });
    });
    // Scene 14: debrief strictly from the server-assessed result.
    const waiting = h("div", { class: "panel", role: "status" }, h("div", { class: "spinner" }), h("p", {}, t("story.savingResults")));
    const wHandle = this.overlays.push(waiting, { closable: false });
    let session: SessionInfo;
    try {
      session = await Promise.race([
        this.ctrl.waitForAssessment(),
        new Promise<never>((_, rej) => window.setTimeout(() => rej(new Error("timeout")), 20000)),
      ]);
    } catch {
      wHandle.close();
      // Never fake a result: keep the session pending and let the trainee retry the sync.
      const retry = h("div", { class: "panel" }, h("p", { role: "alert" }, t("story.syncFailed")), h("button", { class: "btn btn-primary", id: "sync-retry", onclick: () => { r.close(); this.ending = false; void this.endSequence(kind); } }, t("app.retry")));
      const r = this.overlays.push(retry, { closable: false });
      return;
    }
    wHandle.close();
    const result = session.result;
    if (result) {
      const m = this.deps.mission;
      const mainKey = result.outcome === "not_passed" ? m.debriefKeys.failed : result.outcome === "critical_error" ? m.debriefKeys.critical : m.debriefKeys.success;
      const speaker = m.scene.briefingNpc ?? m.npcs[0]?.id ?? "supervisor";
      const lines = [mainKey, ...result.debriefKeys].map((k, i) => ({ speaker, text: tx(k), mood: (i === 0 ? (result.outcome === "mastery" || result.outcome === "pass" ? "pleased" : "serious") : "neutral") as "pleased" | "serious" | "neutral" }));
      await this.playDialogue([], lines);
    }
    this.deps.navigate(`/results/${this.deps.session.id}`);
  }

  // ---------------------------------------------------------------- pause menu
  openPause(): void {
    if (this.pauseHandle || this.disposed || this.ending) return;
    this.releasePointer();
    if (!this.ctrl.terminal && this.ctrl.state !== "PAUSED") this.ctrl.emit("paused");
    const resume = () => this.pauseHandle?.close();
    const panel = pausePanel({
      resume,
      restart: async () => {
        if (!(await confirmDialog(t("pause.confirmRestart"), t("pause.restart"), t("app.cancel")))) return;
        await this.ctrl.flush();
        try {
          await post(`/sessions/${this.deps.session.id}/abandon`);
          const s = await post<SessionInfo>("/sessions", { missionId: this.deps.mission.id });
          this.deps.navigate(`/play/${s.id}`);
        } catch (e) {
          toast(String((e as Error).message), "error");
        }
      },
      instructions: () => {
        const hnd = this.overlays.push(instructionsPanel(this.deps.mission, this.ctrl.current(), this.assistance, () => hnd.close()));
      },
      settings: () => {
        const close = h("button", { class: "btn btn-primary", onclick: () => hnd.close() }, t("app.close"));
        const hnd = this.overlays.push(h("div", { class: "panel wide" }, h("h2", {}, t("settings.title")), settingsPanel(), h("div", { class: "row end" }, close)));
      },
      exit: async () => {
        if (!(await confirmDialog(t("pause.confirmExit"), t("pause.exit"), t("app.cancel")))) return;
        await this.ctrl.flush();
        this.deps.navigate("/menu");
      },
    });
    this.pauseHandle = this.overlays.push(panel, {
      cls: "pause-overlay",
      onClose: () => {
        this.pauseHandle = null;
        if (this.ctrl.state === "PAUSED") this.ctrl.emit("resumed");
        this.hud.showClickHint(!this.input.pointerLocked);
      },
    });
  }

  // ---------------------------------------------------------------- test hooks (dev / e2e only)
  private exposeTestHooks(): void {
    (window as unknown as { __oi?: unknown }).__oi = {
      teleport: (x: number, z: number) => this.controller.teleport(x, z),
      lookAt: (x: number, y: number, z: number) => this.controller.lookAt(x, y, z),
      anchor: (id: string) => {
        const a = this.world.anchors.get(id);
        return a ? { x: a.focus.x, y: a.focus.y, z: a.focus.z } : null;
      },
      target: () => this.interaction.current,
      flags: () => ({ cinematic: !!this.cinematic, ending: this.ending, pause: !!this.pauseHandle, overlays: this.overlays.open, dialogue: this.dialogueOpen, checklist: this.checklist.isOpen }),
      pos: () => ({ x: this.controller.pos.x, z: this.controller.pos.z, yaw: this.controller.yaw }),
      state: () => ({ state: this.ctrl.state, completed: [...this.ctrl.st.completed], counters: { ...this.ctrl.st.counters }, pending: this.ctrl.pending }),
      fps: () => this.engine.getFps(),
      renderer: () => {
        const gl = this.engine._gl as WebGLRenderingContext | null;
        const ext = gl?.getExtension("WEBGL_debug_renderer_info");
        return ext && gl ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "unknown";
      },
      meshCount: () => this.scene.meshes.length,
      skipCinematic: () => this.skipCinematic(),
      current: () => this.ctrl.current(),
      stand: (id: string) => this.world.standPoint?.(id) ?? null,
      hidden: (id: string) => this.isHidden(id),
      reachable: (id: string) => {
        const goal = this.world.standPoint?.(id) ?? (() => {
          const n = this.deps.mission.npcs.find((x) => x.id === id);
          return n ? { x: n.x + Math.sin((n.heading * Math.PI) / 180) * 2, z: n.z + Math.cos((n.heading * Math.PI) / 180) * 2 } : null;
        })();
        if (!goal) return false;
        const sp = this.deps.mission.scene.spawn;
        return reachable(this.world, { x: sp.x, z: sp.z }, goal);
      },
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.eventTimers.forEach((id) => window.clearTimeout(id));
    void this.ctrl.flush();
    this.ctrl.dispose();
    this.disposers.forEach((fn) => fn());
    this.disposers = [];
    this.endCinematicUi();
    this.input?.dispose();
    this.overlays?.dispose();
    this.interaction?.dispose();
    this.hands?.dispose();
    audio.stopAmbient();
    audio.stopNarration();
    audio.setCaptionHandler(null);
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    this.engine?.stopRenderLoop();
    this.scene?.dispose();
    this.engine?.dispose();
    this.el.remove();
    delete (window as unknown as { __oi?: unknown }).__oi;
  }
}
