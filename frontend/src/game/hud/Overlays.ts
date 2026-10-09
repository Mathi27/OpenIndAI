// Overlay stack: at most one modal panel per layer, Esc closes the top one,
// and the game is told whenever input capture changes.
import { h } from "../../ui/dom";

export interface OverlayHandle {
  el: HTMLElement;
  close: () => void;
}

interface Entry {
  el: HTMLElement;
  onClose?: () => void;
  closable: boolean;
}

export class OverlayStack {
  private stack: Entry[] = [];
  private listeners = new Set<(open: boolean) => void>();

  constructor(private host: HTMLElement) {
    document.addEventListener("keydown", this.onKey, true);
  }

  get open(): boolean {
    return this.stack.length > 0;
  }

  top(): HTMLElement | null {
    return this.stack[this.stack.length - 1]?.el ?? null;
  }

  has(cls: string): boolean {
    return this.stack.some((e) => e.el.classList.contains(cls));
  }

  onChange(fn: (open: boolean) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  push(panel: HTMLElement, opts: { onClose?: () => void; closable?: boolean; cls?: string; clear?: boolean } = {}): OverlayHandle {
    const el = h("div", { class: `overlay ${opts.cls ?? ""} ${opts.clear ? "clear" : ""}` }, panel);
    const entry: Entry = { el, onClose: opts.onClose, closable: opts.closable ?? true };
    this.stack.push(entry);
    this.host.append(el);
    const focusable = panel.querySelector<HTMLElement>("[autofocus], button:not([disabled]), [tabindex]");
    focusable?.focus({ preventScroll: true });
    this.emit();
    return { el, close: () => this.remove(entry) };
  }

  private remove(entry: Entry): void {
    const i = this.stack.indexOf(entry);
    if (i < 0) return;
    this.stack.splice(i, 1);
    entry.el.remove();
    entry.onClose?.();
    this.emit();
  }

  closeTop(): boolean {
    const top = this.stack[this.stack.length - 1];
    if (!top || !top.closable) return false;
    this.remove(top);
    return true;
  }

  closeAll(): void {
    while (this.stack.length) this.remove(this.stack[this.stack.length - 1]);
  }

  private emit(): void {
    this.listeners.forEach((fn) => fn(this.open));
  }

  private onKey = (e: KeyboardEvent): void => {
    if (e.code !== "Escape" || !this.stack.length || e.repeat) return;
    const top = this.stack[this.stack.length - 1];
    if (!top.closable) return;
    // Stop other document listeners (e.g. dialogue skip) from also reacting to this Esc.
    e.stopImmediatePropagation();
    e.preventDefault();
    this.closeTop();
  };

  dispose(): void {
    document.removeEventListener("keydown", this.onKey, true);
    this.stack.forEach((e) => e.el.remove());
    this.stack = [];
    this.listeners.clear();
  }
}
