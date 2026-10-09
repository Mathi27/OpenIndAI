// Comic speech-bubble dialogue with portrait, name, mood, subtitles,
// keyboard control (Space/Enter/E = next, Esc = skip) and optional narration.
// A missing translation or voice never blocks progression.
import { currentLanguage, exists, t } from "../../i18n";
import { h } from "../../ui/dom";
import { audio } from "../audio/AudioManager";
import type { DialogueLine, Npc } from "../../mission/types";
import { portrait } from "./portraits";

export interface DialogueOptions {
  host: HTMLElement;
  npcs: Npc[];
  lines: DialogueLine[];
  /** Additional resolved text lines appended (e.g. debrief built from results). */
  extra?: { speaker: string; text: string; mood: DialogueLine["mood"] }[];
  onLine?: (index: number) => void;
}

export function runDialogue(opts: DialogueOptions): { done: Promise<"completed" | "skipped">; skip: () => void; isOpen: () => boolean } {
  const all = [
    ...opts.lines.map((l) => ({ speaker: l.speaker, text: exists(l.textKey) ? t(l.textKey) : `[${l.textKey}]`, mood: l.mood })),
    ...(opts.extra ?? []),
  ].filter((l) => l.text.trim().length > 0);
  let index = 0;
  let typing: number | null = null;
  let open = true;
  let resolveFn: (v: "completed" | "skipped") => void = () => {};
  const done = new Promise<"completed" | "skipped">((r) => (resolveFn = r));

  const portraitBox = h("div", { class: "dlg-portrait" });
  const name = h("div", { class: "dlg-name" });
  const role = h("div", { class: "dlg-role" });
  const text = h("p", { class: "dlg-text", "aria-live": "polite", id: "dlg-text" });
  const counter = h("span", { class: "dlg-counter" });
  const next = h("button", { class: "btn btn-primary dlg-next", id: "dlg-next" });
  const skipBtn = h("button", { class: "btn btn-ghost dlg-skip", id: "dlg-skip" }, t("dialogue.skip"));
  const root = h(
    "div",
    { class: "dlg-root", role: "dialog", "aria-modal": "false", "aria-label": t("dialogue.label") },
    h("div", { class: "dlg-panel" }, portraitBox, h("div", { class: "dlg-bubble" }, h("div", { class: "dlg-head" }, name, role, counter), text, h("div", { class: "dlg-actions" }, skipBtn, next))),
  );

  const finish = (how: "completed" | "skipped") => {
    if (!open) return;
    open = false;
    if (typing !== null) window.clearInterval(typing);
    audio.stopNarration();
    document.removeEventListener("keydown", onKey, true);
    root.classList.add("out");
    window.setTimeout(() => root.remove(), 220);
    resolveFn(how);
  };

  const show = (i: number) => {
    const line = all[i];
    if (!line) return finish("completed");
    const npc = opts.npcs.find((n) => n.id === line.speaker);
    portraitBox.replaceChildren(portrait(npc?.portrait ?? line.speaker, line.mood));
    portraitBox.dataset.mood = line.mood;
    name.textContent = npc ? t(npc.nameKey) : line.speaker;
    role.textContent = npc ? t(npc.roleKey) : "";
    counter.textContent = `${i + 1}/${all.length}`;
    next.textContent = i === all.length - 1 ? t("dialogue.done") : t("dialogue.next");
    // Typewriter effect; the full text is available immediately to screen readers via aria-live after typing.
    text.textContent = "";
    let n = 0;
    const chars = Array.from(line.text);
    if (typing !== null) window.clearInterval(typing);
    typing = window.setInterval(() => {
      n += 2;
      text.textContent = chars.slice(0, n).join("");
      if (n >= chars.length && typing !== null) {
        window.clearInterval(typing);
        typing = null;
      }
    }, 18);
    audio.play("click");
    audio.narrate(line.text, currentLanguage());
    opts.onLine?.(i);
  };

  const advance = () => {
    if (typing !== null) {
      window.clearInterval(typing);
      typing = null;
      text.textContent = all[index].text;
      return;
    }
    index += 1;
    if (index >= all.length) finish("completed");
    else show(index);
  };

  const onKey = (e: KeyboardEvent) => {
    if (!open || document.querySelector(".overlay.pause-overlay")) return; // paused: leave input to the pause menu
    if (e.code === "Space" || e.code === "Enter" || e.code === "KeyE") {
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat) advance();
    } else if (e.code === "Escape" && !document.pointerLockElement) {
      // Esc while the mouse is free skips the conversation (it is never lost: it can be replayed by talking again).
      e.stopPropagation();
      finish("skipped");
    }
  };
  next.addEventListener("click", advance);
  skipBtn.addEventListener("click", () => finish("skipped"));
  document.addEventListener("keydown", onKey, true);
  opts.host.append(root);
  if (all.length === 0) finish("completed");
  else show(0);
  next.focus({ preventScroll: true });
  return { done, skip: () => finish("skipped"), isOpen: () => open };
}
