// Comic speech-bubble dialogue with portrait, name, mood, subtitles,
// keyboard control (Space/Enter/E = next, Esc = skip) and optional narration.
// A missing translation or voice never blocks progression.
import { currentLanguage, exists, t } from "../../i18n";
import { h } from "../../ui/dom";
import { audio } from "../audio/AudioManager";
import type { DialogueChoice, DialogueLine, Npc } from "../../mission/types";
import { portrait } from "./portraits";

export interface DialogueOptions {
  host: HTMLElement;
  npcs: Npc[];
  lines: DialogueLine[];
  /** Additional resolved text lines appended (e.g. debrief built from results). */
  extra?: { speaker: string; text: string; mood: DialogueLine["mood"] }[];
  onLine?: (index: number) => void;
}

export interface DialogueOutcome {
  how: "completed" | "skipped" | "choice";
  choice?: DialogueChoice;
}

type Resolved = { speaker: string; text: string; mood: DialogueLine["mood"]; choices?: DialogueChoice[] };

export function runDialogue(opts: DialogueOptions): { done: Promise<DialogueOutcome>; skip: () => void; isOpen: () => boolean } {
  const all: Resolved[] = [
    ...opts.lines.map((l) => ({ speaker: l.speaker, text: exists(l.textKey) ? t(l.textKey) : `[${l.textKey}]`, mood: l.mood, choices: l.choices })),
    ...(opts.extra ?? []),
  ].filter((l) => l.text.trim().length > 0);
  let index = 0;
  let typing: number | null = null;
  let open = true;
  let resolveFn: (v: DialogueOutcome) => void = () => {};
  const done = new Promise<DialogueOutcome>((r) => (resolveFn = r));

  const portraitBox = h("div", { class: "dlg-portrait" });
  const name = h("div", { class: "dlg-name" });
  const role = h("div", { class: "dlg-role" });
  const text = h("p", { class: "dlg-text", "aria-live": "polite", id: "dlg-text" });
  const counter = h("span", { class: "dlg-counter" });
  const next = h("button", { class: "btn btn-primary dlg-next", id: "dlg-next" });
  const skipBtn = h("button", { class: "btn btn-ghost dlg-skip", id: "dlg-skip" }, t("dialogue.skip"));
  const choiceBox = h("div", { class: "dlg-choices", role: "group" });
  const root = h(
    "div",
    { class: "dlg-root", role: "dialog", "aria-modal": "false", "aria-label": t("dialogue.label") },
    h("div", { class: "dlg-panel" }, portraitBox, h("div", { class: "dlg-bubble" }, h("div", { class: "dlg-head" }, name, role, counter), text, choiceBox, h("div", { class: "dlg-actions" }, skipBtn, next))),
  );

  const finish = (how: DialogueOutcome["how"], choice?: DialogueChoice) => {
    if (!open) return;
    open = false;
    if (typing !== null) window.clearInterval(typing);
    audio.stopNarration();
    document.removeEventListener("keydown", onKey, true);
    root.classList.add("out");
    window.setTimeout(() => root.remove(), 220);
    resolveFn({ how, choice });
  };

  const show = (i: number) => {
    const line = all[i];
    if (!line) return finish("completed");
    const npc = opts.npcs.find((n) => n.id === line.speaker);
    const self = line.speaker === "self";
    // "self" lines are the trainee's own thoughts (thought-bubble style).
    root.classList.toggle("thought", self);
    portraitBox.replaceChildren(portrait(npc?.portrait ?? line.speaker, line.mood));
    portraitBox.dataset.mood = line.mood;
    name.textContent = npc ? t(npc.nameKey) : self ? t("dialogue.you") : line.speaker;
    role.textContent = npc ? t(npc.roleKey) : self ? t("dialogue.thinking") : "";
    counter.textContent = `${i + 1}/${all.length}`;
    next.textContent = i === all.length - 1 ? t("dialogue.done") : t("dialogue.next");
    const choices = line.choices ?? [];
    next.hidden = choices.length > 0;
    choiceBox.replaceChildren(
      ...choices.map((c, ci) =>
        h("button", { class: "btn dlg-choice", "data-choice": `${c.group}:${c.value}`, onclick: () => finish("choice", c) }, `${ci + 1}. ${exists(c.labelKey) ? t(c.labelKey) : c.labelKey}`),
      ),
    );
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
    if (all[index]?.choices?.length) return; // wait for the player's choice
    index += 1;
    if (index >= all.length) finish("completed");
    else show(index);
  };

  const onKey = (e: KeyboardEvent) => {
    if (!open || document.querySelector(".overlay.pause-overlay")) return; // paused: leave input to the pause menu
    const choices = all[index]?.choices ?? [];
    if (choices.length && /^Digit[1-9]$/.test(e.code)) {
      const c = choices[Number(e.code.slice(5)) - 1];
      if (c) {
        e.preventDefault();
        e.stopPropagation();
        finish("choice", c);
      }
      return;
    }
    if (choices.length && (e.code === "Space" || e.code === "Enter" || e.code === "KeyE")) {
      // A decision is required: finish typing but never auto-advance past a choice.
      e.preventDefault();
      e.stopPropagation();
      if (typing !== null) advance();
      return;
    }
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
