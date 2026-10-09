// Keyboard/mouse input. Action keys fire once per physical press (auto-repeat
// ignored) and nothing reaches the game while a text field has focus or an
// overlay has captured input.
export type Action = "interact" | "checklist" | "toolbox" | "map" | "instructions" | "pause" | "hint" | "tool1" | "tool2" | "tool3" | "advance";

const ACTION_KEYS: Record<string, Action> = {
  KeyE: "interact",
  KeyC: "checklist",
  KeyT: "toolbox",
  KeyM: "map",
  KeyI: "instructions",
  Escape: "pause",
  KeyH: "hint",
  Digit1: "tool1",
  Digit2: "tool2",
  Digit3: "tool3",
  Space: "advance",
  Enter: "advance",
};

const MOVE_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ShiftLeft", "ShiftRight"]);

export function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

export class InputManager {
  private down = new Set<string>();
  private handlers = new Set<(a: Action, e: KeyboardEvent) => void>();
  lookDX = 0;
  lookDY = 0;
  private dragging = false;

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener("keydown", this.onKeyDown, true);
    window.addEventListener("keyup", this.onKeyUp, true);
    window.addEventListener("blur", this.clear);
    document.addEventListener("mousemove", this.onMouseMove);
    canvas.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointerup", this.onPointerUp);
  }

  get pointerLocked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  onAction(fn: (a: Action, e: KeyboardEvent) => void): () => void {
    this.handlers.add(fn);
    return () => this.handlers.delete(fn);
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  /** Movement intent in local space: x = strafe (+right), z = forward. */
  moveIntent(): { x: number; z: number; run: boolean } {
    let x = 0;
    let z = 0;
    if (this.down.has("KeyW")) z += 1;
    if (this.down.has("KeyS")) z -= 1;
    if (this.down.has("KeyD")) x += 1;
    if (this.down.has("KeyA")) x -= 1;
    const len = Math.hypot(x, z) || 1;
    return { x: x / len, z: z / len, run: this.down.has("ShiftLeft") || this.down.has("ShiftRight") };
  }

  /** Arrow keys turn the view (fallback when pointer lock is unavailable). */
  keyTurn(): { yaw: number; pitch: number } {
    return {
      yaw: (this.down.has("ArrowRight") ? 1 : 0) - (this.down.has("ArrowLeft") ? 1 : 0),
      pitch: (this.down.has("ArrowDown") ? 1 : 0) - (this.down.has("ArrowUp") ? 1 : 0),
    };
  }

  consumeLook(): { dx: number; dy: number } {
    const r = { dx: this.lookDX, dy: this.lookDY };
    this.lookDX = 0;
    this.lookDY = 0;
    return r;
  }

  clear = (): void => {
    this.down.clear();
    this.lookDX = 0;
    this.lookDY = 0;
    this.dragging = false;
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (isTypingTarget(e.target)) return;
    if (MOVE_KEYS.has(e.code)) {
      this.down.add(e.code);
      if (e.code.startsWith("Arrow")) e.preventDefault();
    }
    const action = ACTION_KEYS[e.code];
    if (!action) return;
    if (e.code === "Space") e.preventDefault();
    if (e.repeat) return; // duplicate presses from key auto-repeat are ignored
    this.handlers.forEach((h) => h(action, e));
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.down.delete(e.code);
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (this.pointerLocked || this.dragging) {
      // Some browsers report spikes when pointer lock engages; clamp them.
      this.lookDX += Math.max(-200, Math.min(200, e.movementX));
      this.lookDY += Math.max(-200, Math.min(200, e.movementY));
    }
  };

  private onPointerDown = (e: PointerEvent): void => {
    if (!this.pointerLocked && e.button === 2) this.dragging = true;
  };

  private onPointerUp = (): void => {
    this.dragging = false;
  };

  setDragLook(on: boolean): void {
    this.dragging = on;
  }

  dispose(): void {
    window.removeEventListener("keydown", this.onKeyDown, true);
    window.removeEventListener("keyup", this.onKeyUp, true);
    window.removeEventListener("blur", this.clear);
    document.removeEventListener("mousemove", this.onMouseMove);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("pointerup", this.onPointerUp);
    this.handlers.clear();
  }
}
