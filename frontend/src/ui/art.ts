// Original, code-drawn SVG illustrations (static markup, no user data).

function svg(markup: string, viewBox = "0 0 320 150", label = ""): SVGSVGElement {
  const tpl = document.createElement("template");
  tpl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${label}">${markup}</svg>`;
  const el = tpl.content.firstElementChild as SVGSVGElement;
  el.classList.add("card-art");
  return el;
}

const SKY = `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0f2a52"/><stop offset="1" stop-color="#081426"/></linearGradient></defs><rect width="320" height="150" fill="url(#sky)"/>`;

export function industryArt(id: string, label: string): SVGSVGElement {
  switch (id) {
    case "oil_gas":
      return svg(
        `${SKY}
        <circle cx="270" cy="30" r="14" fill="#ff9a4d" opacity=".25"/>
        <rect x="0" y="120" width="320" height="30" fill="#0a1a30"/>
        <g fill="#1d3b66" stroke="#3fa9f5" stroke-width="1.2">
          <rect x="30" y="40" width="16" height="80"/><rect x="54" y="25" width="12" height="95"/>
          <ellipse cx="140" cy="92" rx="38" ry="8"/><rect x="102" y="92" width="76" height="28"/><ellipse cx="140" cy="120" rx="38" ry="8"/>
          <ellipse cx="225" cy="98" rx="28" ry="6"/><rect x="197" y="98" width="56" height="22"/>
        </g>
        <g stroke="#ff7a1a" stroke-width="3" fill="none"><path d="M46 70 H102"/><path d="M66 55 H190 V98"/><path d="M178 110 H197"/></g>
        <rect x="270" y="45" width="6" height="75" fill="#2a4a78"/>
        <path d="M273 45 q-8 -14 0 -26 q8 12 0 26" fill="#ff7a1a"><animate attributeName="opacity" values="1;.6;1" dur="1.4s" repeatCount="indefinite"/></path>
        <g stroke="#ffc23d" stroke-width="2"><path d="M0 128 l12 0 M24 128 l12 0 M48 128 l12 0 M72 128 l12 0 M96 128 l12 0 M120 128 l12 0 M144 128 l12 0 M168 128 l12 0 M192 128 l12 0 M216 128 l12 0 M240 128 l12 0 M264 128 l12 0 M288 128 l12 0"/></g>`,
        undefined,
        label,
      );
    case "heavy_mfg":
      return svg(
        `${SKY}
        <rect x="0" y="122" width="320" height="28" fill="#0a1a30"/>
        <path d="M20 122 V70 l30 -20 v20 l30 -20 v20 l30 -20 v20 l30 -20 V122 Z" fill="#1d3b66" stroke="#3fa9f5" stroke-width="1.2"/>
        <rect x="40" y="88" width="20" height="14" fill="#ffc23d" opacity=".7"/><rect x="90" y="88" width="20" height="14" fill="#ffc23d" opacity=".7"/>
        <rect x="170" y="40" width="12" height="82" fill="#2a4a78"/>
        <g transform="translate(250 80)"><g><animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="12s" repeatCount="indefinite"/>
          <circle r="22" fill="none" stroke="#ff7a1a" stroke-width="8" stroke-dasharray="7 5"/><circle r="12" fill="#1d3b66" stroke="#ff7a1a" stroke-width="3"/></g></g>
        <g stroke="#7cc4ff" stroke-width="5" stroke-linecap="round" fill="none"><path d="M200 122 V100 L220 82 L238 92"/></g>
        <circle cx="200" cy="100" r="5" fill="#ff7a1a"/>`,
        undefined,
        label,
      );
    default:
      return svg(
        `${SKY}
        <rect x="0" y="124" width="320" height="26" fill="#2a1d0a"/>
        <g stroke="#ffc23d" stroke-width="3" fill="none">
          <path d="M70 124 V20"/><path d="M60 124 V20"/><path d="M60 30 L70 20 M60 50 L70 40 M60 70 L70 60 M60 90 L70 80 M60 110 L70 100"/>
          <path d="M40 22 H230"/><path d="M65 22 L120 5 L230 22"/>
        </g>
        <path d="M200 22 V60" stroke="#9fb3cf" stroke-width="1.5"><animate attributeName="d" values="M200 22 V60;M200 22 V70;M200 22 V60" dur="3s" repeatCount="indefinite"/></path>
        <rect x="190" y="60" width="20" height="10" fill="#ff7a1a"><animate attributeName="y" values="60;70;60" dur="3s" repeatCount="indefinite"/></rect>
        <g fill="none" stroke="#3fa9f5" stroke-width="1.5">
          <rect x="140" y="60" width="90" height="64"/><path d="M140 82 H230 M140 104 H230 M170 60 V124 M200 60 V124"/>
          <path d="M140 60 L170 82 M170 60 L200 82 M200 82 L230 104"/>
        </g>
        <g stroke="#ff7a1a" stroke-width="2"><path d="M245 124 V96 M275 124 V96 M245 96 H275 M245 110 H275"/></g>`,
        undefined,
        label,
      );
  }
}

export function logoMark(): SVGSVGElement {
  const tpl = document.createElement("template");
  tpl.innerHTML = `<svg class="logo-mark" viewBox="0 0 100 100" aria-hidden="true">
    <defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7cc4ff"/><stop offset="1" stop-color="#1e6fd9"/></linearGradient></defs>
    <g class="gear"><path fill="url(#lg)" d="M50 8l6 10 11-4 2 12 12 2-4 11 10 6-10 6 4 11-12 2-2 12-11-4-6 10-6-10-11 4-2-12-12-2 4-11-10-6 10-6-4-11 12-2 2-12 11 4z"/></g>
    <circle cx="50" cy="50" r="18" fill="#0a1628"/>
    <path d="M42 50 l6 6 12-14" stroke="#ff7a1a" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
  return tpl.content.firstElementChild as SVGSVGElement;
}

export function backdrop(): HTMLElement {
  const el = document.createElement("div");
  el.className = "backdrop";
  el.setAttribute("aria-hidden", "true");
  el.innerHTML = `<div class="scan"></div>
  <svg class="skyline" viewBox="0 0 1200 300" preserveAspectRatio="none">
    <path fill="#081426" d="M0 300 V210 h60 v-50 h20 v50 h40 v-90 h14 v90 h50 v-30 h80 v30 h30 v-120 h18 v120 h60 v-60 a40 12 0 0 1 120 0 v60 h40 v-140 h10 v140 h70 v-40 h90 v40 h40 v-80 h16 v80 h60 v-55 a50 14 0 0 1 140 0 v55 h70 v-100 h12 v100 h60 V300 Z"/>
    <g fill="#ff7a1a"><circle cx="207" cy="92" r="3"><animate attributeName="opacity" values="1;.2;1" dur="1.6s" repeatCount="indefinite"/></circle>
    <circle cx="561" cy="72" r="3"><animate attributeName="opacity" values=".2;1;.2" dur="2.1s" repeatCount="indefinite"/></circle>
    <circle cx="1046" cy="112" r="3"><animate attributeName="opacity" values="1;.3;1" dur="1.2s" repeatCount="indefinite"/></circle></g>
  </svg>`;
  return el;
}
