// Schedule: collapsible task tree with a Gantt timeline, filters and exports.
import { STATUSES, parseISO, today, DAY, fmtDate, fmtShort, statusMeta, tagMeta } from "../model.js";
import { esc, icon, toast, $, $$, segThumbs } from "../ui.js";
import { getXLSX } from "../importers.js";
import { STATUS_VAR, matches, anyFilter, tagChips, bindTagChips, tagCounts, indicators, statusDot, SHOW } from "./shared.js";

const ZOOM = { week: { px: 30, label: "Weeks" }, month: { px: 9, label: "Months" }, quarter: { px: 3.2, label: "Quarters" } };
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function visibleRows(ctx) {
  const { tasks, byId } = ctx.state.model, f = ctx.state.filters;
  let show;
  const ctxOnly = new Set();
  if (anyFilter(f)) {
    const m = tasks.filter(t => matches(t, f));
    show = new Set(m.map(t => t.id));
    for (const t of m) for (const a of t.chain) if (!show.has(a.id)) { show.add(a.id); ctxOnly.add(a.id); }
  } else show = new Set(tasks.map(t => t.id));
  const out = [];
  for (const t of tasks) {
    if (!show.has(t.id)) continue;
    if (t.chain.some(a => ctx.state.collapsed.has(a.id))) continue;
    out.push({ t, ctx: ctxOnly.has(t.id) });
  }
  return { rows: out, matched: show.size - ctxOnly.size };
}

export function renderSchedule(view, ctx, { fresh }) {
  const st = ctx.state, f = st.filters;
  if (!st.model.tasks.length) { view.innerHTML = `<div class="view-inner"><div class="panel empty">No schedule loaded yet. Go to Import, or load the 2 Oct schedule from the Command page.</div></div>`; return; }
  const { rows, matched } = visibleRows(ctx);
  const z = ZOOM[st.zoom], px = z.px;
  const all = st.model.tasks.filter(t => t.s && t.f);
  const span = rows.length ? rows.map(r => r.t).filter(t => t.s) : all;
  const minD = new Date(Math.min(...span.filter(t => t.level > 0).map(t => +t.s), +today()) - 14 * DAY);
  const maxD = new Date(Math.max(...span.filter(t => t.level > 0).map(t => +t.f), +today()) + 21 * DAY);
  minD.setDate(1);
  const days = Math.round((maxD - minD) / DAY) + 1, tlW = Math.round(days * px);
  const X = d => ((d - minD) / DAY) * px;
  const tx = X(today());

  // header ticks
  let months = "", ticks = "", grid = "";
  for (let d = new Date(minD); d <= maxD; d.setMonth(d.getMonth() + 1)) {
    const x = X(d), next = new Date(d.getFullYear(), d.getMonth() + 1, 1), w = X(next) - x;
    const name = st.zoom === "quarter" ? MONTHS[d.getMonth()].slice(0, 3) + (d.getMonth() === 0 ? " " + d.getFullYear() : "") : `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    months += `<span style="left:${x}px;width:${w}px">${w > 40 ? name : ""}</span>`;
    grid += `<div class="tl-grid" style="left:${x}px"></div>`;
  }
  if (st.zoom !== "quarter") {
    const d = new Date(minD); while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
    for (; d <= maxD; d.setDate(d.getDate() + 7)) { const x = X(d); ticks += `<span style="left:${x}px">${d.getDate()}</span>`; grid += `<div class="tl-grid wk" style="left:${x}px"></div>`; }
  }

  const rowHTML = ({ t, ctx: c }, i) => {
    const kids = t.children.length, closed = st.collapsed.has(t.id);
    const ms = t.s && t.f && +t.s === +t.f && !kids;
    let bar = "";
    if (t.s && t.f) {
      const l = X(t.s), w = Math.max(px, X(t.f) - l + (ms ? 0 : px * .0));
      if (ms) bar = `<div class="gbar ms" style="left:${l}px" title="Milestone ${fmtDate(t.start)}"></div>`;
      else if (kids) bar = `<div class="gbar sumbar" style="left:${l}px;width:${w}px"></div>`;
      else bar = `<div class="gbar" style="left:${l}px;width:${w}px;--c:${t.eff ? STATUS_VAR[t.eff] : "var(--accent)"}"><span class="fill" style="width:${t.actual ?? 0}%"></span>${t.expected != null && t.startsIn <= 0 && t.finishesIn >= 0 ? `<span class="plan" style="left:calc(${t.expected}% - 1px)"></span>` : ""}</div>
        <span class="glabel" style="left:${l + w + 6}px">${t.actual != null ? `${t.actual}%` : ""}</span>`;
    }
    return `<div class="srow data ${kids ? "sum" : ""} ${t.level <= 2 ? "lvl-top" : ""} ${c ? "ctx" : ""}" data-id="${t.id}" style="${fresh ? `animation-delay:${Math.min(i, 40) * 12}ms` : "animation:none"}">
      <div class="left">
        <div class="c-id num faint">${t.id}</div>
        <div class="c-nm"><div class="nm" style="padding-left:${t.level * 14}px">${kids ? `<button class="caret ${closed ? "closed" : ""}" data-toggle="${t.id}" aria-label="${closed ? "Expand" : "Collapse"}">${icon("caret")}</button>` : `<span style="width:20px;flex:none"></span>`}
          ${statusDot(t)}<span class="txt" title="${esc(t.name)}">${esc(t.name)}</span>${t.flagCount && (!kids || closed) ? `<span class="flagdot">${t.flagCount}</span>` : ""}${t.tr.comments.length ? `<span class="faint" title="${t.tr.comments.length} comments">${icon("chat").replace("<svg", '<svg width="14" height="14"')}</span>` : ""}</div></div>
        <div class="c-ind">${t.level >= 3 ? indicators(t) : ""}</div>
        <div class="c-s num">${t.s ? fmtShort(t.start) : ""}</div>
        <div class="c-f num">${t.f ? fmtShort(t.finish) : ""}</div>
        <div class="c-p num faint">${t.planned != null ? Math.round(t.planned) + "%" : ""}</div>
        <div class="c-a num">${t.actual != null ? Math.round(t.actual) + "%" : ""}</div>
      </div>
      <div class="tl">${bar}</div>
    </div>`;
  };

  view.innerHTML = `<div class="view-inner ${fresh ? "enter" : ""}">
    <div class="toolbar">
      <div class="searchbox">${icon("search")}<input class="input" id="sq" placeholder="Search tasks, areas, comments" value="${esc(f.q)}"></div>
      <select class="select" id="sstatus" style="width:auto" aria-label="Status">
        <option value="">Any status</option>${STATUSES.filter(s => s.key).map(s => `<option value="${s.key}" ${f.status === s.key ? "selected" : ""}>${s.label}</option>`).join("")}<option value="unset" ${f.status === "unset" ? "selected" : ""}>Not set</option>
      </select>
      <select class="select" id="sshow" style="width:auto" aria-label="Show">${SHOW.map(([k, l]) => `<option value="${k}" ${f.show === k ? "selected" : ""}>${l}</option>`).join("")}</select>
      <div class="seg-ctl" id="zoom">${Object.entries(ZOOM).map(([k, v]) => `<button data-z="${k}" class="${st.zoom === k ? "on" : ""}">${v.label}</button>`).join("")}</div>
      <span class="grow"></span>
      <button class="icon-btn" id="expAll" title="Expand all">${icon("expand")}</button>
      <button class="icon-btn" id="colAll" title="Collapse to packages">${icon("collapse")}</button>
      <button class="btn sm" id="xls">${icon("excel")} Excel</button>
      <button class="btn sm" id="prt">${icon("print")} Print</button>
    </div>
    ${tagChips(st, tagCounts(st.model.tasks))}
    <div class="panel sched">
      <div class="sched-scroll" id="sscroll" data-keep-scroll="sched">
        <div style="position:relative;width:calc(var(--left, 760px) + ${tlW}px);--tl:${tlW}px" id="sgrid">
          <div style="position:absolute;top:0;bottom:0;left:var(--left, 760px);width:${tlW}px;pointer-events:none;z-index:0" class="tl-overlay">${grid}<div class="today-line" style="left:${tx}px"></div></div>
          <div class="srow head" style="--tl:${tlW}px">
            <div class="left"><div class="c-id">ID</div><div class="c-nm">Task <span class="faint" style="font-weight:400">· ${matched} shown</span></div><div class="c-ind">Tracking</div><div class="c-s">Start</div><div class="c-f">Finish</div><div class="c-p">Plan</div><div class="c-a">Actual</div></div>
            <div class="tl"><div class="tl-head-months">${months}</div><div class="tl-head-days">${ticks}</div><span class="today-tag" style="left:${tx}px">Today</span></div>
          </div>
          ${rows.map(rowHTML).join("") || `<div class="empty">Nothing matches these filters.</div>`}
        </div>
      </div>
      <div class="sched-foot">
        ${STATUSES.map(s => `<span class="k"><span class="sdot" style="--c:${STATUS_VAR[s.key]}"></span>${s.label}</span>`).join("")}
        <span class="k"><span class="ind ok">WP</span> Workplan</span><span class="k"><span class="ind ok">DR</span> Drawings</span><span class="k"><span class="ind warn">VAR</span> Variation / <span class="ind ok">SC</span> In scope</span>
        <span class="k">Bar fill is actual %. The thin mark shows where a running task should be by today. Plan column is Planned % from MSP</span>
      </div>
    </div>
    <div class="print-only" id="printArea"></div>
  </div>`;

  const sc = $("#sscroll", view);
  if (fresh) {
    sc.scrollLeft = Math.max(0, tx - 140);
  }
  segThumbs(view); bindTagChips(view, ctx);
  sc.addEventListener("click", e => {
    const tg = e.target.closest("[data-toggle]");
    if (tg) { e.stopPropagation(); const id = +tg.dataset.toggle; st.collapsed.has(id) ? st.collapsed.delete(id) : st.collapsed.add(id); ctx.rerender(); return; }
    const r = e.target.closest(".srow.data"); if (r) ctx.openTask(+r.dataset.id);
  });
  const q = $("#sq", view);
  q.addEventListener("input", () => { clearTimeout(q._t); q._t = setTimeout(() => { f.q = q.value; ctx.rerender(); const n = $("#sq"); n?.focus(); n?.setSelectionRange(n.value.length, n.value.length); }, 250); });
  $("#sstatus", view).addEventListener("change", e => ctx.setFilters({ status: e.target.value }));
  $("#sshow", view).addEventListener("change", e => ctx.setFilters({ show: e.target.value }));
  $$("#zoom button", view).forEach(b => b.addEventListener("click", () => { st.zoom = b.dataset.z; renderSchedule(view, ctx, { fresh: true }); }));
  $("#expAll", view).addEventListener("click", () => { st.collapsed.clear(); ctx.rerender(); });
  $("#colAll", view).addEventListener("click", () => { st.model.tasks.forEach(t => { if (t.children.length && t.level >= 3) st.collapsed.add(t.id); }); ctx.rerender(); });
  $("#xls", view).addEventListener("click", () => exportExcel(ctx, rows.filter(r => !r.ctx).map(r => r.t)));
  $("#prt", view).addEventListener("click", () => printView(view, rows.filter(r => !r.ctx).map(r => r.t), ctx));
}

// ---------- exports ----------
const yn = v => ({ yes: "Yes", no: "No", na: "N/A" }[v] || "");
const WPS = { notstarted: "Not started", drafting: "Drafting", internal: "Internal review", submitted: "Submitted to client", clientreview: "Under client review", approved: "Approved", rejected: "Rejected" };
const DRT = { lift: "Lift plan", scaffold: "Scaffold design", blocks: "Engineered blocks", sequence: "Demolition sequence", other: "Other" };
const RSP = { pending: "Pending", approved: "Approved", rejected: "Rejected" };
export function exportRow(t) {
  const tr = t.tr, wp = tr.workplan, dr = tr.drawings, s = tr.scope, x = tr.extras, n = tr.next;
  const last = tr.comments[tr.comments.length - 1];
  return {
    "ID": t.id, "Task": "  ".repeat(Math.max(0, t.level - 1)) + t.name, "Area": t.path.slice(-1)[0] || "", "Tags": t.tags.map(k => tagMeta(k).label).join(", "),
    "Start": t.start || "", "Finish": t.finish || "", "Remaining days": t.remDur ?? "", "Planned %": t.planned ?? "", "Actual %": t.actual ?? "",
    "Status": statusMeta(tr.status).label, "Roll up": statusMeta(t.eff).label,
    "Workplan": yn(wp.has), "WP number": wp.ref, "WP status": WPS[wp.status] || "", "WP revision": wp.rev, "WP submitted": wp.submitted, "Client comments": yn(wp.clientComments),
    "Drawings": yn(dr.has), "Drawing type": DRT[dr.type] || "", "Drawing number": dr.number, "Drawing rev": dr.rev, "Drawing approved": yn(dr.approved),
    "Scope": s.type === "variation" ? "Variation" : s.type === "scope" ? "In scope" : "", "Notice of delay": yn(s.nod), "NOD date": s.nodDate,
    "Variation notice": yn(s.vn), "VN number": s.vnRef, "VN date": s.vnDate, "Costing done": yn(s.costingDone), "Costing submitted": yn(s.costingSubmitted), "Costing date": s.costingDate,
    "Variation value": s.value ? +s.value : "", "Client response": RSP[s.response] || "", "Approved value": s.approvedValue ? +s.approvedValue : "",
    "Permit / hold point": yn(x.permit), "PO raised": yn(x.po), "PO number": x.poNumber, "Hire / crane booked": yn(x.hire), "Clearance cert": yn(x.clearance),
    "Next action": n.action, "Owner": n.owner, "Due": n.due,
    "Flags": t.flags.map(f => f.text).join("; "), "Latest comment": last ? `${last.text} (${last.by}, ${last.at.slice(0, 10)})` : "", "Comments": tr.comments.length
  };
}
async function exportExcel(ctx, list) {
  try {
    const XLSX = await getXLSX();
    const data = list.map(exportRow);
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = Object.keys(data[0] || {}).map(k => ({ wch: k === "Task" ? 60 : k === "Latest comment" || k === "Flags" ? 50 : Math.max(10, k.length + 2) }));
    ws["!autofilter"] = { ref: ws["!ref"] };
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Tracker");
    const all = []; ctx.state.model.tasks.forEach(t => t.tr.comments.forEach(c => all.push({ ID: t.id, Task: t.name, When: c.at.replace("T", " ").slice(0, 16), By: c.by, Comment: c.text })));
    if (all.length) { const cs = XLSX.utils.json_to_sheet(all); cs["!cols"] = [{ wch: 8 }, { wch: 50 }, { wch: 18 }, { wch: 28 }, { wch: 80 }]; XLSX.utils.book_append_sheet(wb, cs, "Comments"); }
    XLSX.writeFile(wb, `P269 Schedule Tracker ${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast(`Exported ${list.length} rows`);
  } catch (e) { toast("Export failed: " + e.message, "err"); }
}
function printView(view, list, ctx) {
  const meta = ctx.state.raw.meta || {};
  $("#printArea", view).innerHTML = `<h2 style="font-family:var(--font-hud)">Project 269 schedule tracker</h2><p>Status date ${fmtDate(meta.statusDate || "")}. Printed ${new Date().toLocaleString("en-AU")}.</p>
  <table class="tbl"><thead><tr><th>ID</th><th>Task</th><th>Start</th><th>Finish</th><th>Plan</th><th>Act</th><th>Status</th><th>Workplan</th><th>Drawings</th><th>Scope</th><th>Next action</th><th>Latest comment</th></tr></thead><tbody>
  ${list.map(t => { const r = exportRow(t); return `<tr><td>${t.id}</td><td style="padding-left:${t.level * 8}px">${esc(t.name)}</td><td>${fmtShort(t.start)}</td><td>${fmtShort(t.finish)}</td><td>${r["Planned %"]}</td><td>${r["Actual %"]}</td><td>${r["Status"]}</td><td>${esc([r["Workplan"], r["WP status"], r["WP revision"]].filter(Boolean).join(" "))}</td><td>${esc([r["Drawings"], r["Drawing rev"]].filter(Boolean).join(" "))}</td><td>${esc(r["Scope"])}</td><td>${esc([r["Next action"], r["Owner"]].filter(Boolean).join(", "))}</td><td>${esc(r["Latest comment"])}</td></tr>`; }).join("")}
  </tbody></table>`;
  document.body.classList.add("printing"); window.print(); setTimeout(() => document.body.classList.remove("printing"), 500);
}
