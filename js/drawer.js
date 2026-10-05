// Task tracking panel. Questions only appear when the previous answer needs them.
import { TAGS } from "./config.js";
import { STATUSES, statusMeta, tagMeta, fmtDate, relDays, mergeTracking, resTypes, resSum } from "./model.js";
import { esc, icon, toast, $, $$, debounce, stamp, timeAgo, burst } from "./ui.js";
import { STATUS_VAR, tagHTML, flagChips } from "./views/shared.js";

let cur = null; // { id, ctx, draft, saved, el, scrim }
export const drawerTaskId = () => cur?.id ?? null;

const YN = [["yes", "Yes"], ["no", "No"]];
const YNA = [["yes", "Yes"], ["no", "No"], ["na", "Not applicable"]];
const WP_STATUS = [["notstarted", "Not started"], ["drafting", "Drafting"], ["internal", "Internal review"], ["submitted", "Submitted to client"], ["clientreview", "Under client review"], ["approved", "Approved"], ["rejected", "Rejected"]];
const DRW_TYPES = [["lift", "Lift plan"], ["scaffold", "Scaffold design"], ["blocks", "Engineered blocks"], ["sequence", "Demolition sequence"], ["other", "Other"]];
const RESP = [["pending", "Pending"], ["approved", "Approved"], ["rejected", "Rejected"]];

const LABELS = {
  "status": "Status",
  "workplan.has": "Workplan", "workplan.ref": "Workplan number", "workplan.title": "Workplan name", "workplan.status": "Workplan status", "workplan.rev": "Workplan revision", "workplan.submitted": "Workplan submitted", "workplan.clientComments": "Client comments received", "workplan.commentsClosed": "Client comments closed out",
  "drawings.has": "Engineering drawings", "drawings.type": "Drawing type", "drawings.number": "Drawing number", "drawings.rev": "Drawing revision", "drawings.approved": "Drawings approved",
  "scope.type": "Scope", "scope.nod": "Notice of delay sent", "scope.nodDate": "Notice of delay date", "scope.vn": "Variation notice sent", "scope.vnRef": "Variation notice number", "scope.vnDate": "Variation notice date",
  "scope.costingDone": "Costing done", "scope.costingSubmitted": "Costing submitted", "scope.costingDate": "Costing submitted date", "scope.value": "Variation value", "scope.response": "Client response", "scope.approvedValue": "Approved value",
  "extras.permit": "Permit or hold point", "extras.po": "PO raised", "extras.poNumber": "PO number", "extras.hire": "Hire or crane booked", "extras.clearance": "Clearance certificate",
  "next.action": "Next action", "next.owner": "Action owner", "next.due": "Action due"
};
const VALUE_LABELS = Object.fromEntries([...YNA, ...WP_STATUS, ...DRW_TYPES, ...RESP, ["scope", "In scope"], ["variation", "Variation"], ...STATUSES.map(s => [s.key, s.label])]);
const showVal = v => v === "" || v == null ? "blank" : (VALUE_LABELS[v] || v);

const get = (o, p) => p.split(".").reduce((a, k) => a?.[k], o);
const set = (o, p, v) => { const ks = p.split("."); let a = o; ks.slice(0, -1).forEach(k => a = a[k] ??= {}); a[ks.at(-1)] = v; };

// ---------- field builders ----------
const opts = (path, list, extraCls = "") => `<div class="opts" role="radiogroup" data-path="${path}">${list.map(([v, l]) => `<button type="button" class="opt ${extraCls}" data-v="${v}" role="radio">${l}</button>`).join("")}</div>`;
const q = (label, inner) => `<div class="q"><label>${label}</label>${inner}</div>`;
const text = (path, ph = "", type = "text") => `<input class="input" type="${type}" data-path="${path}" placeholder="${esc(ph)}"${type === "number" ? ' inputmode="decimal" step="any"' : ""}>`;
const reveal = (cond, inner) => `<div class="reveal" data-show="${cond}"><div><div class="nest">${inner}</div></div></div>`;
const section = (key, ic, title, inner) => `<section class="sec" data-sec="${key}"><header>${icon(ic, "ic")}<h3>${title}</h3><span class="state" data-state="${key}"></span></header><div class="inner">${inner}</div></section>`;

function formHTML(t) {
  return `
  ${section("status", "pulse", "How is it going", `
    <div class="opts" role="radiogroup" data-path="status">${STATUSES.map(s => `<button type="button" class="opt st-${s.key}" data-v="${s.key}">${s.label}</button>`).join("")}</div>
    ${t.children.length ? `<div class="roll" id="rollNote"></div>` : ""}`)}

  ${section("workplan", "doc", "Workplan", `
    <p class="note" id="wpDates"></p>
    ${q("Do we have a workplan for this work?", opts("workplan.has", YNA))}
    ${reveal("workplan.has=yes", `
      <div class="g2">${q("Workplan number", text("workplan.ref", "e.g. WP-0116"))}${q("Revision", text("workplan.rev", "e.g. Rev B"))}</div>
      ${q("Workplan name", text("workplan.title", "e.g. Burner B-1202 removal"))}
      ${q("Where is it at?", opts("workplan.status", WP_STATUS))}
      ${reveal("workplan.status=submitted|clientreview|approved|rejected", `
        ${q("Date submitted to client", text("workplan.submitted", "", "date"))}
        ${q("Have client comments come back?", opts("workplan.clientComments", YN))}
        ${reveal("workplan.clientComments=yes", q("Are the comments closed out?", opts("workplan.commentsClosed", YN)))}`)}`)}
    ${reveal("workplan.has=no", `<p class="note">This task gets flagged on the Command page once it is inside the look ahead window.</p>`)}`)}

  ${section("drawings", "drawing", "Engineering drawings", `
    ${q("Do we have engineering drawings?", opts("drawings.has", YNA))}
    ${reveal("drawings.has=yes", `
      ${q("What type?", opts("drawings.type", DRW_TYPES))}
      <div class="g2">${q("Drawing number", text("drawings.number", "e.g. D-3804"))}${q("Revision", text("drawings.rev", "e.g. Rev 1"))}</div>
      ${q("Approved?", opts("drawings.approved", YN))}`)}`)}

  ${section("scope", "money", "Scope and variations", `
    ${q("Is this in scope or a variation?", opts("scope.type", [["scope", "In scope"], ["variation", "Variation"]]))}
    ${reveal("scope.type=variation", `
      ${q("Notice of delay sent?", opts("scope.nod", YNA))}
      ${reveal("scope.nod=yes", q("Date sent", text("scope.nodDate", "", "date")))}
      ${q("Variation notice sent?", opts("scope.vn", YN))}
      ${reveal("scope.vn=yes", `<div class="g2">${q("Variation notice number", text("scope.vnRef", "e.g. VN-012"))}${q("Date sent", text("scope.vnDate", "", "date"))}</div>`)}
      ${q("Has the costing been done?", opts("scope.costingDone", YN))}
      ${reveal("scope.costingDone=yes", `
        ${q("Costing submitted to client?", opts("scope.costingSubmitted", YN))}
        ${reveal("scope.costingSubmitted=yes", `<div class="g2">${q("Date submitted", text("scope.costingDate", "", "date"))}${q("Value submitted ($)", text("scope.value", "0", "number"))}</div>
          ${q("Client response", opts("scope.response", RESP))}
          ${reveal("scope.response=approved", q("Approved value ($)", text("scope.approvedValue", "0", "number")))}`)}`)}`)}`)}

  ${section("extras", "shield", "Site readiness", `
    <div class="g2">
      ${q("Permit or hold point needed and in place?", opts("extras.permit", YNA))}
      ${q("Clearance certificate received?", opts("extras.clearance", YNA))}
      ${q("Crane or hire gear booked?", opts("extras.hire", YNA))}
      <div class="q"><label>PO raised?</label>${opts("extras.po", YNA)}${reveal("extras.po=yes", text("extras.poNumber", "PO number"))}</div>
    </div>`)}

  ${section("resources", "people", "Resources", `<div id="resInner">${resInner()}</div>`)}

  ${section("next", "flag", "Next action", `
    ${q("What needs to happen next?", text("next.action", "e.g. Chase client for WP-0116 approval"))}
    <div class="g2">${q("Who owns it?", text("next.owner", "Name"))}${q("Due", text("next.due", "", "date"))}</div>`)}

  ${t.children.length ? section("apply", "copy", "Apply to sub tasks", `
    <div class="applybox">
      <div class="note">Copy this package's answers to all ${countDesc(t)} tasks underneath it. You can still change any one of them afterwards.</div>
      <div class="checks">${[["workplan", "Workplan"], ["drawings", "Drawings"], ["scope", "Scope and variations"], ["extras", "Site readiness"], ["resources", "Resources"], ["status", "Status"]].map(([k, l]) => `<label><input type="checkbox" data-apply="${k}" ${k !== "status" && k !== "resources" ? "checked" : ""}> ${l}</label>`).join("")}</div>
      <div><button class="btn sm primary" id="applyBtn">${icon("copy")} Apply to sub tasks</button></div>
    </div>`) : ""}

  ${section("comments", "chat", "Comments", `
    <div class="q"><textarea class="textarea" id="cmtText" placeholder="Is it going to plan? What changed? Who said what?"></textarea>
      <div style="display:flex;gap:10px;align-items:center"><button class="btn sm primary" id="cmtPost">Post comment</button><span class="note">Ctrl Enter to post</span></div></div>
    <div class="comments" id="cmtList"></div>`)}

  ${section("history", "clock", "Change history", `<div class="hist" id="histList"></div>`)}`;
}
function resInner() {
  const row = r => `<div class="resrow"><label for="res-${r.key}">${esc(r.label)}</label><div class="stepper"><button type="button" data-step="-1" data-for="${r.key}" aria-label="One less ${esc(r.label)}">${icon("minus")}</button><input class="input num" id="res-${r.key}" type="number" min="0" step="1" inputmode="numeric" data-path="resources.${r.key}" placeholder="0"><button type="button" data-step="1" data-for="${r.key}" aria-label="One more ${esc(r.label)}">${icon("plus")}</button></div></div>`;
  const T = resTypes();
  return `<p class="note">How many are needed each day while this task runs. For information only, it does not change the schedule.</p>
    <div class="resgrid"><div><h5>${icon("people")} People</h5>${T.filter(r => r.kind === "people").map(row).join("")}</div><div><h5>${icon("plant")} Plant</h5>${T.filter(r => r.kind === "plant").map(row).join("")}</div></div>
    <div class="resadd"><input class="input" id="resNew" placeholder="Add another type, e.g. Rigger" maxlength="40"><select class="select" id="resKind"><option value="people">People</option><option value="plant">Plant</option></select><button type="button" class="btn sm" id="resAddBtn">${icon("plus")} Add</button></div>`;
}
const countDesc = t => { let n = 0; const w = x => x.children.forEach(c => { n++; w(c); }); w(t); return n; };
const descendants = t => { const out = []; const w = x => x.children.forEach(c => { out.push(c); w(c); }); w(t); return out; };

// ---------- open / close ----------
export function openDrawer(id, ctx) {
  const t = ctx.state.model.byId.get(id); if (!t) return;
  if (cur) closeDrawer(true);
  const scrim = document.createElement("div"); scrim.className = "scrim";
  const el = document.createElement("aside"); el.className = "drawer"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", t.name);
  el.innerHTML = `<div class="dr-head" id="drHead"></div><div class="dr-body">${formHTML(t)}</div>`;
  document.body.append(scrim, el);
  cur = { id, ctx, el, scrim, draft: structuredClone(t.tr), saved: structuredClone(t.tr), dirty: false };
  scrim.addEventListener("click", () => closeDrawer());
  el.addEventListener("keydown", e => { if (e.key === "Escape") closeDrawer(); });
  resSig = resTypes().map(r => r.key).join(",");
  fillForm(); renderHead(); renderComments(); renderHistory(); updateStates();
  bindForm();
  $$(".drawer .sec").forEach((s, i) => s.animate([{ opacity: 0, transform: "translateY(14px)" }, { opacity: 1, transform: "none" }], { duration: 500, delay: 80 + i * 45, easing: "cubic-bezier(.22,1,.36,1)", fill: "backwards" }));
  setTimeout(() => $(".opt", el)?.focus({ preventScroll: true }), 300);
  $$(`.srow[data-id="${id}"]`).forEach(r => r.classList.add("sel"));
}

export async function closeDrawer(instant) {
  if (!cur) return;
  const c = cur; cur = null;
  await flush(c);
  $$(".srow.sel").forEach(r => r.classList.remove("sel"));
  if (instant) { c.el.remove(); c.scrim.remove(); return; }
  c.el.classList.add("closing"); c.scrim.classList.add("closing");
  setTimeout(() => { c.el.remove(); c.scrim.remove(); }, 340);
}

// ---------- form state ----------
function fillForm() {
  const { el, draft } = cur;
  $$(".opts[data-path]", el).forEach(g => { const v = get(draft, g.dataset.path) ?? ""; $$(".opt", g).forEach(b => { b.classList.toggle("on", b.dataset.v === v); b.setAttribute("aria-checked", b.dataset.v === v); }); });
  $$("input[data-path]", el).forEach(i => i.value = (i.dataset.path.startsWith("resources.") ? get(draft, i.dataset.path) || "" : get(draft, i.dataset.path)) ?? "");
  updateReveals(true);
}
function updateReveals(instant) {
  $$(".reveal", cur.el).forEach(r => {
    const [path, vals] = r.dataset.show.split("=");
    const open = vals.split("|").includes(get(cur.draft, path) ?? "");
    if (instant) { r.style.transition = "none"; requestAnimationFrame(() => r.style.transition = ""); }
    r.classList.toggle("open", open);
    $$("input,button,textarea,select", r).forEach(x => { if (!x.closest(".reveal:not(.open)")) x.tabIndex = 0; else x.tabIndex = -1; });
  });
}
function updateStates() {
  const d = cur.draft, s = (txt, cls = "") => `<span class="chip ${cls}">${txt}</span>`;
  const st = {
    status: s(statusMeta(d.status).label, { behind: "sev3", risk: "sev2", on: "sev1" }[d.status] || ""),
    workplan: !d.workplan.has ? s("Not answered") : d.workplan.has === "na" ? s("Not applicable") : d.workplan.has === "no" ? s("None yet", "sev2") : s([d.workplan.ref, (WP_STATUS.find(x => x[0] === d.workplan.status) || [, "Status not set"])[1]].filter(Boolean).join(" · "), d.workplan.status === "approved" ? "sev1" : d.workplan.status === "rejected" ? "sev3" : "sev2"),
    drawings: !d.drawings.has ? s("Not answered") : d.drawings.has === "na" ? s("Not applicable") : d.drawings.has === "no" ? s("Missing", "sev2") : s(d.drawings.approved === "yes" ? "Approved" : "Not approved yet", d.drawings.approved === "yes" ? "sev1" : "sev2"),
    scope: !d.scope.type ? s("Not answered") : d.scope.type === "scope" ? s("In scope", "sev1") : s(d.scope.response === "approved" ? "Variation approved" : d.scope.response === "rejected" ? "Variation rejected" : d.scope.costingSubmitted === "yes" ? "Costing with client" : d.scope.vn === "yes" ? "Notice sent" : "Variation, notice not sent", d.scope.response === "approved" ? "sev1" : d.scope.response === "rejected" ? "sev3" : "sev2"),
    next: d.next.action ? s(d.next.due ? `Due ${fmtDate(d.next.due)}` : "Open") : "",
    resources: (() => { const p = resSum(d.resources, "people"), q = resSum(d.resources, "plant"); return p + q ? s(`${p} people · ${q} plant`, "sev1") : s("None set"); })()
  };
  for (const [k, v] of Object.entries(st)) { const e = $(`[data-state="${k}"]`, cur.el); if (e) e.innerHTML = v; }
  const tk = cur.ctx.state.model.byId.get(cur.id), wd = $("#wpDates", cur.el);
  if (wd) wd.textContent = tk?.wpi?.submitBy ? `Needed for a ${fmtDate(tk.start)} start: submit by ${fmtDate(tk.wpi.submitBy)}, approved by ${fmtDate(tk.wpi.approveBy)}.` : "";
  const rn = $("#rollNote", cur.el);
  if (rn) { const t = cur.ctx.state.model.byId.get(cur.id); rn.innerHTML = `<span class="sdot" style="--c:${STATUS_VAR[t.eff]}"></span><span>Overall with sub tasks: <b>${statusMeta(t.eff).label}</b>. The worst sub task status rolls up to this package.</span>`; }
}

function bindForm() {
  const el = cur.el;
  el.addEventListener("click", e => {
    const b = e.target.closest(".opt"); if (!b) return;
    const g = b.closest(".opts[data-path]"); if (!g) return;
    const path = g.dataset.path, prev = get(cur.draft, path) ?? "";
    const v = prev === b.dataset.v && path !== "status" ? "" : b.dataset.v; // click again to clear
    set(cur.draft, path, v);
    $$(".opt", g).forEach(x => { x.classList.toggle("on", x.dataset.v === v); x.setAttribute("aria-checked", x.dataset.v === v); });
    updateReveals(); updateStates(); queueSave();
    if (path === "status") { const h = $("#drHead", el); h.style.setProperty("--c", STATUS_VAR[v]); if (v === "done" && prev !== "done") burst(e.clientX, e.clientY); }
  });
  el.addEventListener("click", e => {
    const sb = e.target.closest("[data-step]");
    if (sb) { const k = sb.dataset.for, n = Math.max(0, (+cur.draft.resources[k] || 0) + +sb.dataset.step); cur.draft.resources[k] = n; const i = $(`#res-${CSS.escape(k)}`, el); i.value = n || ""; i.animate([{ transform: "scale(1.18)" }, { transform: "none" }], { duration: 260 }); updateStates(); queueSave(); return; }
    if (e.target.closest("#resAddBtn")) addResType();
  });
  el.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.id === "resNew") { e.preventDefault(); addResType(); } });
  el.addEventListener("input", e => {
    const i = e.target.closest("input[data-path]"); if (!i) return;
    const isRes = i.dataset.path.startsWith("resources.");
    set(cur.draft, i.dataset.path, isRes ? Math.max(0, Math.round(+i.value) || 0) : i.value); updateStates(); queueSave();
  });
  $("#cmtPost", el)?.addEventListener("click", postComment);
  $("#cmtText", el)?.addEventListener("keydown", e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) postComment(); });
  $("#applyBtn", el)?.addEventListener("click", applyToChildren);
}

async function addResType() {
  const inp = $("#resNew", cur.el), label = inp.value.trim().replace(/\s+/g, " "); if (!label) { inp.focus(); return; }
  const T = resTypes();
  if (T.some(r => r.label.toLowerCase() === label.toLowerCase())) { toast("That type is already in the list", "err"); return; }
  const key = "c_" + label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  if (key === "c_" || T.some(r => r.key === key)) { toast("Pick a different name", "err"); return; }
  const custom = [...(cur.ctx.state.raw.meta?.resourceTypes || []), { key, label, kind: $("#resKind", cur.el).value }];
  try { await cur.ctx.store.saveMeta({ resourceTypes: custom }); toast(`Added ${label}`); }
  catch (e) { toast("Couldn't add: " + e.message, "err"); }
}
let resSig = "";
function syncResTypes() {
  const sig = resTypes().map(r => r.key).join(","); if (sig === resSig || !cur) { resSig = sig; return; }
  const box = $("#resInner", cur.el); if (!box || document.activeElement?.matches?.("#resInner input[data-path]")) return;
  resSig = sig;
  box.innerHTML = resInner(); $$("input[data-path]", box).forEach(i => i.value = get(cur.draft, i.dataset.path) || "");
}

// ---------- saving ----------
function diff(a, b, base = "") {
  const out = [];
  for (const k of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) {
    if (["comments", "tagsAdd", "tagsRemove", "updatedAt", "updatedBy"].includes(k)) continue;
    const p = base ? `${base}.${k}` : k, x = a?.[k], y = b?.[k];
    if (x && typeof x === "object" || y && typeof y === "object") out.push(...diff(x, y, p));
    else if ((x ?? "") !== (y ?? "")) out.push({ path: p, from: x ?? "", to: y ?? "" });
  }
  return out;
}
const queueSave = debounce(() => cur && flush(cur), 700);
async function flush(c) {
  const changes = diff(c.saved, c.draft); if (!changes.length) return;
  const t = c.ctx.state.model.byId.get(c.id);
  const ind = $(".dr-save", c.el); ind?.classList.add("saving"); if (ind) ind.lastChild.textContent = "Saving";
  const lab = p => LABELS[p] || (p.startsWith("resources.") ? resTypes().find(r => "resources." + r.key === p)?.label : "");
  const zero = v => v === 0 ? "" : v;
  const hist = changes.filter(ch => lab(ch.path) && zero(ch.from) !== zero(ch.to)).map(ch => ({ kind: "field", field: lab(ch.path), from: showVal(zero(ch.from)), to: showVal(zero(ch.to)), taskName: t?.name || "" }));
  try {
    c.saved = structuredClone(c.draft);
    await c.ctx.store.saveTracking(c.id, c.draft, hist);
    if (ind) { ind.classList.remove("saving"); ind.lastChild.textContent = "Saved"; }
  } catch (e) { toast("Couldn't save: " + e.message, "err"); if (ind) ind.lastChild.textContent = "Not saved"; }
}

// ---------- header ----------
function renderHead() {
  if (!cur) return;
  const t = cur.ctx.state.model.byId.get(cur.id); if (!t) return;
  const h = $("#drHead", cur.el);
  h.style.setProperty("--c", STATUS_VAR[cur.draft.status || ""]);
  const when = t.startsIn > 0 ? `starts ${relDays(t.startsIn)}` : t.finishesIn >= 0 ? `finishes ${relDays(t.finishesIn)}` : `finished ${relDays(t.finishesIn)}`;
  const missing = TAGS.filter(tg => !t.tags.includes(tg.key) && tg.key !== "untagged");
  h.innerHTML = `
    <div class="dr-top"><span class="dr-id">ID ${t.id}</span>${t.children.length ? `<span class="chip">Package · ${countDesc(t)} tasks</span>` : ""}
      <span class="dr-save"><span class="dot"></span><span>Saved</span></span>
      <button class="icon-btn" id="drClose" aria-label="Close">${icon("close")}</button></div>
    <h2>${esc(t.name)}</h2>
    <div class="crumbs">${esc(t.path.join(" › "))}</div>
    <div class="dr-tags">${t.tags.filter(k => k !== "untagged").map(k => tagHTML(k, true)).join("")}
      <span class="add-tag"><button class="btn sm ghost" id="addTag">${icon("tag")} Add tag</button></span></div>
    <div class="dr-stats">
      <div class="stat"><b class="num">${fmtDate(t.start) || "-"}</b><span>Start</span></div>
      <div class="stat"><b class="num">${fmtDate(t.finish) || "-"}</b><span>Finish, ${when}</span></div>
      <div class="stat"><b class="num">${t.remDur ?? "-"}</b><span>Days remaining</span></div>
      <div class="stat"><b class="num">${t.actual != null ? t.actual + "%" : "-"}</b><span>${t.expected != null && t.startsIn <= 0 ? `Actual, about ${t.expected}% expected by today` : "Actual"}</span></div>
    </div>
    ${t.actual != null ? `<div class="prog"><div class="track"><span class="ac" style="width:0"></span>${t.expected != null && t.startsIn <= 0 ? `<span class="pl" style="left:${t.expected}%"></span>` : ""}</div><div class="lg"><span>Actual ${t.actual}%${t.planned != null ? ` · MSP planned ${t.planned}%` : ""}</span><span>${t.startsIn > 0 ? "Not started yet" : t.gap > 0 ? `${t.gap}% behind where it should be` : "On or ahead of time"}</span></div></div>` : ""}
    ${t.flags.length ? `<div class="why" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:12px;position:relative">${flagChips(t, 6)}</div>` : ""}`;
  requestAnimationFrame(() => { const a = $(".prog .ac", h); if (a) a.style.width = (t.actual || 0) + "%"; });
  $("#drClose", h).addEventListener("click", () => closeDrawer());
  $$("[data-untag]", h).forEach(b => b.addEventListener("click", () => changeTag(b.dataset.untag, false)));
  $("#addTag", h).addEventListener("click", e => {
    e.stopPropagation(); const host = e.currentTarget.parentElement; const old = $(".menu", host); if (old) { old.remove(); return; }
    const m = document.createElement("div"); m.className = "menu";
    m.innerHTML = missing.map(tg => `<button data-k="${tg.key}"><span class="tag" style="--h:${tg.hue}">${esc(tg.label)}</span></button>`).join("") || `<div class="note" style="padding:8px">All tags applied</div>`;
    host.appendChild(m);
    m.addEventListener("click", ev => { const b = ev.target.closest("[data-k]"); if (b) { m.remove(); changeTag(b.dataset.k, true); } });
    setTimeout(() => document.addEventListener("click", function off(ev) { if (!m.contains(ev.target)) { m.remove(); document.removeEventListener("click", off); } }), 0);
  });
}
async function changeTag(key, add) {
  const t = cur.ctx.state.model.byId.get(cur.id), d = cur.draft;
  const auto = t.autoTags.includes(key);
  d.tagsAdd = (d.tagsAdd || []).filter(k => k !== key); d.tagsRemove = (d.tagsRemove || []).filter(k => k !== key);
  if (add && !auto) d.tagsAdd.push(key);
  if (!add && auto) d.tagsRemove.push(key);
  cur.saved.tagsAdd = d.tagsAdd; cur.saved.tagsRemove = d.tagsRemove;
  try { await cur.ctx.store.saveTracking(cur.id, d, [{ kind: "field", field: "Tags", from: "", to: `${add ? "Added" : "Removed"} ${tagMeta(key).label}`, taskName: t.name }]); }
  catch (e) { toast("Couldn't save tag: " + e.message, "err"); }
}

// ---------- comments / history ----------
export function histLine(x) {
  if (!x.from) return `<b>${esc(x.field)}</b>: ${esc(x.to)}`;
  if (x.from === "blank") return `<b>${esc(x.field)}</b> set to <b>${esc(x.to)}</b>`;
  if (x.to === "blank") return `<b>${esc(x.field)}</b> cleared (was ${esc(x.from)})`;
  return `<b>${esc(x.field)}</b> changed from ${esc(x.from)} to <b>${esc(x.to)}</b>`;
}
async function postComment() {
  const ta = $("#cmtText", cur.el), txt = ta.value.trim(); if (!txt) { ta.focus(); return; }
  const t = cur.ctx.state.model.byId.get(cur.id);
  ta.value = ""; const btn = $("#cmtPost", cur.el); btn.disabled = true;
  try { await cur.ctx.store.addComment(cur.id, txt, t.name); toast("Comment posted"); }
  catch (e) { ta.value = txt; toast("Couldn't post: " + e.message, "err"); }
  btn.disabled = false;
}
function renderComments() {
  if (!cur) return;
  const t = cur.ctx.state.model.byId.get(cur.id); const list = $("#cmtList", cur.el); if (!list || !t) return;
  const cs = t.tr.comments.slice().sort((a, b) => b.at.localeCompare(a.at));
  list.innerHTML = cs.map(c => `<div class="cmt"><div class="h"><b>${esc(c.by.split("@")[0])}</b><time title="${esc(c.at)}">${stamp(c.at)}</time><button data-del="${esc(c.id)}">Delete</button></div><p>${esc(c.text)}</p></div>`).join("") || `<div class="note">No comments yet.</div>`;
  $$("[data-del]", list).forEach(b => b.addEventListener("click", async () => {
    if (!confirm("Delete this comment?")) return;
    const c = cs.find(x => x.id === b.dataset.del); try { await cur.ctx.store.deleteComment(cur.id, c); } catch (e) { toast(e.message, "err"); }
  }));
}
function renderHistory() {
  if (!cur) return;
  const list = $("#histList", cur.el); if (!list) return;
  const h = cur.ctx.state.history.filter(x => +x.taskId === cur.id).slice(0, 40);
  list.innerHTML = h.map(x => `<div class="it"><time>${timeAgo(x.at)}</time><span>${x.kind === "comment" ? `Commented` : histLine(x)}</span></div>`).join("") || `<div class="note">No changes yet.</div>`;
}

export function refreshDrawer() {
  if (!cur) return;
  const t = cur.ctx.state.model.byId.get(cur.id); if (!t) { closeDrawer(); return; }
  renderHead(); renderComments(); renderHistory(); syncResTypes(); updateStates();
  // pick up changes made elsewhere when nothing is being edited here
  const idle = !diff(cur.saved, cur.draft).length && !cur.el.contains(document.activeElement);
  if (idle && diff(cur.saved, t.tr).length) { cur.draft = structuredClone(t.tr); cur.saved = structuredClone(t.tr); fillForm(); updateStates(); }
}

// ---------- apply to children ----------
async function applyToChildren() {
  await flush(cur);
  const t = cur.ctx.state.model.byId.get(cur.id);
  const keys = $$("[data-apply]", cur.el).filter(c => c.checked).map(c => c.dataset.apply);
  if (!keys.length) { toast("Tick at least one section to copy", "err"); return; }
  const kids = descendants(t);
  if (!confirm(`Copy ${keys.join(", ")} to ${kids.length} sub tasks? Their current answers in those sections will be replaced.`)) return;
  const entries = kids.map(k => { const tr = mergeTracking(structuredClone(k.tr)); keys.forEach(key => tr[key] = structuredClone(cur.draft[key])); return { taskId: k.id, tracking: tr }; });
  try {
    await cur.ctx.store.saveMany(entries, { kind: "field", taskId: t.id, taskName: t.name, field: "Applied to sub tasks", from: "", to: `${keys.join(", ")} copied to ${kids.length} tasks` });
    toast(`Applied to ${kids.length} sub tasks`);
  } catch (e) { toast("Couldn't apply: " + e.message, "err"); }
}
