// Home: health dial, KPIs, needs attention, planned vs actual by area, and the board.
import { APP, TAGS } from "../config.js";
import { isActiveWindow, fmtDate, DAY, today } from "../model.js";
import { esc, icon, toast, $, $$, bindTilt, bindSpot, countUp } from "../ui.js";
import { STATUS_VAR, flagChips, whenText } from "./shared.js";
import { boardHTML, bindBoard, boardTasks } from "./board.js";

const SEGS = [
  { key: "on", label: "On track" }, { key: "risk", label: "At risk" }, { key: "behind", label: "Behind" },
  { key: "done", label: "Complete" }, { key: "", label: "Not set" }
];

function dialSVG(counts, total) {
  const C = 170, R = 128;
  let acc = 0; const gap = total > 1 ? .8 : 0;
  const segs = SEGS.map(s => {
    const v = counts[s.key] || 0; if (!v) return "";
    const len = Math.max(0, (v / total) * 100 - gap), off = acc; acc += (v / total) * 100;
    return `<circle class="seg" data-status="${s.key || "unset"}" cx="${C}" cy="${C}" r="${R}" pathLength="100" fill="none" stroke="${STATUS_VAR[s.key]}" stroke-width="22" stroke-linecap="butt"
      stroke-dasharray="0 100" data-dash="${len} ${100 - len}" stroke-dashoffset="${-off}" transform="rotate(-90 ${C} ${C})" style="filter:drop-shadow(0 0 8px ${STATUS_VAR[s.key]})"><title>${s.label}: ${v}</title></circle>`;
  }).join("");
  const ticks = Array.from({ length: 120 }, (_, i) => `<line x1="${C}" y1="6" x2="${C}" y2="${i % 10 ? 12 : 20}" stroke="var(--ink3)" stroke-width="${i % 10 ? 1 : 2}" opacity="${i % 10 ? .35 : .8}" transform="rotate(${i * 3} ${C} ${C})"/>`).join("");
  return `<svg viewBox="0 0 340 340" role="img" aria-label="Status of active tasks">
    <defs><radialGradient id="core"><stop offset="0" stop-color="var(--accent)" stop-opacity=".18"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></radialGradient></defs>
    <circle cx="${C}" cy="${C}" r="104" fill="url(#core)"/>
    <g class="tick-ring">${ticks}</g>
    <circle cx="${C}" cy="${C}" r="${R}" fill="none" stroke="var(--line)" stroke-width="22"/>
    ${segs}
    <g class="tick-ring rev"><circle cx="${C}" cy="${C}" r="104" fill="none" stroke="var(--accent)" stroke-width="1.5" stroke-dasharray="2 10" opacity=".7"/></g>
    <circle cx="${C}" cy="${C}" r="92" fill="none" stroke="var(--line-hi)" stroke-width="1"/>
  </svg>`;
}

function spark(values) {
  const max = Math.max(1, ...values), w = 74, h = 30;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - (v / max) * (h - 4) - 2}`).join(" ");
  return `<svg class="k-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="var(--kc,var(--accent))" stroke-width="1.8" stroke-linejoin="round"/><polygon points="0,${h} ${pts} ${w},${h}" fill="var(--kc,var(--accent))" opacity=".12"/></svg>`;
}

export function renderCommand(view, ctx, { fresh }) {
  const st = ctx.state, T = st.model.tasks, meta = st.raw.meta || {};
  if (!T.length) { view.innerHTML = emptyState(); bindEmpty(view, ctx); return; }

  const leaves = T.filter(t => t.isLeaf && t.level >= 3);
  const active = leaves.filter(t => isActiveWindow(t));
  const counts = {}; active.forEach(t => counts[t.eff || ""] = (counts[t.eff || ""] || 0) + 1);
  const setCount = active.filter(t => t.eff).length;
  const healthPct = setCount ? Math.round(((counts.on || 0) + (counts.done || 0)) / setCount * 100) : null;
  const now = leaves.filter(t => t.startsIn <= 0 && t.finishesIn >= 0 && (t.actual ?? 0) < 100);
  const soon = leaves.filter(t => t.startsIn > 0 && t.startsIn <= 7);
  const behind = T.filter(t => t.level >= 3 && t.tr.status === "behind");
  const risk = T.filter(t => t.level >= 3 && t.tr.status === "risk");
  const wps = T.filter(t => t.tr.workplan.has === "yes");
  const wpOk = wps.filter(t => t.tr.workplan.status === "approved").length;
  const vars = T.filter(t => t.tr.scope.type === "variation");
  const varOpen = vars.filter(t => t.tr.scope.response !== "approved" && t.tr.scope.response !== "rejected");
  const varValue = vars.reduce((a, t) => a + (+t.tr.scope.value || 0), 0);
  const t0 = today();
  const daily = Array.from({ length: 21 }, (_, i) => { const d = new Date(+t0 + i * DAY); return leaves.filter(t => t.s <= d && t.f >= d).length; });
  const starts = Array.from({ length: 14 }, (_, i) => { const d = +t0 + i * DAY; return leaves.filter(t => +t.s === d).length; });

  const attn = T.filter(t => t.flags.length).map(t => ({ t, sev: Math.max(...t.flags.map(f => f.sev)) }))
    .sort((a, b) => b.sev - a.sev || (a.t.startsIn ?? 999) - (b.t.startsIn ?? 999)).slice(0, 40);
  const urgent = T.filter(t => t.flags.some(f => f.sev >= 3)).length;

  const areas = TAGS.filter(tg => !["untagged"].includes(tg.key)).map(tg => {
    const xs = leaves.filter(t => t.tags.includes(tg.key) && t.expected != null && t.startsIn <= 0);
    if (!xs.length) return null;
    const pl = xs.reduce((a, t) => a + t.expected, 0) / xs.length, ac = xs.reduce((a, t) => a + (t.actual || 0), 0) / xs.length;
    return { tg, pl, ac, n: xs.length };
  }).filter(Boolean);

  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const kpi = (id, label, ic, val, foot, color, extra = "", suf = "") => `
    <button class="panel kpi spot" data-kpi="${id}" data-tilt="10" style="--kc:${color}">
      <span class="k-label">${icon(ic)}${label}</span>${extra}
      <span class="k-val"><span data-count="${val}">0</span>${suf ? `<small>${suf}</small>` : ""}</span>
      <span class="k-foot">${foot}</span>
    </button>`;

  view.innerHTML = `<div class="view-inner ${fresh ? "enter" : ""}">
    <section class="hero">
      <div class="panel reactor spot">
        <h2>Live health</h2>
        <div class="sub">${active.length} tasks running or starting in the next ${APP.lookaheadDays} days</div>
        <div class="dial">${dialSVG(counts, Math.max(1, active.length))}
          <div class="dial-center"><div class="big">${healthPct == null ? "--" : `<span data-count="${healthPct}">0</span><small>%</small>`}</div><div class="lbl">${healthPct == null ? "Set statuses to see health" : "on track or complete"}</div></div>
        </div>
        <div class="legend">${SEGS.map(s => `<button data-status="${s.key || "unset"}"><span class="sw" style="background:${STATUS_VAR[s.key]}"></span>${s.label} <b class="num">${counts[s.key] || 0}</b></button>`).join("")}</div>
      </div>
      <div class="hero-right">
        <div class="panel greet">
          <div>
            <h2>${greet}. ${urgent ? `${urgent} task${urgent > 1 ? "s" : ""} need${urgent > 1 ? "" : "s"} attention.` : "Nothing urgent right now."}</h2>
            <p>${now.length} tasks are running, ${soon.length} start in the next 7 days. Schedule status date ${meta.statusDate ? fmtDate(meta.statusDate, true) : "not set"}.</p>
          </div>
          <div class="actions"><button class="btn primary" data-go="schedule">${icon("schedule")} Open schedule</button><button class="btn" data-go="import">${icon("upload")} Load update</button></div>
        </div>
        <div class="kpis">
          ${kpi("now", "Running now", "pulse", now.length, "Leaf tasks between start and finish", "var(--accent)", spark(daily))}
          ${kpi("soon", "Starting in 7 days", "calendar", soon.length, "Check workplans and drawings", "var(--done)", spark(starts))}
          ${kpi("behind", "Behind", "alert", behind.length, `${risk.length} more at risk`, "var(--behind)")}
          ${kpi("risk", "At risk", "flag", risk.length, "Marked by you", "var(--risk)")}
          ${kpi("wp", "Workplans approved", "doc", wpOk, wps.length ? `of ${wps.length} with a workplan` : "No workplans logged yet", "var(--on)", "", wps.length ? `/ ${wps.length}` : "")}
          ${kpi("var", "Open variations", "money", varOpen.length, varValue ? `$${Math.round(varValue).toLocaleString("en-AU")} costed in total` : `${vars.length} variations logged`, "var(--hazard)")}
        </div>
      </div>
    </section>

    <section class="cols">
      <div class="panel">
        <div class="panel-head"><h2>Needs attention</h2><span class="sub">${attn.length} item${attn.length === 1 ? "" : "s"}</span>
          <div class="right"><button class="btn sm ghost" data-kpi="attn">See in schedule</button></div></div>
        <div class="panel-body"><div class="attn-list" data-keep-scroll="attn">
          ${attn.length ? attn.map(({ t, sev }) => `<div class="attn s${sev}" data-id="${t.id}" tabindex="0">
            <span class="bar"></span>
            <div><div class="t">${esc(t.name)}</div><div class="p">${esc(t.path.slice(-2).join(" › "))}</div><div class="why">${flagChips(t, 4)}</div></div>
            <div class="when">${esc(whenText(t))}</div></div>`).join("")
            : `<div class="empty">${icon("check")}<div>All clear. Nothing flagged against the schedule or your tracking.</div></div>`}
        </div></div>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>Progress by area</h2><span class="sub">Actual % against where started tasks should be by today</span></div>
        <div class="panel-body">
          <div class="bars">${areas.map(a => `<div class="barrow" data-tagf="${a.tg.key}" title="${a.n} tasks">
            <span class="lbl">${esc(a.tg.label)}</span>
            <span class="track"><span class="pl" data-w="${a.pl.toFixed(1)}"></span><span class="ac" data-w="${a.ac.toFixed(1)}"></span></span>
            <span class="v num">${a.ac.toFixed(0)} / ${a.pl.toFixed(0)}%</span></div>`).join("") || `<div class="empty">No started tasks yet.</div>`}</div>
          <div class="bars-key"><span><i style="background:var(--accent)"></i>Actual %</span><span><i style="background:repeating-linear-gradient(-45deg,var(--ink3) 0 3px,transparent 3px 6px)"></i>Expected by today</span></div>
        </div>
      </div>
    </section>

    <section class="panel">
      <div class="panel-head"><h2>Board</h2><span class="sub">Tasks running or starting in the next ${APP.lookaheadDays} days. Drag to change status.</span>
        <div class="right"><button class="btn sm" data-go="board">Open full board</button></div></div>
      <div class="panel-body">${boardHTML(boardTasks(ctx, "window", false), { cap: 6 })}</div>
    </section>
  </div>`;

  // bindings
  countUp(view); bindTilt(view); bindSpot(view); bindBoard(view, ctx);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    $$(".seg", view).forEach(s => s.setAttribute("stroke-dasharray", s.dataset.dash));
    $$(".barrow [data-w]", view).forEach(b => b.style.width = b.dataset.w + "%");
  }));
  $$("[data-go]", view).forEach(b => b.addEventListener("click", () => ctx.go(b.dataset.go)));
  const toSched = f => ctx.go("schedule", { filters: { tags: new Set(), q: "", status: "", show: "", ...f } });
  $$("[data-status]", view).forEach(b => { if (b.closest(".board")) return; b.addEventListener("click", () => toSched({ status: b.dataset.status })); });
  $$("[data-kpi]", view).forEach(b => b.addEventListener("click", () => {
    const k = b.dataset.kpi;
    if (k === "behind") toSched({ status: "behind" }); else if (k === "risk") toSched({ status: "risk" });
    else if (k === "attn") toSched({ show: "attention" }); else if (k === "wp") toSched({ show: "workplan" }); else if (k === "var") toSched({ show: "variation" });
    else ctx.go("board");
  }));
  $$("[data-tagf]", view).forEach(b => b.addEventListener("click", () => toSched({ tags: new Set([b.dataset.tagf]) })));
  $$(".attn", view).forEach(a => { a.addEventListener("click", () => ctx.openTask(+a.dataset.id)); a.addEventListener("keydown", e => e.key === "Enter" && ctx.openTask(+a.dataset.id)); });
}

function emptyState() {
  return `<div class="view-inner enter">
    <div class="panel banner"><span class="stripe"></span><div><h3>No schedule loaded yet</h3><p>Load the 2 Oct 2026 schedule from your PDFs (144 tasks), or import a fresh export.</p></div>
      <button class="btn primary" id="loadSeed">${icon("db")} Load 2 Oct schedule</button><button class="btn" data-go="import">${icon("upload")} Import a file</button></div>
  </div>`;
}
function bindEmpty(view, ctx) {
  $$("[data-go]", view).forEach(b => b.addEventListener("click", () => ctx.go(b.dataset.go)));
  $("#loadSeed", view)?.addEventListener("click", async e => {
    const b = e.currentTarget; b.disabled = true; b.textContent = "Loading";
    try {
      const seed = await (await fetch("data/seed.json")).json();
      await ctx.store.importTasks(seed.tasks, { statusDate: seed.statusDate, source: seed.source });
      toast(`Loaded ${seed.tasks.length} tasks`);
    } catch (ex) { toast("Load failed: " + ex.message, "err"); b.disabled = false; b.textContent = "Load 2 Oct schedule"; }
  });
}
