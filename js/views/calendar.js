// Calendar: year of months, then a month grid, then everything running on the day you pick.
import { parseISO, toISO, today, DAY, fmtDate, fmtShort, relDays, daysBetween, statusMeta, resTypes, resTotals, resSum, resText } from "../model.js";
import { esc, icon, $, $$, bindTilt, bindSpot, segThumbs, reveal, countUp } from "../ui.js";
import { STATUS_VAR, tagChips, bindTagChips, tagCounts } from "./shared.js";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const UPCOMING = 14;

const isDone = t => t.tr.status === "done" || t.actual === 100;
const isLate = (t, now) => !isDone(t) && t.f && t.f < now;
const isBehind = (t, now) => isLate(t, now) || t.tr.status === "behind" || t.flags.some(f => f.kind === "lag" && f.sev >= 3);
const runs = (t, d) => t.s && t.f && t.s <= d && t.f >= d;
const mondayIndex = d => (d.getDay() + 6) % 7;

function pools(ctx) {
  const st = ctx.state, tags = st.filters.tags;
  const tagged = st.model.tasks.filter(t => t.level >= 3 && t.s && t.f && (!tags.size || t.tags.some(k => tags.has(k))));
  const list = tagged.filter(t => st.cal.scope === "packages" ? !t.isLeaf : t.isLeaf);
  return { list, tagged };
}

function summary(list, now) {
  const end = new Date(+now + UPCOMING * DAY);
  return {
    delayed: list.filter(t => isLate(t, now)).sort((a, b) => a.f - b.f),
    ongoing: list.filter(t => runs(t, now) && !isDone(t)).sort((a, b) => a.f - b.f),
    upcoming: list.filter(t => t.s > now && t.s <= end).sort((a, b) => a.s - b.s)
  };
}

// ---------- pieces ----------
function taskRow(t, now, extra = "") {
  const pct = t.actual ?? 0, res = resText(t.res);
  const chips = [
    isLate(t, now) ? `<span class="chip sev3">Finish passed ${relDays(t.finishesIn)}</span>` : "",
    !isLate(t, now) && isBehind(t, now) ? `<span class="chip sev3">Behind</span>` : "",
    t.tr.status === "risk" ? `<span class="chip sev2">At risk</span>` : "",
    isDone(t) ? `<span class="chip sev1">Complete</span>` : "",
    extra
  ].join("");
  return `<button class="crow" data-id="${t.id}" style="--c:${STATUS_VAR[t.eff || ""]}">
    <span class="cbar"></span>
    <span class="cmain"><span class="ct">${esc(t.name)}</span><span class="cp">${esc(t.path.slice(-2).join(" › "))}</span>
      <span class="cmeta"><span class="num">${fmtShort(t.start)} to ${fmtShort(t.finish)}</span>${chips}</span>
      ${res ? `<span class="cres">${icon("people")}${esc(res)}</span>` : ""}</span>
    <span class="cpct"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15" fill="none" stroke="var(--line)" stroke-width="3.5"/><circle cx="18" cy="18" r="15" fill="none" stroke="var(--c)" stroke-width="3.5" stroke-linecap="round" pathLength="100" stroke-dasharray="${pct} 100" transform="rotate(-90 18 18)"/></svg><b class="num">${pct}</b></span>
  </button>`;
}
const group = (title, cls, items, now, extra) => items.length ? `<div class="cgroup ${cls}"><h4><i></i>${title}<span class="num">${items.length}</span></h4>${items.map(t => taskRow(t, now, extra?.(t))).join("")}</div>` : "";

function resStrip(tot) {
  const types = resTypes().filter(r => tot[r.key] > 0); if (!types.length) return "";
  const max = Math.max(...types.map(r => tot[r.key]));
  return `<div class="resbox"><div class="reshead"><span>${icon("people")}<b class="num">${resSum(tot, "people")}</b> people</span><span>${icon("plant")}<b class="num">${resSum(tot, "plant")}</b> plant</span></div>
    ${types.map(r => `<div class="resline ${r.kind}"><span>${esc(r.label)}</span><span class="track"><i style="width:${(tot[r.key] / max * 100).toFixed(0)}%"></i></span><b class="num">${tot[r.key]}</b></div>`).join("")}</div>`;
}

function panelHTML(ctx, P, now) {
  const cal = ctx.state.cal, sum = summary(P.list, now);
  if (cal.list !== "day") {
    const map = { delayed: ["Delayed", "Finish date has passed and the task is not complete", sum.delayed], ongoing: ["Ongoing now", "Between start and finish today", sum.ongoing], upcoming: ["Upcoming", `Starting in the next ${UPCOMING} days`, sum.upcoming] };
    const [title, sub, items] = map[cal.list];
    return `<div class="dayhead"><div><h3>${title}</h3><p>${sub}</p></div><span class="big num">${items.length}</span></div>
      <div class="daylist" data-keep-scroll="daylist">${items.map(t => taskRow(t, now, cal.list === "upcoming" ? `<span class="chip">Starts ${relDays(t.startsIn)}</span>` : "")).join("") || `<div class="empty">Nothing here.</div>`}</div>`;
  }
  const d = parseISO(cal.day), off = daysBetween(now, d);
  const run = P.list.filter(t => runs(t, d));
  const starting = run.filter(t => +t.s === +d), finishing = run.filter(t => +t.f === +d && +t.s !== +d), ongoing = run.filter(t => +t.s !== +d && +t.f !== +d);
  const delayed = d >= now ? sum.delayed : [];
  const next = P.list.filter(t => t.s > d && t.s <= new Date(+d + 7 * DAY)).sort((a, b) => a.s - b.s);
  const tot = resTotals(P.tagged.filter(t => runs(t, d)));
  const any = run.length + delayed.length + next.length;
  return `<div class="dayhead"><div><h3>${fmtDate(d, true)}</h3><p>${off === 0 ? "Today" : relDays(off)} · ${run.length} running</p></div><span class="big num">${d.getDate()}</span></div>
    <div class="daylist" data-keep-scroll="daylist">
      ${resStrip(tot)}
      ${group("Delayed", "g-late", delayed, now)}
      ${group("Starting this day", "g-start", starting, now)}
      ${group("Finishing this day", "g-fin", finishing, now)}
      ${group("Ongoing", "g-on", ongoing, now)}
      ${group("Upcoming, next 7 days", "g-up", next, now, t => `<span class="chip">Starts ${fmtShort(t.start)}</span>`)}
      ${any ? "" : `<div class="empty">Nothing scheduled around this day.</div>`}
    </div>`;
}

function monthHTML(ctx, P, now) {
  const { y, m, day } = ctx.state.cal;
  const first = new Date(y, m, 1), lead = mondayIndex(first), days = new Date(y, m + 1, 0).getDate();
  const cells = [], info = [];
  for (let i = 1; i <= days; i++) {
    const d = new Date(y, m, i), run = P.list.filter(t => runs(t, d));
    const tot = resTotals(P.tagged.filter(t => runs(t, d)));
    info.push({ d, run, people: resSum(tot, "people"), plant: resSum(tot, "plant") });
  }
  const max = Math.max(1, ...info.map(x => x.run.length)), maxP = Math.max(1, ...info.map(x => x.people + x.plant));
  for (let i = 0; i < lead; i++) cells.push(`<span class="ccell pad"></span>`);
  info.forEach(({ d, run, people, plant }, i) => {
    const iso = toISO(d), starts = run.filter(t => +t.s === +d), fins = run.filter(t => +t.f === +d && +t.s !== +d);
    const rest = run.filter(t => !starts.includes(t) && !fins.includes(t));
    const bad = d >= now ? run.filter(t => isBehind(t, now)).length : 0;
    const pills = [...starts.map(t => [t, "Starts"]), ...fins.map(t => [t, "Ends"]), ...rest.map(t => [t, ""])];
    const wk = mondayIndex(d) > 4;
    cells.push(`<button class="ccell ${+d === +now ? "today" : ""} ${iso === day && ctx.state.cal.list === "day" ? "sel" : ""} ${wk ? "wk" : ""} ${d < now ? "past" : ""}" data-day="${iso}" style="--heat:${(run.length / max).toFixed(2)};--i:${i}" aria-label="${fmtDate(d, true)}, ${run.length} tasks">
      <span class="chead"><b class="num">${d.getDate()}</b>${run.length ? `<span class="ccount num">${run.length}</span>` : ""}</span>
      <span class="cpills">${pills.slice(0, 3).map(([t, w]) => `<span class="cpill" style="--c:${STATUS_VAR[t.eff || ""]}">${w ? `<em>${w}</em> ` : ""}${esc(t.name)}</span>`).join("")}${pills.length > 3 ? `<span class="cmore">+${pills.length - 3} more</span>` : ""}</span>
      <span class="cfoot">${starts.length ? `<i class="d-start" title="${starts.length} starting"></i>` : ""}${fins.length ? `<i class="d-fin" title="${fins.length} finishing"></i>` : ""}${bad ? `<i class="d-bad" title="${bad} behind or delayed"></i>` : ""}
        ${people + plant ? `<span class="cresn num" title="${people} people, ${plant} plant">${icon("people")}${people}${plant ? ` · ${plant}` : ""}</span>` : ""}</span>
    </button>`);
  });
  const anyRes = info.some(x => x.people + x.plant);
  const hist = anyRes ? `<div class="reshist"><div class="rh-title">${icon("people")} People and plant needed each day <span class="faint">Peak ${Math.max(...info.map(x => x.people))} people</span></div>
    <div class="rh-bars">${info.map(x => `<button data-day="${toISO(x.d)}" class="${+x.d === +now ? "today" : ""}" title="${fmtShort(x.d)}: ${x.people} people, ${x.plant} plant"><i class="p" style="height:${(x.people / maxP * 100).toFixed(0)}%"></i><i class="q" style="height:${(x.plant / maxP * 100).toFixed(0)}%"></i><span>${x.d.getDate()}</span></button>`).join("")}</div></div>`
    : `<p class="note" style="margin:14px 4px 0">Add resources to tasks (open a task, Resources section) to see daily people and plant totals here.</p>`;
  return `<div class="calwrap">
    <div class="panel calgrid-panel"><div class="cwd">${WD.map(w => `<span>${w}</span>`).join("")}</div><div class="cgrid">${cells.join("")}</div>${hist}</div>
    <aside class="panel daypanel aur" id="dayPanel">${panelHTML(ctx, P, now)}</aside>
  </div>`;
}

function yearHTML(ctx, P, now, fresh) {
  const { y } = ctx.state.cal;
  const counts = new Map(); let max = 1;
  for (let d = new Date(y, 0, 1); d.getFullYear() === y; d = new Date(y, d.getMonth(), d.getDate() + 1)) { const n = P.list.filter(t => runs(t, d)).length; counts.set(+d, n); if (n > max) max = n; }
  return `<div class="ygrid">${MONTHS.map((name, m) => {
    const a = new Date(y, m, 1), b = new Date(y, m + 1, 0);
    const touch = P.list.filter(t => t.s <= b && t.f >= a), starting = touch.filter(t => t.s >= a), late = P.list.filter(t => isLate(t, now) && t.f >= a && t.f <= b);
    const tot = resTotals(P.tagged.filter(t => t.s <= b && t.f >= a));
    let sq = ""; for (let i = 0; i < mondayIndex(a); i++) sq += "<i class='pad'></i>";
    for (let i = 1; i <= b.getDate(); i++) { const d = new Date(y, m, i), n = counts.get(+d) || 0; sq += `<i class="${+d === +now ? "today" : ""}" style="--heat:${(n / max).toFixed(2)}" title="${i} ${name.slice(0, 3)}: ${n} tasks"></i>`; }
    const cur = now.getFullYear() === y && now.getMonth() === m;
    return `<button class="panel mtile spot ${fresh ? "rv" : ""} ${cur ? "cur" : ""} ${touch.length ? "" : "quiet"}" data-month="${m}" data-tilt="7">
      <span class="mt-head"><b>${name}</b>${cur ? `<span class="chip sev1">This month</span>` : ""}</span>
      <span class="mt-num"><span class="num">${touch.length}</span><small>tasks</small></span>
      <span class="mt-heat">${sq}</span>
      <span class="mt-foot">${starting.length ? `<span><i class="d-start"></i>${starting.length} starting</span>` : ""}${late.length ? `<span class="bad"><i class="d-bad"></i>${late.length} delayed</span>` : ""}${Object.keys(tot).length ? `<span>${icon("people")}resources set</span>` : ""}</span>
    </button>`;
  }).join("")}</div>`;
}

// ---------- view ----------
export function renderCalendar(view, ctx, { fresh }) {
  const st = ctx.state, cal = st.cal, now = today();
  if (!st.model.tasks.length) { view.innerHTML = `<div class="view-inner"><div class="panel empty">No schedule loaded yet. Go to Import to load one.</div></div>`; return; }
  if (cal.y == null) { cal.y = now.getFullYear(); cal.m = now.getMonth(); cal.day = toISO(now); }
  const P = pools(ctx), sum = summary(P.list, now);
  const title = cal.view === "year" ? String(cal.y) : `${MONTHS[cal.m]} ${cal.y}`;
  const scard = (k, label, ic, n, foot, color) => `<button class="panel scard spot ${cal.view === "month" && cal.list === k ? "on" : ""}" data-list="${k}" style="--kc:${color}">
    <span class="k-label">${icon(ic)}${label}</span><span class="k-val num" ${fresh ? `data-count="${n}">0` : `>${n}`}</span><span class="k-foot">${foot}</span></button>`;

  view.innerHTML = `<div class="view-inner cal ${fresh ? "enter" : ""}">
    <div class="calbar">
      <div class="caltitle"><button class="icon-btn" id="calPrev" aria-label="Previous">${icon("left")}</button>
        <h2>${cal.view === "month" ? `<button class="crumb" id="toYear">${cal.y}</button><span class="sep">/</span>` : ""}<span>${cal.view === "month" ? MONTHS[cal.m] : title}</span></h2>
        <button class="icon-btn" id="calNext" aria-label="Next">${icon("right")}</button>
        <button class="btn sm" id="calToday">Today</button></div>
      <span class="grow"></span>
      <div class="seg-ctl" id="calScope">${[["tasks", "Tasks"], ["packages", "Packages"]].map(([k, l]) => `<button data-s="${k}" class="${cal.scope === k ? "on" : ""}">${l}</button>`).join("")}</div>
      <div class="seg-ctl" id="calView">${[["year", "Year"], ["month", "Month"]].map(([k, l]) => `<button data-v="${k}" class="${cal.view === k ? "on" : ""}">${l}</button>`).join("")}</div>
    </div>
    <div class="scards">
      ${scard("delayed", "Delayed", "alert", sum.delayed.length, "Finish date passed, not complete", "var(--behind)")}
      ${scard("ongoing", "Ongoing now", "pulse", sum.ongoing.length, "Running today", "var(--accent)")}
      ${scard("upcoming", "Upcoming", "calendar", sum.upcoming.length, `Starting in the next ${UPCOMING} days`, "var(--done)")}
    </div>
    ${tagChips(st, tagCounts(st.model.tasks.filter(t => t.level >= 3)))}
    ${cal.view === "year" ? yearHTML(ctx, P, now, fresh) : monthHTML(ctx, P, now)}
  </div>`;

  bindTagChips(view, ctx); bindSpot(view); bindTilt(view); segThumbs(view); reveal(view); if (fresh) countUp(view);
  const set = (patch, anim) => { Object.assign(cal, patch); if (anim && document.startViewTransition && !matchMedia("(prefers-reduced-motion: reduce)").matches) document.startViewTransition(() => renderCalendar(view, ctx, { fresh: true })); else ctx.rerender(); };
  const step = n => { if (cal.view === "year") set({ y: cal.y + n }, true); else { const d = new Date(cal.y, cal.m + n, 1); set({ y: d.getFullYear(), m: d.getMonth() }, true); } };
  $("#calPrev", view).addEventListener("click", () => step(-1));
  $("#calNext", view).addEventListener("click", () => step(1));
  $("#calToday", view).addEventListener("click", () => set({ view: "month", y: now.getFullYear(), m: now.getMonth(), day: toISO(now), list: "day" }, true));
  $("#toYear", view)?.addEventListener("click", () => set({ view: "year" }, true));
  $$("#calView button", view).forEach(b => b.addEventListener("click", () => set({ view: b.dataset.v }, true)));
  $$("#calScope button", view).forEach(b => b.addEventListener("click", () => set({ scope: b.dataset.s })));
  $$("[data-month]", view).forEach(b => b.addEventListener("click", () => {
    const m = +b.dataset.month, same = now.getFullYear() === cal.y && now.getMonth() === m;
    set({ view: "month", m, day: toISO(same ? now : new Date(cal.y, m, 1)), list: "day" }, true);
  }));
  $$("[data-list]", view).forEach(b => b.addEventListener("click", () => {
    if (cal.view === "month" && cal.list === b.dataset.list) set({ list: "day" });
    else set({ view: "month", list: b.dataset.list, ...(cal.view === "year" ? { y: now.getFullYear(), m: now.getMonth() } : {}) }, cal.view === "year");
  }));
  $$("[data-day]", view).forEach(b => b.addEventListener("click", () => {
    cal.day = b.dataset.day; cal.list = "day";
    $$(".ccell.sel", view).forEach(c => c.classList.remove("sel")); $(`.ccell[data-day="${cal.day}"]`, view)?.classList.add("sel");
    $$(".scard.on", view).forEach(c => c.classList.remove("on"));
    const p = $("#dayPanel", view); p.innerHTML = panelHTML(ctx, P, now); bindRows(p, ctx);
    p.animate([{ opacity: .3, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], { duration: 380, easing: "cubic-bezier(.22,1,.36,1)" });
    if (matchMedia("(max-width: 1180px)").matches) p.scrollIntoView({ behavior: "smooth", block: "start" });
  }));
  bindRows(view, ctx);
}
function bindRows(root, ctx) { $$(".crow", root).forEach(r => r.addEventListener("click", () => ctx.openTask(+r.dataset.id))); }
