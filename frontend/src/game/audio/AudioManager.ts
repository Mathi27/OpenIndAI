// Procedural WebAudio sounds (original, generated at runtime — no asset files).
// Audio is never the only carrier of information: every cue has a caption.
import { getSettings, onSettingsChange, type Settings } from "../../app/settings";

export type Sfx = "click" | "interact" | "complete" | "warning" | "error" | "alarm" | "radio";

type CaptionFn = (key: string) => void;

class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private fx: GainNode | null = null;
  private amb: GainNode | null = null;
  private ambientNodes: AudioNode[] = [];
  private captionFn: CaptionFn | null = null;

  constructor() {
    onSettingsChange((s) => this.applyVolumes(s));
  }

  /** Must be called from a user gesture (browser autoplay policy). */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.fx = this.ctx.createGain();
      this.amb = this.ctx.createGain();
      this.fx.connect(this.master);
      this.amb.connect(this.master);
      this.master.connect(this.ctx.destination);
      this.applyVolumes(getSettings());
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  get unlocked(): boolean {
    return this.ctx?.state === "running";
  }

  setCaptionHandler(fn: CaptionFn | null): void {
    this.captionFn = fn;
  }

  private applyVolumes(s: Settings): void {
    if (!this.master || !this.fx || !this.amb || !this.ctx) return;
    const now = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.muted ? 0 : s.master, now, 0.05);
    this.fx.gain.setTargetAtTime(s.effects, now, 0.05);
    this.amb.gain.setTargetAtTime(s.ambient * 0.5, now, 0.2);
  }

  play(kind: Sfx): void {
    const caption = { complete: "captions.complete", warning: "captions.warning", error: "captions.error", alarm: "captions.alarm", radio: "captions.radio" } as Record<string, string>;
    if (caption[kind] && getSettings().captions) this.captionFn?.(caption[kind]);
    if (!this.ctx || !this.fx) return;
    const tones: Record<Sfx, [number, number, number][]> = {
      click: [[880, 0, 0.05]],
      interact: [[660, 0, 0.08], [990, 0.07, 0.1]],
      complete: [[523, 0, 0.12], [659, 0.1, 0.12], [784, 0.2, 0.22]],
      warning: [[880, 0, 0.18], [587, 0.2, 0.18], [880, 0.4, 0.18], [587, 0.6, 0.18]],
      error: [[220, 0, 0.25]],
      alarm: [[740, 0, 0.35], [520, 0.35, 0.35], [740, 0.7, 0.35], [520, 1.05, 0.35], [740, 1.4, 0.35], [520, 1.75, 0.35]],
      radio: [[1200, 0, 0.04], [1500, 0.06, 0.05], [900, 0.14, 0.08]],
    };
    const t0 = this.ctx.currentTime;
    for (const [freq, at, dur] of tones[kind]) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = kind === "warning" || kind === "error" ? "square" : kind === "alarm" ? "sawtooth" : "sine";
      o.frequency.value = freq;
      g.gain.setValueAtTime(0, t0 + at);
      g.gain.linearRampToValueAtTime(kind === "warning" || kind === "alarm" ? 0.1 : 0.2, t0 + at + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
      o.connect(g).connect(this.fx);
      o.start(t0 + at);
      o.stop(t0 + at + dur + 0.02);
    }
  }

  startAmbient(): void {
    if (!this.ctx || !this.amb || this.ambientNodes.length) return;
    if (getSettings().captions) this.captionFn?.("captions.ambient");
    // Filtered noise (plant hiss) + low mains hum.
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; // brown noise
      data[i] = last * 3.5;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 500;
    noise.connect(lp).connect(this.amb);
    const hum = this.ctx.createOscillator();
    hum.frequency.value = 50;
    const humGain = this.ctx.createGain();
    humGain.gain.value = 0.05;
    hum.connect(humGain).connect(this.amb);
    noise.start();
    hum.start();
    this.ambientNodes = [noise, hum, lp, humGain];
  }

  stopAmbient(): void {
    for (const n of this.ambientNodes) {
      if (n instanceof AudioScheduledSourceNode) n.stop();
      n.disconnect();
    }
    this.ambientNodes = [];
  }

  /** Optional narration using the browser's local speech synthesis. Text is always shown on screen too. */
  narrate(text: string, lang: string): void {
    const s = getSettings();
    if (!s.narrationEnabled || s.muted || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = { en: "en-IN", ta: "ta-IN", hi: "hi-IN" }[lang] ?? "en-IN";
    u.volume = s.narration * s.master;
    window.speechSynthesis.speak(u);
  }

  stopNarration(): void {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }
}

export const audio = new AudioManager();
