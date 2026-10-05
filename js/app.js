import { APP } from "./config.js";
import { store, DEMO } from "./store.js";
import { buildModel, fmtDate, setResourceTypes, parseISO } from "./model.js";
import { $, $$, esc, icon, toast, ripple, debounce } from "./ui.js";
import { startFx, bindCursorGlow } from "./fx.js";
import { renderCommand } from "./views/command.js";
import { renderSchedule } from "./views/schedule.js";
import { renderBoard } from "./views/board.js";
import { renderCalendar } from "./views/calendar.js";
import { renderWorkplans, initWp, refreshWpPop } from "./views/workplans.js";
import { initG, showG } from "./assistant.js";
import { renderImport } from "./views/import.js";
import { renderActivity } from "./views/activity.js";
import { openDrawer, refreshDrawer, drawerTaskId } from "./drawer.js";

const ROUTES = {
  command: { label: "Command", icon: "command", render: renderCommand },
  schedule: { label: "Schedule", icon: "schedule", render: renderSchedule },
  calendar: { label: "Calendar", icon: "calendar", render: renderCalendar },
  workplans: { label: "Workplans", icon: "doc", render: renderWorkplans },
  board: { label: "Board", icon: "board", render: renderBoard },
  import: { label: "Import", icon: "upload", render: renderImport },
  activity: { label: "Activity", icon: "activity", render: renderActivity }
};

export const state = {
  raw: { tasks: [], tracking: {}, meta: {} }, model: { tasks: [], byId: new Map() }, history: [],
  route: "command", loaded: false,
  filters: { tags: new Set(), q: "", status: "", show: "" },
  collapsed: new Set(), zoom: "month", boardScope: "window", firstRender: {},
  wp: { q: "", scope: "main", bucket: "", all: false },
  cal: { view: "year", y: null, m: null, day: null, list: "day", scope: "tasks" }
};

let fx = null, unsub = null, unsubHist = null;
const app = $("#app");

// ---------- theme ----------
const THEME_KEY = "p269-theme";
function themePref() { try { return localStorage.getItem(THEME_KEY) || "system"; } catch { return "system"; } }
function resolvedTheme(p = themePref()) { return p === "system" ? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark") : p; }
function applyTheme() { document.documentElement.dataset.theme = resolvedTheme(); fx?.recolor(); }
export function setTheme(pref, origin) {
  try { localStorage.setItem(THEME_KEY, pref); } catch {}
  const next = resolvedTheme(pref);
  if (next === document.documentElement.dataset.theme) { applyTheme(); return; }
  if (!document.startViewTransition || matchMedia("(prefers-reduced-motion: reduce)").matches) { applyTheme(); return; }
  const x = origin?.x ?? innerWidth - 120, y = origin?.y ?? 34;
  const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  document.documentElement.classList.add("theme-vt");
  const vt = document.startViewTransition(() => applyTheme());
  vt.ready.then(() => document.documentElement.animate({ clipPath: [`circle(0 at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
    { duration: 700, easing: "cubic-bezier(.22,1,.36,1)", pseudoElement: "::view-transition-new(root)" }));
  vt.finished.finally(() => document.documentElement.classList.remove("theme-vt"));
}
matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => { if (themePref() === "system") applyTheme(); });
applyTheme();

// ---------- boot ----------
async function boot() {
  fx = startFx($("#fx")); bindCursorGlow();
  document.addEventListener("pointerdown", ripple);
  try { await store.init(); }
  catch (e) { console.error(e); hideBoot(); app.innerHTML = `<div class="login"><div class="login-card"><h1>Can't connect</h1><p class="lead">The site couldn't load its database library. Check your internet connection and reload.</p><button class="btn primary block" onclick="location.reload()">Reload</button></div></div>`; return; }
  store.onAuth(user => {
    hideBoot();
    if (user) startSession(); else { stopSession(); renderLogin(); }
  });
}
function hideBoot() { $(".boot")?.classList.add("out"); }

// ---------- login ----------
function renderLogin() {
  document.title = APP.title;
  app.innerHTML = `
  <div class="login">
    <form class="login-card" id="loginForm" autocomplete="on" data-tilt="6">
      <div class="login-dial">${dialMini()}</div>
      <h1>${esc(APP.title)}</h1>
      <p class="lead">${esc(APP.subtitle)}</p>
      <label class="field"><span>Email</span><input class="input" type="email" name="email" autocomplete="username" required></label>
      <label class="field"><span>Password</span><input class="input" type="password" name="password" autocomplete="current-password" required></label>
      <div class="err" id="loginErr" role="alert"></div>
      <button class="btn primary block" type="submit">Sign in</button>
      <div class="foot"><button type="button" class="link-btn" id="forgot">Forgot password</button><span>Private workspace</span></div>
    </form>
  </div>`;
  const f = $("#loginForm"), err = $("#loginErr");
  import("./ui.js").then(m => m.bindTilt(app));
  f.email.focus();
  f.addEventListener("submit", async e => {
    e.preventDefault(); err.textContent = "";
    const btn = f.querySelector("button[type=submit]"); btn.disabled = true; btn.textContent = "Signing in";
    try { await store.signIn(f.email.value.trim(), f.password.value); }
    catch (ex) { err.textContent = authMessage(ex); btn.disabled = false; btn.textContent = "Sign in"; f.animate([{ transform: "translateX(0)" }, { transform: "translateX(-10px)" }, { transform: "translateX(10px)" }, { transform: "translateX(0)" }], { duration: 350 }); }
  });
  $("#forgot").addEventListener("click", async () => {
    const email = f.email.value.trim(); if (!email) { err.textContent = "Type your email first, then press Forgot password."; return; }
    try { await store.resetPassword(email); err.textContent = ""; toast("Password reset email sent"); } catch (ex) { err.textContent = authMessage(ex); }
  });
}
function authMessage(e) {
  const c = e?.code || "";
  if (/invalid-credential|wrong-password|user-not-found|invalid-email/.test(c)) return "That email and password don't match. Check them and try again.";
  if (/too-many-requests/.test(c)) return "Too many attempts. Wait a few minutes, or reset your password.";
  if (/network/.test(c)) return "No connection to the server. Check your internet.";
  if (/unauthorized-domain/.test(c)) return "This web address isn't authorised in Firebase. Add it under Authentication, Settings, Authorized domains.";
  return e?.message || "Sign in failed.";
}
const logoImg = () => APP.logo ? `<img class="logo-img" src="${esc(APP.logo)}" alt="" onerror="this.remove()">` : "";
function dialMini() {
  return `<svg viewBox="0 0 120 120"><g class="tick-ring" style="transform-origin:60px 60px;animation:spin 20s linear infinite">${Array.from({ length: 60 }, (_, i) => `<line x1="60" y1="4" x2="60" y2="${i % 5 ? 9 : 13}" stroke="var(--accent)" stroke-width="${i % 5 ? 1 : 2}" opacity="${i % 5 ? .4 : .9}" transform="rotate(${i * 6} 60 60)"/>`).join("")}</g>
  <circle cx="60" cy="60" r="40" fill="var(--panel-solid)" stroke="var(--line-hi)"/></svg>${logoImg()}`;
}

// ---------- session ----------
function startSession() {
  renderShell();
  unsub?.(); unsubHist?.();
  unsub = store.subscribe(data => {
    if (data.error) { toast(data.error.code === "permission-denied" ? "Database refused access. Check the Firestore rules are published." : "Database error: " + data.error.message, "err"); return; }
    state.raw = data; state.loaded = true;
    setResourceTypes(data.meta?.resourceTypes);
    state.model = buildModel(data.tasks, data.tracking);
    updateChrome();
    if (!(isTyping() && $(".view-inner")?.contains(document.activeElement))) renderView(false);
    refreshDrawer(); refreshWpPop();
  });
  unsubHist = store.subscribeHistory(h => { state.history = h; if (state.route === "activity") renderView(false); refreshDrawer(); });
}
function stopSession() { unsub?.(); unsubHist?.(); unsub = unsubHist = null; showG(false); }
const isTyping = () => /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || "");

function renderShell() {
  const u = store.user(); const initial = (u?.email || "?")[0].toUpperCase();
  app.innerHTML = `
  <div class="shell">
    <nav class="rail" aria-label="Main">
      <div class="brand" title="${esc(APP.title)}">${logoImg()}</div>
      <span class="glide" aria-hidden="true"></span>
      ${Object.entries(ROUTES).map(([k, r]) => `<button class="nav-btn" data-route="${k}">${icon(r.icon)}<span>${r.label}</span>${k === "command" ? '<span class="badge hidden" id="navBadge"></span>' : ""}</button>`).join("")}
      <div class="spacer"></div>
    </nav>
    <header class="topbar">
      <div class="title-block"><h1>${esc(APP.title)}</h1><small>${esc(APP.subtitle)}${DEMO ? " · demo data" : ""}</small></div>
      <span class="pill" id="statusPill">${icon("calendar")}<span id="statusTxt">Status date</span></span>
      <span class="pill" id="syncPill"><span class="dot pulse"></span><span>Live</span></span>
      <button class="search-trigger" id="openPalette" aria-label="Search">${icon("search")}<span>Search tasks, jump anywhere</span><kbd>Ctrl K</kbd></button>
      <button class="theme-toggle" id="themeToggle" aria-label="Switch day or night mode"><span class="knob">${icon("moon", "moon")}${icon("sun", "sun")}</span></button>
      <div class="user-menu"><button class="avatar" id="userBtn" aria-label="Account">${esc(initial)}</button></div>
    </header>
    <main class="view" id="view" tabindex="-1"></main>
  </div>`;
  $$(".nav-btn").forEach(b => b.addEventListener("click", () => go(b.dataset.route)));
  $$(".brand .logo-img").forEach(i => { i.addEventListener("load", moveGlide); i.addEventListener("error", () => setTimeout(moveGlide, 0)); });
  $("#themeToggle").addEventListener("click", e => setTheme(resolvedTheme() === "dark" ? "light" : "dark", { x: e.clientX, y: e.clientY }));
  $("#userBtn").addEventListener("click", toggleUserMenu);
  $("#openPalette").addEventListener("click", openPalette);
  routeFromHash(); showG(true);
}

function updateChrome() {
  const m = state.raw.meta || {};
  const sd = m.statusDate ? `Status ${fmtDate(m.statusDate)}` : "No schedule yet";
  const el = $("#statusTxt"); if (el) el.textContent = sd;
  const n = state.model.tasks.reduce((a, t) => a + (t.flags.some(f => f.sev >= 3) ? 1 : 0), 0);
  const b = $("#navBadge"); if (b) { b.textContent = n; b.classList.toggle("hidden", !n); }
}

function toggleUserMenu(e) {
  e.stopPropagation();
  const host = $(".user-menu"); const open = $(".menu", host); if (open) { open.remove(); return; }
  const pref = themePref(), u = store.user();
  const m = document.createElement("div"); m.className = "menu";
  m.innerHTML = `<div class="who">Signed in as<br><b>${esc(u?.email || "")}</b></div>
    <div class="seg">${["system", "light", "dark"].map(p => `<button data-theme="${p}" class="${pref === p ? "on" : ""}">${{ system: "Auto", light: "Day", dark: "Night" }[p]}</button>`).join("")}</div>
    <button data-act="palette">${icon("search")} Search <span class="faint" style="margin-left:auto;font-size:12px">Ctrl K</span></button>
    <button data-act="out">${icon("logout")} Sign out</button>`;
  host.appendChild(m);
  m.addEventListener("click", ev => {
    const t = ev.target.closest("button"); if (!t) return;
    if (t.dataset.theme) { setTheme(t.dataset.theme, { x: ev.clientX, y: ev.clientY }); m.remove(); }
    if (t.dataset.act === "out") { m.remove(); t.disabled = true; Promise.resolve(store.signOut()).catch(ex => toast("Couldn't sign out: " + (ex?.message || ex), "err")); }
    if (t.dataset.act === "palette") { m.remove(); openPalette(); }
  });
  setTimeout(() => document.addEventListener("click", function off(ev) { if (!m.contains(ev.target)) { m.remove(); document.removeEventListener("click", off); } }), 0);
}

// ---------- routing ----------
export function go(route, opts = {}) {
  if (!ROUTES[route]) route = "command";
  if (location.hash !== "#/" + route) history.pushState(null, "", "#/" + route);
  setRoute(route, opts);
}
function routeFromHash() { setRoute((location.hash.replace("#/", "") || "command").split("?")[0]); }
addEventListener("popstate", () => { if ($(".shell")) routeFromHash(); });

function setRoute(route, opts = {}) {
  if (!ROUTES[route]) route = "command";
  const changed = state.route !== route; state.route = route;
  if (opts.filters) Object.assign(state.filters, opts.filters);
  $$(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.route === route));
  moveGlide();
  document.title = `${ROUTES[route].label} · ${APP.title}`;
  const run = () => { renderView(true); $("#view").scrollTop = 0; };
  if (changed && document.startViewTransition && !matchMedia("(prefers-reduced-motion: reduce)").matches) document.startViewTransition(run); else run();
}

function moveGlide() {
  const g = $(".rail .glide"), a = $(".nav-btn.active"); if (!g || !a) return;
  g.style.cssText = `left:${a.offsetLeft}px;top:${a.offsetTop}px;width:${a.offsetWidth}px;height:${a.offsetHeight}px;opacity:1`;
}
addEventListener("resize", debounce(moveGlide, 120));

export function renderView(fresh) {
  const v = $("#view"); if (!v) return;
  const keep = fresh ? null : saveScroll(v);
  ROUTES[state.route].render(v, ctx, { fresh });
  if (keep) restoreScroll(v, keep);
}
function saveScroll(v) { return { top: v.scrollTop, inner: $$("[data-keep-scroll]", v).map(el => [el.dataset.keepScroll, el.scrollTop, el.scrollLeft]) }; }
function restoreScroll(v, s) { v.scrollTop = s.top; s.inner.forEach(([k, t, l]) => { const el = $(`[data-keep-scroll="${k}"]`, v); if (el) { el.scrollTop = t; el.scrollLeft = l; } }); }

// shared context passed to views
export const ctx = {
  state, store, go, openTask: id => openDrawer(id, ctx), rerender: () => renderView(false),
  goDay(iso) { const d = parseISO(iso); Object.assign(state.cal, { view: "month", y: d.getFullYear(), m: d.getMonth(), day: iso, list: "day" }); go("calendar"); },
  setFilters(patch) { Object.assign(state.filters, patch); renderView(false); }
};

// ---------- command palette ----------
function openPalette() {
  if ($(".palette")) return;
  const el = document.createElement("div"); el.className = "palette";
  el.innerHTML = `<div class="box" role="dialog" aria-label="Search"><input placeholder="Search tasks by name or ID, or type a page name" aria-label="Search"><ul></ul></div>`;
  document.body.appendChild(el);
  const input = $("input", el), list = $("ul", el); let items = [], sel = 0;
  const pages = Object.entries(ROUTES).map(([k, r]) => ({ kind: "page", label: `Go to ${r.label}`, run: () => go(k), ic: r.icon }));
  const extra = [{ kind: "act", label: "Switch day or night mode", ic: "sun", run: () => setTheme(resolvedTheme() === "dark" ? "light" : "dark") }];
  const draw = () => {
    const q = input.value.trim().toLowerCase();
    const tasks = state.model.tasks.filter(t => !q || t.name.toLowerCase().includes(q) || String(t.id) === q || t.path.join(" ").toLowerCase().includes(q))
      .slice(0, 40).map(t => ({ kind: "task", id: t.id, label: t.name, sub: t.path.slice(-1)[0] || "", run: () => ctx.openTask(t.id) }));
    items = [...[...pages, ...extra].filter(p => !q || p.label.toLowerCase().includes(q)), ...tasks];
    sel = Math.min(sel, items.length - 1); if (sel < 0) sel = 0;
    list.innerHTML = items.map((it, i) => `<li class="${i === sel ? "on" : ""}" data-i="${i}">${it.kind === "task" ? `<span class="num">${it.id}</span>` : icon(it.ic)}<span>${esc(it.label)}</span><span class="k">${esc(it.sub || (it.kind === "page" ? "Page" : ""))}</span></li>`).join("") || `<li class="faint">No matches</li>`;
  };
  const close = () => el.remove();
  const pick = i => { const it = items[i]; if (!it) return; close(); it.run(); };
  input.addEventListener("input", () => { sel = 0; draw(); });
  input.addEventListener("keydown", e => {
    if (e.key === "ArrowDown") { sel = Math.min(items.length - 1, sel + 1); draw(); $("li.on", list)?.scrollIntoView({ block: "nearest" }); e.preventDefault(); }
    if (e.key === "ArrowUp") { sel = Math.max(0, sel - 1); draw(); $("li.on", list)?.scrollIntoView({ block: "nearest" }); e.preventDefault(); }
    if (e.key === "Enter") pick(sel);
    if (e.key === "Escape") close();
  });
  list.addEventListener("click", e => { const li = e.target.closest("li[data-i]"); if (li) pick(+li.dataset.i); });
  el.addEventListener("pointerdown", e => { if (e.target === el) close(); });
  draw(); input.focus();
}
addEventListener("keydown", e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); if ($(".shell")) openPalette(); }
  if (e.key === "/" && !isTyping() && $(".shell")) { e.preventDefault(); openPalette(); }
});

initWp(ctx); initG(ctx);
boot();
