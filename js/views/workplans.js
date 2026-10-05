// Workplans: every task with its workplan answer, when it is needed by, and quick editing.
// The same record is used by the task panel, Schedule, Calendar and Board, so an edit anywhere shows everywhere.
import { APP } from "../config.js";
import { fmtShort, fmtDate, relDays, isPackage } from "../model.js";
import { esc, icon, toast, $, $$, bindSpot, segThumbs, countUp } from "../ui.js";
import { STATUS_VAR, tagChips, bindTagChips, tagCounts, wpClass } from "./shared.js";

export const WP_STATUS = [["notstarted", "Not started"], ["drafting", "Drafting"], ["internal", "Internal review"], ["submitted", "Submitted to client"], ["clientreview", "Under client review"], ["approved", "Approved"], ["rejected", "Rejected"]];
const HAS = [["yes", "Yes"], ["no", "No"], ["na", "N/A"]];
const HAS_LABEL = { yes: "Yes", no: "No", na: "Not applicable", "": "blank" };
const FIELD = { has: "Workplan", ref: "Workplan number", title: "Workplan name", rev: "Workplan revision", status: "Workplan status", submitted: "Workplan submitted" };
const STEP = { answer: "Answer needed", start: "Start workplan", submit: "Submit", approve: "Get approval" };
const BUCKETS = [
  ["overdue", "Overdue", "Submit or approval date has passed", "var(--behind)", "alert"],
  ["soon", "Due in 7 days", "Act this week", "var(--risk)", "clock"],
  ["next", "Due in 8 to 21 days", "Coming up", "var(--accent)", "calendar"],
  ["later", "Later", "More than 3 weeks away", "var(--ink3)", "calendar"],
  ["started", "Already started", "Running without an approved workplan", "var(--hazard)", "pulse"],
  ["approved", "Approved", "Ready to go", "var(--on)", "check"],
  ["na", "Not applicable", "No workplan needed", "var(--ink3)", "minus"],
  ["closed", "Work complete", "Task finished", "var(--done)", "check"]
];

export function needChip(t) {
  const w = t.wpi; if (!w || w.state === "none") return "";
  if (w.state === "approved") return `<span class="chip sev1">Approved</span>`;
  if (w.state === "na") return `<span class="chip">Not applicable</span>`;
  if (w.state === "closed") return `<span class="chip">Work complete</span>`;
  if (w.state === "started") return `<span class="chip ${w.step === "answer" ? "" : w.step === "approve" ? "sev2" : "sev3"}">Started ${fmtShort(t.start)}: ${{ answer: "answer needed", start: "no workplan", submit: "not submitted", approve: "awaiting approval" }[w.step]}</span>`;
  const txt = w.left < 0 ? `${STEP[w.step]}: ${-w.left} day${w.left === -1 ? "" : "s"} overdue` : `${STEP[w.step]} ${w.left === 0 ? "today" : relDays(w.left)}`;
  return `<span class="chip ${w.state === "overdue" ? "sev3" : w.state === "soon" ? "sev2" : ""}">${txt}</span>`;
}

// save one or more workplan fields for a task, with history
export async function saveWp(ctx, id, patch) {
  await new Promise(r => setTimeout(r, 0)); // let the focus settle on the next box before the page refreshes
  const t = ctx.state.model.byId.get(id); if (!t) return;
  const cur = t.tr.workplan, show = (k, v) => v === "" || v == null ? "blank" : k === "has" ? HAS_LABEL[v] : k === "status" ? (WP_STATUS.find(s => s[0] === v) || [, v])[1] : v;
  const changes = Object.keys(patch).filter(k => (cur[k] ?? "") !== (patch[k] ?? "")).map(k => ({ kind: "field", field: FIELD[k], from: show(k, cur[k]), to: show(k, patch[k]), taskName: t.name }));
  if (!changes.length) return;
  try { await ctx.store.saveTracking(id, { ...t.tr, workplan: { ...cur, ...patch } }, changes); }
  catch (e) { toast("Couldn't save: " + e.message, "err"); }
}

const hasBtns = (t) => `<span class="wp-has" role="radiogroup" aria-label="Do we have a workplan">${HAS.map(([v, l]) => `<button type="button" data-has="${v}" class="${t.tr.workplan.has === v ? "on " + v : ""}">${l}</button>`).join("")}</span>`;
const statusSel = (t) => `<select class="select" data-f="status" aria-label="Workplan status"><option value="">Status not set</option>${WP_STATUS.map(([v, l]) => `<option value="${v}" ${t.tr.workplan.status === v ? "selected" : ""}>${l}</option>`).join("")}</select>`;
const inp = (t, f, ph, type = "text") => `<input class="input" data-f="${f}" type="${type}" value="${esc(t.tr.workplan[f] || "")}" placeholder="${ph}" aria-label="${FIELD[f]}">`;

function bindEditors(root, ctx, idOf) {
  root.addEventListener("click", e => {
    const b = e.target.closest("[data-has]"); if (!b) return;
    const id = idOf(b), t = ctx.state.model.byId.get(id);
    saveWp(ctx, id, { has: t.tr.workplan.has === b.dataset.has ? "" : b.dataset.has });
  });
  root.addEventListener("change", e => { const f = e.target.closest("[data-f]"); if (!f) return; const id = idOf(f); if (f.tagName === "SELECT" && !f.closest(".wp-pop")) f.blur(); saveWp(ctx, id, { [f.dataset.f]: f.value.trim() }); });
  root.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.matches("input[data-f]")) e.target.blur(); });
}

// ---------- quick edit box, opened from any WP badge ----------
let pop = null;
export function closeWpPop() { pop?.el.remove(); pop = null; }
function popHTML(t) {
  const yes = t.tr.workplan.has === "yes", w = t.wpi;
  return `<header><div><b>${esc(t.name)}</b><span>${esc(t.path.slice(-1)[0] || "")} · starts ${fmtShort(t.start)}</span></div><button class="icon-btn" data-x aria-label="Close">${icon("close")}</button></header>
    <div class="wp-q"><span>Do we have a workplan?</span>${hasBtns(t)}</div>
    ${yes ? `<div class="wp-g">${inp(t, "ref", "Number, e.g. WP-0116")}${inp(t, "rev", "Rev")}</div>${inp(t, "title", "Workplan name")}
      ${statusSel(t)}<label class="wp-q"><span>Date submitted to client</span>${inp(t, "submitted", "", "date")}</label>` : ""}
    <footer>${w?.submitBy ? `<span>Submit by <b>${fmtShort(w.submitBy)}</b> · approved by <b>${fmtShort(w.approveBy)}</b></span>` : ""}${needChip(t)}<button class="btn sm ghost" data-full>Open full task</button></footer>`;
}
function place() {
  const r = pop.anchor.getBoundingClientRect(), el = pop.el, w = el.offsetWidth, h = el.offsetHeight;
  el.style.left = Math.max(10, Math.min(innerWidth - w - 10, r.left + r.width / 2 - w / 2)) + "px";
  el.style.top = (r.bottom + h + 14 > innerHeight ? Math.max(10, r.top - h - 8) : r.bottom + 8) + "px";
}
function openWpPop(anchor, id, ctx) {
  closeWpPop();
  const t = ctx.state.model.byId.get(id); if (!t) return;
  const el = document.createElement("div"); el.className = "wp-pop"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Workplan for " + t.name);
  el.innerHTML = popHTML(t); document.body.appendChild(el);
  pop = { el, anchor, id, ctx }; place();
  bindEditors(el, ctx, () => id);
  el.addEventListener("click", e => { if (e.target.closest("[data-x]")) closeWpPop(); else if (e.target.closest("[data-full]")) { closeWpPop(); ctx.openTask(id); } });
  el.addEventListener("keydown", e => { if (e.key === "Escape") closeWpPop(); });
}
// called after every data update so an open box shows the saved values
export function refreshWpPop() {
  if (!pop) return;
  const t = pop.ctx.state.model.byId.get(pop.id); if (!t) return closeWpPop();
  const a = document.activeElement, typing = pop.el.contains(a) && a.matches("input:not([type=date])");
  if (typing) return;
  const anchor = document.querySelector(`[data-wp="${pop.id}"]`); if (anchor) pop.anchor = anchor;
  const f = pop.el.contains(a) ? a.dataset.f : null;
  pop.el.innerHTML = popHTML(t); if (pop.anchor.isConnected) place();
  if (f) pop.el.querySelector(`[data-f="${f}"]`)?.focus();
}
export function initWp(ctx) {
  document.addEventListener("click", e => {
    const b = e.target.closest?.("[data-wp]");
    if (b) { e.preventDefault(); e.stopPropagation(); if (pop && pop.id === +b.dataset.wp) closeWpPop(); else openWpPop(b, +b.dataset.wp, ctx); return; }
    if (pop && !pop.el.contains(e.target)) closeWpPop();
  }, true);
  document.addEventListener("pointerdown", e => { if (e.target.closest?.("[data-wp]")) e.stopPropagation(); }, true);
  addEventListener("resize", closeWpPop);
  document.addEventListener("scroll", e => {
    if (!pop || pop.el.contains(e.target)) return;
    const a = document.querySelector(`[data-wp="${pop.id}"]`); if (a) { pop.anchor = a; place(); } else closeWpPop();
  }, true);
}

// ---------- the Workplans page ----------
export function renderWorkplans(view, ctx, { fresh }) {
  const st = ctx.state, V = st.wp;
  if (!st.model.tasks.length) { view.innerHTML = `<div class="view-inner"><div class="panel empty">No schedule loaded yet. Go to Import to load one.</div></div>`; return; }
  const tags = st.filters.tags, q = V.q.trim().toLowerCase();
  const base = st.model.tasks.filter(t => t.level >= 3 && t.wpi && t.wpi.state !== "none" && (V.scope === "all" || (V.scope === "packages" ? isPackage(t) : t.isLeaf)));
  const pool = base.filter(t => (!tags.size || t.tags.some(k => tags.has(k))) && (!q || t.name.toLowerCase().includes(q) || String(t.id) === q || t.path.join(" ").toLowerCase().includes(q) || [t.tr.workplan.ref, t.tr.workplan.title].join(" ").toLowerCase().includes(q)));
  const by = {}; BUCKETS.forEach(b => by[b[0]] = []); pool.forEach(t => by[t.wpi.state].push(t));
  const unanswered = pool.filter(t => !t.tr.workplan.has && !["closed"].includes(t.wpi.state)).length;
  for (const k in by) by[k].sort((a, b) => (k === "started" ? b.s - a.s : (a.wpi.due ?? a.s) - (b.wpi.due ?? b.s)) || a.id - b.id);
  const show = BUCKETS.filter(b => V.bucket ? b[0] === V.bucket : true).filter(b => by[b[0]].length && (V.bucket || V.q || !["na", "closed"].includes(b[0]) || V.all));
  const lateCls = (w, approve) => w.left < 0 && (w.step === "approve") === approve ? "late" : "";
  const hidden = !V.bucket && !V.all ? by.na.length + by.closed.length : 0;

  const row = t => {
    const wp = t.tr.workplan, w = t.wpi, yes = wp.has === "yes";
    return `<div class="wrow ${w.state}" data-id="${t.id}" style="--c:${STATUS_VAR[t.eff || ""]}">
      <button class="w-task" data-open="${t.id}" title="Open full task"><span class="sdot"></span><span><b>${esc(t.name)}</b><small>${t.isLeaf ? "" : "Package · "}${esc(t.path.slice(-2).join(" › "))}</small></span></button>
      <span class="w-date num"><small>Starts</small>${fmtShort(t.start)}</span>
      ${hasBtns(t)}
      ${yes ? `<span class="w-fields">${inp(t, "ref", "Number")}${inp(t, "title", "Name")}${inp(t, "rev", "Rev")}${statusSel(t)}</span>` : `<span class="w-fields off">${wp.has === "no" ? "No workplan yet. Choose Yes once one is started." : wp.has === "na" ? "No workplan needed for this task." : "Not answered yet."}</span>`}
      <span class="w-date num ${lateCls(w, false)}"><small>Submit by</small>${fmtShort(w.submitBy)}</span>
      <span class="w-date num ${lateCls(w, true)}"><small>Approved by</small>${fmtShort(w.approveBy)}</span>
      <span class="w-need">${needChip(t)}</span>
    </div>`;
  };
  const card = ([k, label, foot, color, ic]) => `<button class="panel scard spot ${V.bucket === k ? "on" : ""}" data-bucket="${k}" style="--kc:${color}"><span class="k-label">${icon(ic)}${label}</span><span class="k-val num" ${fresh ? `data-count="${by[k].length}">0` : `>${by[k].length}`}</span><span class="k-foot">${foot}</span></button>`;

  view.innerHTML = `<div class="view-inner wpv ${fresh ? "enter" : ""}">
    <div class="scards five">${BUCKETS.slice(0, 3).map(card).join("")}${card(BUCKETS[4])}${card(BUCKETS[5])}</div>
    <div class="toolbar">
      <div class="searchbox">${icon("search")}<input class="input" id="wq" placeholder="Search task, WP number or name" value="${esc(V.q)}"></div>
      <div class="seg-ctl" id="wscope">${[["all", "All"], ["packages", "Packages"], ["tasks", "Tasks"]].map(([k, l]) => `<button data-s="${k}" class="${V.scope === k ? "on" : ""}">${l}</button>`).join("")}</div>
      <span class="grow"></span>
      <span class="faint" style="font-size:13px">Submit ${APP.wpSubmitDays} days before start, approved ${APP.wpApproveDays} days before. ${unanswered} not answered.</span>
      ${V.bucket ? `<button class="btn sm" id="wclear">Show all groups</button>` : ""}
    </div>
    ${tagChips(st, tagCounts(st.model.tasks.filter(t => t.level >= 3)))}
    <section class="panel wlist"><div class="whead"><span>Task</span><span>Start</span><span>Workplan?</span><span>Number, name, revision and status</span><span>Submit by</span><span>Approved by</span><span>What's needed</span></div>
      ${show.map(([k, label, , color]) => `<div class="wgroup" style="--gc:${color}"><h4><i></i>${label}<span class="num">${by[k].length}</span></h4>${by[k].map(row).join("")}</div>`).join("") || `<div class="empty">Nothing matches.</div>`}
      ${hidden ? `<button class="btn sm ghost wmore" id="wall">Show ${hidden} not applicable or complete</button>` : ""}
    </section>
  </div>`;

  bindTagChips(view, ctx); bindSpot(view); segThumbs(view); if (fresh) countUp(view);
  const list = $(".wlist", view);
  bindEditors(list, ctx, el => +el.closest(".wrow").dataset.id);
  list.addEventListener("click", e => { const o = e.target.closest("[data-open]"); if (o) ctx.openTask(+o.dataset.open); });
  $$("[data-bucket]", view).forEach(b => b.addEventListener("click", () => { V.bucket = V.bucket === b.dataset.bucket ? "" : b.dataset.bucket; ctx.rerender(); }));
  $$("#wscope button", view).forEach(b => b.addEventListener("click", () => { V.scope = b.dataset.s; ctx.rerender(); }));
  $("#wclear", view)?.addEventListener("click", () => { V.bucket = ""; ctx.rerender(); });
  $("#wall", view)?.addEventListener("click", () => { V.all = true; ctx.rerender(); });
  const s = $("#wq", view);
  s.addEventListener("input", () => { V.q = s.value; clearTimeout(s._t); s._t = setTimeout(() => { ctx.rerender(); const n = $("#wq"); n?.focus(); n?.setSelectionRange(n.value.length, n.value.length); }, 300); });
}
