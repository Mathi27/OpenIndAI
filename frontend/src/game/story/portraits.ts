// Original comic-style character portraits (inline SVG, mood-dependent).
import type { Mood } from "../../mission/types";

const MOUTHS: Record<Mood, string> = {
  friendly: '<path d="M38 66 q12 10 24 0" stroke="#3a1d0e" stroke-width="3.5" fill="none" stroke-linecap="round"/>',
  pleased: '<path d="M36 64 q14 14 28 0 z" fill="#3a1d0e"/>',
  neutral: '<path d="M40 67 h20" stroke="#3a1d0e" stroke-width="3.5" stroke-linecap="round"/>',
  serious: '<path d="M39 69 q11 -5 22 0" stroke="#3a1d0e" stroke-width="3.5" fill="none" stroke-linecap="round"/>',
  concerned: '<path d="M39 70 q11 -8 22 0" stroke="#3a1d0e" stroke-width="3.5" fill="none" stroke-linecap="round"/>',
};
const BROWS: Record<Mood, string> = {
  friendly: '<path d="M33 41 q6 -4 12 0 M55 41 q6 -4 12 0" stroke="#2a1608" stroke-width="3" fill="none"/>',
  pleased: '<path d="M33 40 q6 -5 12 0 M55 40 q6 -5 12 0" stroke="#2a1608" stroke-width="3" fill="none"/>',
  neutral: '<path d="M33 42 h12 M55 42 h12" stroke="#2a1608" stroke-width="3"/>',
  serious: '<path d="M33 40 l12 4 M67 40 l-12 4" stroke="#2a1608" stroke-width="3.5"/>',
  concerned: '<path d="M33 44 l12 -4 M67 44 l-12 -4" stroke="#2a1608" stroke-width="3.5"/>',
};

// One consistent look per recurring character (matches ROSTER_LOOK in the 3D world).
const LOOKS: Record<string, { helmet: string; vest: string; suit: string; skin: string; bg: string; extra: string }> = {
  supervisor: { helmet: "#f2f2ee", vest: "#ff7a1a", suit: "#2b5fa8", skin: "#c98d5e", bg: "#1e6fd9", extra: "" },
  safety_officer: {
    helmet: "#2fbf71", vest: "#ffc23d", suit: "#2f8f5b", skin: "#b97c4f", bg: "#1d8a4f",
    extra: '<rect x="33" y="47" width="14" height="10" rx="3" fill="none" stroke="#0b1220" stroke-width="2.5"/><rect x="53" y="47" width="14" height="10" rx="3" fill="none" stroke="#0b1220" stroke-width="2.5"/><path d="M47 51h6" stroke="#0b1220" stroke-width="2.5"/>',
  },
  senior_tech: {
    helmet: "#ffc23d", vest: "#ffc23d", suit: "#d9822b", skin: "#a8693f", bg: "#b8641c",
    extra: '<path d="M38 63 q12 -6 24 0 q-12 4 -24 0z" fill="#e9eef5" stroke="#0b1220" stroke-width="2"/>',
  },
  operator: {
    helmet: "#f2f2ee", vest: "#3fa9f5", suit: "#4a5568", skin: "#d39a6a", bg: "#3b4b63",
    extra: '<path d="M27 52 q-4 -22 23 -24 q27 2 23 24" fill="none" stroke="#111" stroke-width="3"/><rect x="22" y="48" width="8" height="14" rx="3" fill="#111"/><path d="M30 60 q6 10 16 10" stroke="#111" stroke-width="2.5" fill="none"/>',
  },
  coordinator: {
    helmet: "#e8423f", vest: "#ff5a5f", suit: "#8b1e2d", skin: "#8f5a36", bg: "#a8262b",
    extra: '<path d="M36 70 q14 8 28 0" stroke="#2a1608" stroke-width="5" fill="none"/>',
  },
  contractor: { helmet: "#2f7ddc", vest: "#ff7a1a", suit: "#6b4f2a", skin: "#c48a58", bg: "#5a4630", extra: "" },
  self: { helmet: "#ffc23d", vest: "#2fbf71", suit: "#2b5fa8", skin: "#c98d5e", bg: "#6b7a99", extra: "" },
};

export function portrait(character: string, mood: Mood): SVGSVGElement {
  const L = LOOKS[character] ?? LOOKS.supervisor;
  const helmet = L.helmet;
  const vest = L.vest;
  const tpl = document.createElement("template");
  tpl.innerHTML = `<svg viewBox="0 0 100 100" class="portrait" aria-hidden="true">
    <defs><pattern id="dots-${character}-${mood}" width="6" height="6" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="1.2" fill="rgba(255,255,255,.12)"/></pattern></defs>
    <rect width="100" height="100" fill="${L.bg}"/><rect width="100" height="100" fill="url(#dots-${character}-${mood})"/>
    <path d="M14 100 q4 -26 36 -26 q32 0 36 26z" fill="${L.suit}" stroke="#0b1220" stroke-width="3"/>
    <path d="M30 100 l6 -24 h28 l6 24z" fill="${vest}" stroke="#0b1220" stroke-width="3"/>
    <path d="M33 92 h34" stroke="#e9eef5" stroke-width="4"/>
    <ellipse cx="50" cy="54" rx="21" ry="24" fill="${L.skin}" stroke="#0b1220" stroke-width="3"/>
    <circle cx="40" cy="52" r="3.4" fill="#111"/><circle cx="60" cy="52" r="3.4" fill="#111"/>
    ${BROWS[mood]}${MOUTHS[mood]}
    <path d="M50 56 l-3 6 h5" stroke="#8a5a36" stroke-width="2" fill="none"/>
    ${L.extra}
    <path d="M24 40 q2 -26 26 -26 q24 0 26 26z" fill="${helmet}" stroke="#0b1220" stroke-width="3"/>
    <rect x="20" y="37" width="60" height="6" rx="3" fill="${helmet}" stroke="#0b1220" stroke-width="3"/>
    <path d="M50 15 v22" stroke="#0b1220" stroke-width="2.5"/>
    ${character === "self" ? '<circle cx="82" cy="18" r="11" fill="#fff" stroke="#0b1220" stroke-width="2.5"/><text x="82" y="23" font-size="14" font-weight="900" text-anchor="middle" fill="#0b1220">?</text>' : ""}
  </svg>`;
  return tpl.content.firstElementChild as SVGSVGElement;
}
