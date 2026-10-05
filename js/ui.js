// Small UI helpers: escaping, icons, toasts, motion effects.

export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

const P = {
  command: '<path d="M3 13h6V3H3zM15 21h6V11h-6zM3 21h6v-4H3zM15 7h6V3h-6z"/>',
  schedule: '<path d="M3 5h8M3 12h12M3 19h6"/><rect x="13" y="3" width="8" height="4" rx="1.5"/><rect x="17" y="10" width="4" height="4" rx="1.5"/><rect x="11" y="17" width="8" height="4" rx="1.5"/>',
  board: '<rect x="3" y="3" width="5" height="18" rx="1.5"/><rect x="10" y="3" width="5" height="12" rx="1.5"/><rect x="17" y="3" width="4" height="8" rx="1.5"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
  activity: '<path d="M3 12h4l3 8 4-16 3 8h4"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  caret: '<path d="m6 9 6 6 6-6"/>',
  doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  drawing: '<path d="M3 21h18M5 21V8l7-5 7 5v13"/><path d="M9 21v-6h6v6"/>',
  money: '<path d="M12 3v18M17 7.5C17 5.6 14.8 4.5 12 4.5S7 5.6 7 7.5 9 10.5 12 11s5 1.6 5 3.5-2.2 3-5 3-5-1.1-5-3"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17v.5"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  pulse: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/>',
  trend: '<path d="M3 17 9 11l4 4 8-8"/><path d="M15 7h6v6"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  excel: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="m8 8 8 8M16 8l-8 8"/>',
  print: '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/>',
  expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  collapse: '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>',
  logout: '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  tag: '<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"/><circle cx="8" cy="8" r="1.5"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0 5 5L22 14l-8 8-2.3-2.3a4 4 0 0 0-5-5L4 12l8-8z"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  db: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  left: '<path d="m15 6-6 6 6 6"/>',
  right: '<path d="m9 6 6 6-6 6"/>',
  minus: '<path d="M5 12h14"/>',
  people: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.4"/><path d="M16 14.2c2.9.2 5 2.5 5 5.8"/>',
  plant: '<path d="M3 17h12V9H9l-3 4H3z"/><path d="M15 12l5-6 1.5 1.2-3.5 6"/><circle cx="6" cy="18.5" r="2"/><circle cx="12.5" cy="18.5" r="2"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'
};
export const icon = (name, cls = "") => `<svg class="${cls}" width="1.15em" height="1.15em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ""}</svg>`;

// ---------- toasts ----------
export function toast(msg, kind = "") {
  let box = $(".toasts"); if (!box) { box = document.createElement("div"); box.className = "toasts"; box.setAttribute("role", "status"); document.body.appendChild(box); }
  const el = document.createElement("div"); el.className = `toast ${kind}`; el.innerHTML = `<span class="dot"></span><span>${esc(msg)}</span>`;
  box.appendChild(el);
  setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 400); }, kind === "err" ? 6000 : 3200);
}

// ---------- motion ----------
export function ripple(e) {
  const b = e.target.closest(".btn, .opt"); if (!b || reduceMotion()) return;
  const r = b.getBoundingClientRect(), s = Math.max(r.width, r.height);
  const i = document.createElement("span"); i.className = "ripple";
  i.style.cssText = `width:${s}px;height:${s}px;left:${e.clientX - r.left - s / 2}px;top:${e.clientY - r.top - s / 2}px`;
  if (getComputedStyle(b).position === "static") b.style.position = "relative";
  b.style.overflow = "hidden"; b.appendChild(i); setTimeout(() => i.remove(), 650);
}

export function bindTilt(root) {
  if (reduceMotion() || matchMedia("(pointer: coarse)").matches) return;
  $$("[data-tilt]", root).forEach(el => {
    const max = +el.dataset.tilt || 8;
    el.addEventListener("pointermove", e => {
      const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
      el.style.transform = `rotateX(${(-y * max).toFixed(2)}deg) rotateY(${(x * max).toFixed(2)}deg) translateZ(0)`;
    });
    el.addEventListener("pointerleave", () => { el.style.transform = ""; });
  });
}

export function bindSpot(root) {
  $$(".spot", root).forEach(el => el.addEventListener("pointermove", e => {
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - r.left}px`); el.style.setProperty("--my", `${e.clientY - r.top}px`);
  }));
}

export function countUp(root) {
  $$("[data-count]", root).forEach(el => {
    const to = +el.dataset.count, dec = +(el.dataset.dec || 0), suf = el.dataset.suf || "";
    if (reduceMotion()) { el.textContent = to.toFixed(dec) + suf; return; }
    const from = +(el.dataset.from || 0), t0 = performance.now(), dur = 1300;
    const step = t => { const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 4); el.textContent = (from + (to - from) * e).toFixed(dec) + suf; if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
}

export function segThumbs(root) {
  $$(".seg-ctl", root).forEach(s => {
    let th = $(".thumb", s); if (!th) { th = document.createElement("span"); th.className = "thumb"; s.prepend(th); }
    const on = $("button.on", s); if (!on) { th.style.width = 0; return; }
    th.style.left = on.offsetLeft + "px"; th.style.width = on.offsetWidth + "px";
  });
}

export function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

export function timeAgo(iso) {
  const s = (Date.now() - new Date(iso)) / 1000;
  if (s < 60) return "just now"; if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const d = new Date(iso); return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "2-digit" }) + " " + d.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" });
}

export function stamp(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short" }) + ", " + d.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" });
}

// little particle burst, used when something is marked complete
export function burst(x, y, color = "var(--done)") {
  if (reduceMotion()) return;
  const host = document.createElement("div"); host.className = "burst"; host.style.left = x + "px"; host.style.top = y + "px"; document.body.appendChild(host);
  for (let i = 0; i < 18; i++) {
    const p = document.createElement("i"), a = (i / 18) * 6.283 + Math.random() * .4, d = 40 + Math.random() * 70;
    p.style.background = i % 3 ? color : "var(--hazard)";
    host.appendChild(p);
    p.animate([{ transform: "translate(0,0) scale(1)", opacity: 1 }, { transform: `translate(${Math.cos(a) * d}px, ${Math.sin(a) * d + 30}px) scale(0)`, opacity: 0 }], { duration: 700 + Math.random() * 400, easing: "cubic-bezier(.16,1,.3,1)", fill: "forwards" });
  }
  setTimeout(() => host.remove(), 1300);
}

// fade and lift things in as they scroll into view
export function reveal(root) {
  const els = $$(".rv", root); if (!els.length) return;
  if (reduceMotion() || !("IntersectionObserver" in window)) { els.forEach(e => e.classList.add("in")); return; }
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { root: $("#view"), threshold: .08 });
  els.forEach((e, i) => { e.style.transitionDelay = Math.min(i % 12, 8) * 45 + "ms"; io.observe(e); });
}
