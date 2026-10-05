// Kanban board by status, with drag and drop (mouse, pen and touch hold).
import { STATUSES, isActiveWindow, isPackage, statusMeta, fmtShort, relDays } from "../model.js";
import { APP } from "../config.js";
import { esc, icon, toast, $, $$, bindSpot, segThumbs } from "../ui.js";
import { STATUS_VAR, tagChips, bindTagChips, tagCounts, matches, flagChips } from "./shared.js";

const SCOPES = [
  { key: "window", label: `Next ${APP.lookaheadDays} days` },
  { key: "packages", label: "Packages" },
  { key: "all", label: "All tasks" }
];

export function boardTasks(ctx, scope, useFilters = true) {
  const { tasks } = ctx.state.model;
  return tasks.filter(t => {
    if (t.level < 3) return false;
    if (scope === "window" && !(t.isLeaf && isActiveWindow(t))) return false;
    if (scope === "packages" && !isPackage(t)) return false;
    if (scope === "all" && !t.isLeaf) return false;
    return useFilters ? matches(t, ctx.state.filters) : true;
  }).sort((a, b) => (a.s - b.s) || a.id - b.id);
}

function cardHTML(t) {
  const own = t.tr.status || "";
  const worse = t.eff !== own && t.eff && t.eff !== "done";
  const pct = t.actual ?? 0, pl = t.planned ?? null;
  const when = t.startsIn > 0 ? `Starts ${fmtShort(t.start)}` : t.finishesIn >= 0 ? `Due ${fmtShort(t.finish)}` : `Ended ${fmtShort(t.finish)}`;
  return `<article class="card" data-id="${t.id}" style="--c:${STATUS_VAR[own]}" tabindex="0" aria-label="${esc(t.name)}">
    <div class="ct">${esc(t.name)}</div>
    <div class="cp">${esc(t.path.slice(-1)[0] || "")}</div>
    ${t.isLeaf ? `<div class="mini" title="Actual ${pct}%${pl != null ? `, planned ${pl}%` : ""}"><i style="width:${pct}%"></i>${pl != null ? `<b style="left:${pl}%"></b>` : ""}</div>` : ""}
    <div class="cm">${icon("calendar")}<span>${when}</span>${t.flagCount ? `<span class="flagdot" title="Items needing attention">${t.flagCount}</span>` : ""}${worse ? `<span class="chip sev${t.eff === "behind" ? 3 : 2}">Sub task ${statusMeta(t.eff).label.toLowerCase()}</span>` : ""}</div>
  </article>`;
}

export function boardHTML(list, { cap = 0, more = "" } = {}) {
  return `<div class="board" data-keep-scroll="board">${STATUSES.map(s => {
    const items = list.filter(t => (t.tr.status || "") === s.key);
    const shown = cap ? items.slice(0, cap) : items;
    return `<section class="col" data-status="${s.key}" style="--c:${STATUS_VAR[s.key]}">
      <header class="col-head"><span class="sw"></span>${s.label}<span class="n">${items.length}</span></header>
      <div class="col-body" data-keep-scroll="col-${s.key || "unset"}">${shown.map(cardHTML).join("") || `<div class="faint" style="font-size:13px;padding:10px 4px">Drop a card here</div>`}
      ${cap && items.length > cap ? `<button class="btn sm ghost" data-more>${items.length - cap} more ${more}</button>` : ""}</div>
    </section>`;
  }).join("")}</div>`;
}

export function bindBoard(root, ctx) {
  const board = $(".board", root); if (!board) return;
  $$("[data-more]", board).forEach(b => b.addEventListener("click", () => ctx.go("board")));
  let drag = null, holdTimer = null;
  const preventTouch = e => { if (drag?.active) e.preventDefault(); };
  document.addEventListener("touchmove", preventTouch, { passive: false });

  board.addEventListener("mousedown", e => { if (e.target.closest(".card")) e.preventDefault(); });
  board.addEventListener("dragstart", e => e.preventDefault());
  board.addEventListener("keydown", e => { const c = e.target.closest(".card"); if (c && e.key === "Enter") ctx.openTask(+c.dataset.id); });
  board.addEventListener("pointerdown", e => {
    const card = e.target.closest(".card"); if (!card || e.button > 0) return;
    if (e.pointerType !== "touch") e.preventDefault();
    drag = { card, id: +card.dataset.id, x0: e.clientX, y0: e.clientY, active: false, touch: e.pointerType === "touch", pid: e.pointerId };
    if (drag.touch) holdTimer = setTimeout(() => { if (drag) begin(e.clientX, e.clientY); navigator.vibrate?.(15); }, 260);
  });
  const begin = (x, y) => {
    drag.active = true; drag.card.classList.add("dragging");
    const r = drag.card.getBoundingClientRect();
    const g = drag.card.cloneNode(true); g.classList.remove("dragging"); g.classList.add("drag-ghost"); g.style.width = r.width + "px";
    document.body.appendChild(g); drag.ghost = g; drag.dx = x - r.left; drag.dy = y - r.top; move(x, y);
  };
  const move = (x, y) => {
    drag.ghost.style.left = x - drag.dx + "px"; drag.ghost.style.top = y - drag.dy + "px";
    const col = document.elementFromPoint(x, y)?.closest(".col");
    $$(".col", board).forEach(c => c.classList.toggle("drop-hover", c === col));
    drag.over = col;
    const br = board.getBoundingClientRect();
    if (x > br.right - 40) board.scrollLeft += 12; else if (x < br.left + 40) board.scrollLeft -= 12;
  };
  const onMove = e => {
    if (!drag || e.pointerId !== drag.pid) return;
    const d = Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0);
    if (!drag.active) { if (drag.touch) { if (d > 8) { clearTimeout(holdTimer); drag = null; } return; } if (d > 6) begin(e.clientX, e.clientY); else return; }
    move(e.clientX, e.clientY);
  };
  addEventListener("pointermove", onMove);
  const end = async e => {
    clearTimeout(holdTimer); if (!drag || (e.pointerId !== undefined && e.pointerId !== drag.pid)) return;
    const d = drag; drag = null;
    if (!d.active) { if (e.type === "pointerup") ctx.openTask(d.id); return; }
    d.ghost.remove(); d.card.classList.remove("dragging"); $$(".col", board).forEach(c => c.classList.remove("drop-hover"));
    const col = d.over; if (!col) return;
    const t = ctx.state.model.byId.get(d.id); const to = col.dataset.status, from = t.tr.status || "";
    if (to === from) return;
    $(".col-body", col).prepend(d.card); d.card.style.setProperty("--c", STATUS_VAR[to]);
    d.card.animate([{ transform: "scale(1.06)" }, { transform: "scale(1)" }], { duration: 400, easing: "cubic-bezier(.22,1,.36,1)" });
    try {
      await ctx.store.saveTracking(d.id, { ...t.tr, status: to }, [{ kind: "field", field: "Status", from: statusMeta(from).label, to: statusMeta(to).label, taskName: t.name }]);
      toast(`${t.name}: ${statusMeta(to).label}`);
    } catch (ex) { toast("Couldn't save: " + ex.message, "err"); ctx.rerender(); }
  };
  addEventListener("pointerup", end); addEventListener("pointercancel", end);
  // remove global listeners when the board leaves the page
  const obs = new MutationObserver(() => { if (!document.contains(board)) { removeEventListener("pointerup", end); removeEventListener("pointermove", onMove); removeEventListener("pointercancel", end); document.removeEventListener("touchmove", preventTouch); obs.disconnect(); } });
  obs.observe(document.body, { childList: true, subtree: true });
}

export function renderBoard(view, ctx, { fresh }) {
  const st = ctx.state, scope = st.boardScope;
  if (!st.model.tasks.length) { view.innerHTML = `<div class="view-inner"><div class="panel empty">No schedule loaded yet. Go to Import to load one.</div></div>`; return; }
  const list = boardTasks(ctx, scope);
  const base = boardTasks(ctx, scope, false);
  view.innerHTML = `<div class="view-inner ${fresh ? "enter" : ""}">
    <div class="toolbar">
      <div class="searchbox">${icon("search")}<input class="input" id="bq" placeholder="Filter cards" value="${esc(st.filters.q)}"></div>
      <div class="seg-ctl" id="scope">${SCOPES.map(s => `<button data-s="${s.key}" class="${s.key === scope ? "on" : ""}">${s.label}</button>`).join("")}</div>
      <span class="grow"></span>
      <span class="faint" style="font-size:13px">Drag cards between columns. On a phone, press and hold a card first.</span>
    </div>
    ${tagChips(st, tagCounts(base))}
    ${boardHTML(list)}
  </div>`;
  bindTagChips(view, ctx); bindBoard(view, ctx); bindSpot(view); segThumbs(view);
  $$("#scope button", view).forEach(b => b.addEventListener("click", () => { st.boardScope = b.dataset.s; ctx.rerender(); }));
  const q = $("#bq", view);
  q.addEventListener("input", () => { st.filters.q = q.value; clearTimeout(q._t); q._t = setTimeout(() => { ctx.rerender(); const n = $("#bq"); n?.focus(); n?.setSelectionRange(n.value.length, n.value.length); }, 250); });
}
