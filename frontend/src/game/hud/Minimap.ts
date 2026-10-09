// Rotating, player-centred minimap drawn from the same world data used for
// geometry and collision, so it always matches the 3D scene.
import type { MapShape } from "../world/types";

export interface MapMarker {
  x: number;
  z: number;
  kind: "objective" | "npc" | "poi";
}

export class Minimap {
  readonly el: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  expanded = false;
  private size = 200;

  constructor(private shapes: MapShape[], private northLabel: () => string) {
    this.el = document.createElement("div");
    this.el.className = "minimap-wrap";
    this.el.setAttribute("role", "img");
    this.canvas = document.createElement("canvas");
    this.el.append(this.canvas);
    this.ctx = this.canvas.getContext("2d")!;
    this.resize();
  }

  toggle(): void {
    this.expanded = !this.expanded;
    this.el.classList.toggle("expanded", this.expanded);
    this.resize();
  }

  private resize(): void {
    const base = Math.min(window.innerWidth, window.innerHeight);
    this.size = Math.round(this.expanded ? Math.min(420, base * 0.55) : Math.max(140, Math.min(210, base * 0.25)));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.el.style.width = `${this.size}px`;
    this.el.style.height = `${this.size}px`;
    this.canvas.width = this.size * dpr;
    this.canvas.height = this.size * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  onResize(): void {
    this.resize();
  }

  draw(px: number, pz: number, yaw: number, markers: MapMarker[]): void {
    const c = this.ctx;
    const s = this.size;
    const scale = this.expanded ? s / 46 : s / 30; // pixels per metre
    c.save();
    c.clearRect(0, 0, s, s);
    c.fillStyle = "#0b1a2e";
    c.fillRect(0, 0, s, s);
    // GTA-style: the map rotates so the player always faces up.
    c.translate(s / 2, s / 2);
    c.rotate(-yaw);
    c.scale(scale, -scale); // world z (north) is up on screen
    c.translate(-px, -pz);
    for (const sh of this.shapes) {
      if (sh.kind === "rect") {
        c.fillStyle = sh.fill;
        c.fillRect(sh.rect.minX, sh.rect.minZ, sh.rect.maxX - sh.rect.minX, sh.rect.maxZ - sh.rect.minZ);
        if (sh.stroke) {
          c.strokeStyle = sh.stroke;
          c.lineWidth = 1.5 / scale;
          c.strokeRect(sh.rect.minX, sh.rect.minZ, sh.rect.maxX - sh.rect.minX, sh.rect.maxZ - sh.rect.minZ);
        }
      } else if (sh.kind === "circle") {
        c.fillStyle = sh.fill;
        c.beginPath();
        c.arc(sh.x, sh.z, sh.r, 0, Math.PI * 2);
        c.fill();
      } else {
        c.strokeStyle = sh.stroke;
        c.lineWidth = sh.width / scale;
        c.setLineDash(sh.dash ? sh.dash.map((d) => d / scale) : []);
        c.beginPath();
        c.moveTo(sh.pts[0][0], sh.pts[0][1]);
        for (const p of sh.pts.slice(1)) c.lineTo(p[0], p[1]);
        c.stroke();
        c.setLineDash([]);
      }
    }
    c.restore();

    // Markers (drawn in screen space so they stay upright; clamped to the edge when off-map).
    const half = s / 2;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    for (const m of markers) {
      const dx = (m.x - px) * scale;
      const dz = (m.z - pz) * scale;
      // Rotate world offset into screen space (screen up = player forward).
      let sx = dx * cos - dz * sin;
      let sy = -(dx * sin + dz * cos);
      const r = Math.hypot(sx, sy);
      const lim = half - 12;
      const clamped = r > lim;
      if (clamped) {
        sx = (sx / r) * lim;
        sy = (sy / r) * lim;
      }
      c.save();
      c.translate(half + sx, half + sy);
      if (m.kind === "objective") {
        c.fillStyle = "#ffc23d";
        c.strokeStyle = "#111";
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(0, -8);
        c.lineTo(7, 0);
        c.lineTo(0, 8);
        c.lineTo(-7, 0);
        c.closePath();
        c.fill();
        c.stroke();
      } else {
        c.fillStyle = m.kind === "npc" ? "#3fa9f5" : "#9fb3cf";
        c.beginPath();
        c.arc(0, 0, 5, 0, Math.PI * 2);
        c.fill();
      }
      c.restore();
    }
    // Player arrow at centre, always pointing up.
    c.save();
    c.translate(half, half);
    c.fillStyle = "#ff7a1a";
    c.strokeStyle = "#fff";
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(0, -10);
    c.lineTo(7, 8);
    c.lineTo(0, 4);
    c.lineTo(-7, 8);
    c.closePath();
    c.fill();
    c.stroke();
    c.restore();
    // North indicator orbiting the edge.
    const nx = half - Math.sin(yaw) * (half - 12);
    const ny = half - Math.cos(yaw) * (half - 12);
    c.fillStyle = "#e8423f";
    c.font = "bold 12px system-ui";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(this.northLabel(), nx, ny);
  }
}
