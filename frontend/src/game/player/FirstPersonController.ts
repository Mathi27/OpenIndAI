import type { FreeCamera } from "../babylon";
import type { InputManager } from "../input/InputManager";
import type { WorldBuild } from "../world/types";
import { resolve, stepVelocity, type Vec2 } from "./collision";

export const EYE_HEIGHT = 1.65;
const RADIUS = 0.32;
const WALK = 3.2;
const RUN = 5.2;
const MAX_PITCH = 1.35;

export class FirstPersonController {
  yaw = 0;
  pitch = 0;
  pos: Vec2;
  private vel: Vec2 = { x: 0, z: 0 };
  private bobPhase = 0;
  enabled = true;
  sensitivity = 1;
  invertY = false;

  constructor(private camera: FreeCamera, private world: WorldBuild, spawn: { x: number; z: number; heading: number }) {
    this.pos = { x: spawn.x, z: spawn.z };
    this.yaw = (spawn.heading * Math.PI) / 180;
    this.apply(0);
  }

  get speed(): number {
    return Math.hypot(this.vel.x, this.vel.z);
  }

  teleport(x: number, z: number, yaw?: number, pitch?: number): void {
    this.pos = resolve({ x, z }, RADIUS, this.world.colliders, this.world.circles, this.world.bounds);
    this.vel = { x: 0, z: 0 };
    if (yaw !== undefined) this.yaw = yaw;
    if (pitch !== undefined) this.pitch = pitch;
    this.apply(0);
  }

  /** Point the camera at a world position (used by tests and cinematic hand-off). */
  lookAt(x: number, y: number, z: number): void {
    const dx = x - this.pos.x;
    const dz = z - this.pos.z;
    this.yaw = Math.atan2(dx, dz);
    this.pitch = -Math.atan2(y - EYE_HEIGHT, Math.hypot(dx, dz));
    this.apply(0);
  }

  update(dt: number, input: InputManager): void {
    const look = input.consumeLook();
    if (!this.enabled) {
      this.vel = { x: 0, z: 0 };
      return;
    }
    const k = 0.0022 * this.sensitivity;
    const turn = input.keyTurn();
    this.yaw += look.dx * k + turn.yaw * 1.9 * dt;
    this.pitch += (this.invertY ? -1 : 1) * look.dy * k + turn.pitch * 1.4 * dt;
    this.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.pitch));

    const intent = input.moveIntent();
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    // Forward = (sin, cos); right = (cos, -sin) in Babylon's left-handed XZ.
    const wish = { x: sin * intent.z + cos * intent.x, z: cos * intent.z - sin * intent.x };
    this.vel = stepVelocity(this.vel, wish, dt, intent.run ? RUN : WALK);
    const next = { x: this.pos.x + this.vel.x * dt, z: this.pos.z + this.vel.z * dt };
    this.pos = resolve(next, RADIUS, this.world.colliders, this.world.circles, this.world.bounds);
    this.apply(dt);
  }

  private apply(dt: number): void {
    const moving = this.speed > 0.3;
    this.bobPhase = moving ? this.bobPhase + dt * this.speed * 2.6 : this.bobPhase * 0.9;
    const bob = moving ? Math.sin(this.bobPhase) * 0.03 : 0;
    this.camera.position.set(this.pos.x, EYE_HEIGHT + bob, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0);
  }
}
