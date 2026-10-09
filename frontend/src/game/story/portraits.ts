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

export function portrait(character: string, mood: Mood): SVGSVGElement {
  const helmet = character === "supervisor" ? "#f2f2ee" : "#ffc23d";
  const vest = character === "supervisor" ? "#ff7a1a" : "#2fbf71";
  const tpl = document.createElement("template");
  tpl.innerHTML = `<svg viewBox="0 0 100 100" class="portrait" aria-hidden="true">
    <defs><pattern id="dots-${mood}" width="6" height="6" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="1.2" fill="rgba(255,255,255,.12)"/></pattern></defs>
    <rect width="100" height="100" fill="#1e6fd9"/><rect width="100" height="100" fill="url(#dots-${mood})"/>
    <path d="M14 100 q4 -26 36 -26 q32 0 36 26z" fill="#2b5fa8" stroke="#0b1220" stroke-width="3"/>
    <path d="M30 100 l6 -24 h28 l6 24z" fill="${vest}" stroke="#0b1220" stroke-width="3"/>
    <path d="M33 92 h34" stroke="#e9eef5" stroke-width="4"/>
    <ellipse cx="50" cy="54" rx="21" ry="24" fill="#c98d5e" stroke="#0b1220" stroke-width="3"/>
    <circle cx="40" cy="52" r="3.4" fill="#111"/><circle cx="60" cy="52" r="3.4" fill="#111"/>
    ${BROWS[mood]}${MOUTHS[mood]}
    <path d="M50 56 l-3 6 h5" stroke="#8a5a36" stroke-width="2" fill="none"/>
    <path d="M24 40 q2 -26 26 -26 q24 0 26 26z" fill="${helmet}" stroke="#0b1220" stroke-width="3"/>
    <rect x="20" y="37" width="60" height="6" rx="3" fill="${helmet}" stroke="#0b1220" stroke-width="3"/>
    <path d="M50 15 v22" stroke="#0b1220" stroke-width="2.5"/>
  </svg>`;
  return tpl.content.firstElementChild as SVGSVGElement;
}
