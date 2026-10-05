// G: the schedule assistant in the corner.
// It answers from the tracker itself (free, instant, nothing leaves the site).
// If you add your own Gemini API key in its settings, anything it can't answer is passed to that AI.
import { APP, TAGS } from "./config.js";
import { today, parseISO, toISO, DAY, fmtDate, fmtShort, relDays, daysBetween, statusMeta, resTypes, resTotals, resSum, resText } from "./model.js";
import { esc, icon, $, $$ } from "./ui.js";

let ctx = null, el = null, log = [], busy = false;
const KEY = "p269-g-key", MODEL = "p269-g-model", DEFAULT_MODEL = "gemini-flash-latest";
const ls = { get: k => { try { return localStorage.getItem(k) || ""; } catch { return ""; } }, set: (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch {} } };

// ---------- reading the question ----------
const MON = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const DOW = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
function parseWhen(q, now) {
  const one = (d, label) => ({ from: d, to: d, label: label || fmtDate(d, true), single: true });
  let m;
  if (/\btoday\b|\bnow\b|right now/.test(q)) return one(now, "today");
  if (/\btomorrow\b/.test(q)) return one(addDays(now, 1), "tomorrow");
  if (/\byesterday\b/.test(q)) return one(addDays(now, -1), "yesterday");
  const mon = addDays(now, -((now.getDay() + 6) % 7));
  if (/\bthis week\b/.test(q)) return { from: mon, to: addDays(mon, 6), label: "this week" };
  if (/\bnext week\b/.test(q)) return { from: addDays(mon, 7), to: addDays(mon, 13), label: "next week" };
  if (/\bthis month\b/.test(q)) return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: new Date(now.getFullYear(), now.getMonth() + 1, 0), label: "this month" };
  if (/\bnext month\b/.test(q)) return { from: new Date(now.getFullYear(), now.getMonth() + 1, 1), to: new Date(now.getFullYear(), now.getMonth() + 2, 0), label: "next month" };
  if ((m = q.match(/\bnext (\d{1,3}) days?\b/))) return { from: now, to: addDays(now, +m[1]), label: `the next ${m[1]} days` };
  if ((m = q.match(/\b(next )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/))) {
    let n = (DOW.indexOf(m[2]) - now.getDay() + 7) % 7; if (m[1] && n === 0) n = 7;
    return one(addDays(now, n));
  }
  const year = (mo, dd) => { let y = now.getFullYear(); const d = new Date(y, mo, dd); return daysBetween(now, d) < -180 ? new Date(y + 1, mo, dd) : d; };
  if ((m = q.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*(?:\s+(\d{2,4}))?/))) { const d = m[3] ? new Date(+m[3] < 100 ? 2000 + +m[3] : +m[3], MON.indexOf(m[2]), +m[1]) : year(MON.indexOf(m[2]), +m[1]); return one(d); }
  if ((m = q.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?\b/))) return one(year(MON.indexOf(m[1]), +m[2]));
  if ((m = q.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/))) { const d = m[3] ? new Date(+m[3] < 100 ? 2000 + +m[3] : +m[3], +m[2] - 1, +m[1]) : year(+m[2] - 1, +m[1]); return one(d); }
  return null;
}
const TAGWORDS = { heaters: /heater/, burners: /burner/, asbestos: /asbestos|\basb\b/, scaffold: /scaffold|shrink ?wrap/, demo: /demolition|demolish|\bdemo\b/, pipe: /pipe/, purple: /purple/, blending: /blend/, bitumen: /bitumen/, boiler: /boiler/, blast: /blast|explosive/, scrap: /scrap/, offsite: /offsite|bridge|kororoit/ };
const tagsIn = q => Object.keys(TAGWORDS).filter(k => TAGWORDS[k].test(q));
const STOP = new Set("the a an of for on in at to is are was what whats which who how many much do does we have has any all show me tell about status task tasks give list with and or it its there this that please can you g hey hi left need needs needed workplan workplans wp resources resource people plant today tomorrow week month next day days scheduled schedule doing going".split(" "));
function findTasks(q) {
  const T = ctx.state.model.tasks.filter(t => t.level >= 2); let m;
  if ((m = q.match(/\b(?:id|task|#)\s*#?(\d{1,4})\b/))) { const t = ctx.state.model.byId.get(+m[1]); if (t) return [t]; }
  const words = q.replace(/[^a-z0-9\- ]/g, " ").split(/\s+/).filter(w => w.length >= 3 && !STOP.has(w));
  if (!words.length) return [];
  const SYN = { tank: "tk", tanks: "tk", heater: "-d-", burner: "-b-" };
  const hit = (n, w) => /^\d+$/.test(w) ? new RegExp(`(^|[^0-9])${w}([^0-9]|$)`).test(n) : n.includes(w) || (SYN[w] ? n.includes(SYN[w]) : false);
  const score = t => { const n = t.name.toLowerCase(); let s = 0; for (const w of words) if (hit(n, w)) s += /\d/.test(w) ? 3 : 1; return s; };
  const need = words.some(w => /\d{3,}/.test(w)) ? 3 : Math.min(2, words.length);
  return T.map(t => [t, score(t)]).filter(x => x[1] >= need).sort((a, b) => b[1] - a[1] || (b[0].children.length ? 1 : 0) - (a[0].children.length ? 1 : 0) || a[0].id - b[0].id).map(x => x[0]);
}

// ---------- building answers ----------
const isDone = t => t.tr.status === "done" || t.actual === 100;
const runs = (t, a, b = a) => t.s && t.f && t.s <= b && t.f >= a;
const tk = (t, note = "") => `<button class="g-task" data-id="${t.id}" style="--c:var(--${{ on: "on", risk: "risk", behind: "behind", done: "done" }[t.eff] || "unset"})"><i></i><span><b>${esc(t.name)}</b><small>${esc(t.path.slice(-1)[0] || "")}${note ? " · " + note : ""}</small></span></button>`;
const list = (items, note, cap = 8) => items.slice(0, cap).map(t => tk(t, note?.(t))).join("") + (items.length > cap ? `<p class="g-more">and ${items.length - cap} more</p>` : "");
const act = (label, attrs) => `<button class="g-act" ${attrs}>${label}</button>`;
const h = (title, n) => `<h5>${title}${n != null ? ` <span>${n}</span>` : ""}</h5>`;
const span = t => `${fmtShort(t.start)} to ${fmtShort(t.finish)}`;
const wpLine = t => { const w = t.wp || t.tr.workplan; return w.has === "yes" ? `${[w.ref, w.title, w.rev].filter(Boolean).join(" · ") || "no number yet"}, ${statusLabel(w.status)}` : w.has === "no" ? "none yet" : w.has === "na" ? "not applicable" : "not answered"; };
const statusLabel = s => ({ notstarted: "not started", drafting: "drafting", internal: "internal review", submitted: "submitted to client", clientreview: "under client review", approved: "approved", rejected: "rejected" }[s] || "status not set");

function pool(q) {
  const tags = tagsIn(q), all = ctx.state.model.tasks.filter(t => t.level >= 3 && t.s && t.f && (!tags.length || t.tags.some(k => tags.includes(k))));
  return { leaves: all.filter(t => t.isLeaf), all, scope: tags.length ? ` for ${tags.map(k => TAGS.find(x => x.key === k).label).join(", ")}` : "" };
}

function answer(raw) {
  const q = raw.toLowerCase().replace(/[’']/g, "").trim(), now = today(), T = ctx.state.model.tasks;
  if (!T.length) return "There's no schedule loaded yet. Go to Import to load one.";
  const when = parseWhen(q, now), P = pool(q), found = findTasks(q);
  const late = P.leaves.filter(t => !isDone(t) && t.f < now).sort((a, b) => a.f - b.f);

  if (/^(hi|hello|hey|help|what can you do)\b/.test(q) || q === "?") return help();

  // workplans
  if (/work ?plans?|\bwps?\b/.test(q)) {
    if (found.length && /\d{3,}/.test(q)) { const t = found[0]; return `<p><b>${esc(t.name)}</b></p><p>Workplan: ${esc(wpLine(t))}${t.wpFrom ? ` (covered by ${esc(t.wpFrom.name)})` : ""}.</p>${t.wpi?.submitBy ? `<p>Needed for a ${fmtShort(t.start)} start: submit by ${fmtShort(t.wpi.submitBy)}, approved by ${fmtShort(t.wpi.approveBy)}.</p>` : ""}${tk(t)}`; }
    const main = P.all.filter(t => !t.wpFrom && t.wpi && (t.children.some(c => c.isLeaf) || t.tr.workplan.has));
    const by = s => main.filter(t => t.wpi.state === s).sort((a, b) => (a.wpi.due ?? a.s) - (b.wpi.due ?? b.s));
    const note = t => t.wpi.left != null ? (t.wpi.left < 0 ? `${-t.wpi.left} days overdue` : `due ${fmtShort(t.wpi.due)}`) + `, ${wpLine(t)}` : wpLine(t);
    if (/approved/.test(q) && !/not approved|unapproved/.test(q)) { const a = by("approved"); return `${h("Approved workplans" + P.scope, a.length)}${list(a, wpLine, 12) || "<p>None approved yet.</p>"}${act("Open Workplans", 'data-go="workplans"')}`; }
    const o = by("overdue"), s = by("soon"), n = by("next"), st = by("started"), ap = by("approved");
    return `<p>Workplans${P.scope}: <b>${o.length}</b> overdue, <b>${s.length}</b> due in 7 days, <b>${n.length}</b> due in 8 to 21 days, <b>${st.length}</b> already started without an approved one, <b>${ap.length}</b> approved.</p>
      ${o.length ? h("Overdue", o.length) + list(o, note, 6) : ""}${s.length ? h("Due in 7 days", s.length) + list(s, note, 6) : ""}${n.length ? h("Due in 8 to 21 days", n.length) + list(n, note, 5) : ""}
      ${act("Open Workplans", 'data-go="workplans"')}`;
  }

  // resources
  if (/resources?|people|crew|man ?power|labou?rers?|operators?|oxy|plant|excavators?|\bewps?\b|cranes?|telehandlers?|trucks?|how many (men|guys|workers)/.test(q)) {
    const w = when || { from: now, to: now, label: "today", single: true };
    const any = T.some(t => t.resCounts);
    if (!any) return "No resources have been entered yet. Open a task and fill in the Resources section, and I'll add them up by day.";
    if (w.single) {
      const on = P.all.filter(t => t.resCounts && runs(t, w.from)), tot = resTotals(on);
      if (!Object.keys(tot).length) return `No resources are entered for tasks running ${w.label}${P.scope}.`;
      return `<p>Needed ${w.label}${P.scope}: <b>${resSum(tot, "people")}</b> people and <b>${resSum(tot, "plant")}</b> plant.</p><p>${esc(resText(tot))}.</p>${h("From these tasks", on.length)}${list(on, t => resText(t.res), 8)}${act("Open this day", `data-day="${toISO(w.from)}"`)}`;
    }
    let rows = "", peak = 0, peakD = null;
    for (let d = new Date(w.from); d <= w.to; d = addDays(d, 1)) { const tot = resTotals(P.all.filter(t => t.resCounts && runs(t, d))), p = resSum(tot, "people"), pl = resSum(tot, "plant"); if (p > peak) { peak = p; peakD = new Date(d); } if (daysBetween(w.from, w.to) <= 14) rows += `<tr><td>${fmtDate(d, true)}</td><td>${p}</td><td>${pl}</td></tr>`; }
    return `<p>Resources for ${w.label}${P.scope}. Peak is <b>${peak}</b> people${peakD ? ` on ${fmtDate(peakD, true)}` : ""}.</p>${rows ? `<table class="g-tbl"><tr><th>Day</th><th>People</th><th>Plant</th></tr>${rows}</table>` : ""}${act("Open Calendar", 'data-go="calendar"')}`;
  }

  // delayed
  if (/delay|\blate\b|overdue|behind|slipp/.test(q)) {
    const behind = P.all.filter(t => t.tr.status === "behind" && !late.includes(t));
    if (!late.length && !behind.length) return `Nothing is delayed${P.scope}. No finish dates have passed with work still open.`;
    return `<p><b>${late.length}</b> task${late.length === 1 ? " has" : "s have"} passed the finish date without being complete${P.scope}${behind.length ? `, and ${behind.length} more are marked behind` : ""}.</p>${list(late, t => `finished ${relDays(t.finishesIn)}, ${t.actual ?? 0}% done`, 10)}${behind.length ? h("Marked behind", behind.length) + list(behind, span, 5) : ""}`;
  }

  // variations
  if (/variations?|\bvar\b|notice of delay|\bnod\b|costing/.test(q)) {
    const v = T.filter(t => t.tr.scope.type === "variation");
    if (!v.length) return "No variations have been logged yet. Set Scope to Variation on a task to start tracking one.";
    const val = v.reduce((a, t) => a + (+t.tr.scope.value || 0), 0), open = v.filter(t => !["approved", "rejected"].includes(t.tr.scope.response));
    return `<p><b>${v.length}</b> variation${v.length === 1 ? "" : "s"} logged, <b>${open.length}</b> still open${val ? `, $${Math.round(val).toLocaleString("en-AU")} costed in total` : ""}.</p>${list(v, t => { const s = t.tr.scope; return s.response === "approved" ? "approved" : s.response === "rejected" ? "rejected" : s.costingSubmitted === "yes" ? "costing with client" : s.vn === "yes" ? "notice sent, costing not submitted" : "notice not sent"; }, 10)}`;
  }

  // needs attention
  if (/attention|issues?|problems?|flags?|urgent|worr|at risk|risks?\b/.test(q)) {
    const a = T.filter(t => t.flags.length && (!tagsIn(q).length || t.tags.some(k => tagsIn(q).includes(k)))).sort((x, y) => Math.max(...y.flags.map(f => f.sev)) - Math.max(...x.flags.map(f => f.sev)));
    return a.length ? `<p><b>${a.length}</b> task${a.length === 1 ? "" : "s"} need attention${P.scope}.</p>${list(a, t => t.flags[0].text, 10)}${act("See all on Command", 'data-go="command"')}` : `Nothing is flagged${P.scope}.`;
  }

  // overall progress
  if (/summary|overview|brief|how are we|hows it going|progress|how many.*(done|complete|left|remaining|finished)|whats left|status of (the )?(project|job|schedule)/.test(q) && !(found.length && /\d{3,}/.test(q))) return brief(P, now, late);

  // upcoming
  if (/upcoming|coming up|starting|starts?\b|look ?ahead|kick ?off/.test(q)) {
    const w = when || { from: addDays(now, 1), to: addDays(now, 7), label: "the next 7 days" };
    const s = P.leaves.filter(t => t.s >= w.from && t.s <= w.to).sort((a, b) => a.s - b.s);
    return s.length ? `<p><b>${s.length}</b> task${s.length === 1 ? " starts" : "s start"} ${w.label}${P.scope}.</p>${list(s, t => `starts ${fmtDate(t.s, true)}, WP ${wpLine(t)}`, 12)}` : `Nothing starts ${w.label}${P.scope}.`;
  }
  // finishing
  if (/finish|finishing|ending|\bends?\b|wrap(ping)? up|due to (finish|complete)/.test(q)) {
    const w = when || { from: now, to: addDays(now, 7), label: "the next 7 days" };
    const s = P.leaves.filter(t => t.f >= w.from && t.f <= w.to && !isDone(t)).sort((a, b) => a.f - b.f);
    return s.length ? `<p><b>${s.length}</b> task${s.length === 1 ? " is" : "s are"} due to finish ${w.label}${P.scope}.</p>${list(s, t => `finishes ${fmtDate(t.f, true)}, ${t.actual ?? 0}% done`, 12)}` : `Nothing is due to finish ${w.label}${P.scope}.`;
  }

  // a named task
  if (found.length && (!when || /\d{3,}/.test(q))) return found.length > 1 && !/\d{3,}/.test(q) && found[0].name.toLowerCase() !== q ? `<p>I found ${found.length} matches. Pick one:</p>${list(found, span, 8)}` : detail(found[0], found.slice(1));

  // what's on for a day or period
  if (when || /whats on|scheduled|happening|on (site|the go)|running|ongoing|working on|tasks?\b/.test(q)) {
    const w = when || { from: now, to: now, label: "today", single: true };
    if (w.single) {
      const d = w.from, run = P.leaves.filter(t => runs(t, d)), st = run.filter(t => +t.s === +d), fi = run.filter(t => +t.f === +d && +t.s !== +d), on = run.filter(t => !st.includes(t) && !fi.includes(t));
      const tot = resTotals(P.all.filter(t => t.resCounts && runs(t, d)));
      if (!run.length) return `Nothing is scheduled ${w.label}${P.scope}.${act("Open this day", `data-day="${toISO(d)}"`)}`;
      return `<p><b>${run.length}</b> task${run.length === 1 ? " is" : "s are"} running ${w.label === fmtDate(d, true) ? "on " + w.label : w.label}${P.scope}: ${st.length} starting, ${fi.length} finishing, ${on.length} ongoing.${+d >= +now && late.length ? ` ${late.length} more ${late.length === 1 ? "is" : "are"} delayed.` : ""}</p>
        ${Object.keys(tot).length ? `<p>Resources: ${resSum(tot, "people")} people, ${resSum(tot, "plant")} plant (${esc(resText(tot))}).</p>` : ""}
        ${st.length ? h("Starting", st.length) + list(st, t => `to ${fmtShort(t.finish)}`, 6) : ""}${fi.length ? h("Finishing", fi.length) + list(fi, t => `${t.actual ?? 0}% done`, 6) : ""}${on.length ? h("Ongoing", on.length) + list(on, t => `${span(t)}, ${t.actual ?? 0}%`, 6) : ""}
        ${act("Open this day", `data-day="${toISO(d)}"`)}`;
    }
    const run = P.leaves.filter(t => runs(t, w.from, w.to)), st = run.filter(t => t.s >= w.from), fi = run.filter(t => t.f <= w.to);
    return `<p>For ${w.label}${P.scope} (${fmtShort(w.from)} to ${fmtShort(w.to)}): <b>${run.length}</b> tasks running, ${st.length} starting, ${fi.length} finishing.</p>${st.length ? h("Starting", st.length) + list(st.sort((a, b) => a.s - b.s), t => `starts ${fmtDate(t.s, true)}`, 8) : ""}${fi.length ? h("Finishing", fi.length) + list(fi.sort((a, b) => a.f - b.f), t => `finishes ${fmtDate(t.f, true)}`, 6) : ""}${act("Open Calendar", 'data-go="calendar"')}`;
  }
  if (found.length) return found.length > 1 ? `<p>I found ${found.length} matches. Pick one:</p>${list(found, span, 8)}` : detail(found[0], []);
  return null; // not understood: hand over to the AI if a key is set
}

function brief(P, now, late) {
  const L = P.leaves, done = L.filter(isDone).length, run = L.filter(t => runs(t, now) && !isDone(t)), soon = L.filter(t => t.s > now && t.s <= addDays(now, 7));
  const main = P.all.filter(t => !t.wpFrom && t.wpi && (t.children.some(c => c.isLeaf) || t.tr.workplan.has)), wpDue = main.filter(t => ["overdue", "soon"].includes(t.wpi.state));
  const tot = resTotals(P.all.filter(t => t.resCounts && runs(t, now))), urgent = P.all.filter(t => t.flags.some(f => f.sev >= 3)).length;
  return `<p><b>${fmtDate(now, true)}</b>${P.scope}</p>
    <ul class="g-ul"><li><b>${run.length}</b> tasks running today, <b>${soon.length}</b> starting in the next 7 days</li>
    <li><b>${late.length}</b> delayed (finish date passed, not complete)</li>
    <li><b>${done}</b> of ${L.length} tasks marked complete (${L.length ? Math.round(done / L.length * 100) : 0}%)</li>
    <li><b>${wpDue.length}</b> workplans overdue or due this week</li>
    <li><b>${urgent}</b> tasks flagged urgent</li>
    ${Object.keys(tot).length ? `<li>Today needs ${resSum(tot, "people")} people and ${resSum(tot, "plant")} plant</li>` : ""}</ul>
    ${act("Today in Calendar", `data-day="${toISO(now)}"`)}${act("Workplans", 'data-go="workplans"')}`;
}

function detail(t, others) {
  const now = today(), kids = []; const w = x => x.children.forEach(c => { if (c.isLeaf) kids.push(c); else w(c); }); w(t);
  const d = kids.filter(isDone).length, next = kids.filter(k => !isDone(k)).sort((a, b) => a.s - b.s);
  const last = t.tr.comments[t.tr.comments.length - 1], res = resText(t.res) || (kids.length ? resText(resTotals(kids.concat(t))) : "");
  const whenTxt = t.startsIn > 0 ? `starts ${relDays(t.startsIn)}` : t.finishesIn >= 0 ? `running, finishes ${relDays(t.finishesIn)}` : isDone(t) ? "finished" : `finish date passed ${relDays(t.finishesIn)}`;
  return `<p><b>${esc(t.name)}</b><br><small>${esc(t.path.join(" › "))}</small></p>
    <ul class="g-ul"><li>${fmtDate(t.start)} to ${fmtDate(t.finish)} (${whenTxt})</li>
    <li>Status: ${statusMeta(t.eff).label}${t.actual != null ? `, ${Math.round(t.actual)}% actual in MSP` : ""}</li>
    ${kids.length ? `<li>${d} of ${kids.length} sub tasks done</li>` : ""}
    <li>Workplan: ${esc(wpLine(t))}${t.wpFrom ? ` (from ${esc(t.wpFrom.name)})` : ""}</li>
    ${res ? `<li>Resources: ${esc(res)}</li>` : ""}
    ${t.flags.length ? `<li>Needs attention: ${esc(t.flags.map(f => f.text).join("; "))}</li>` : ""}
    ${last ? `<li>Latest comment: "${esc(last.text)}"</li>` : ""}</ul>
    ${tk(t, "open full task")}${next.length ? h("Still to do", next.length) + list(next, span, 6) : ""}${others.length ? h("Other matches", others.length) + list(others, span, 4) : ""}`;
}

const EXAMPLES = ["What's on today?", "What's delayed?", "Workplans due", "Site weather", "Resources tomorrow", "Status of 1202", "What starts this week?", "Give me a summary"];
const help = () => `<p>I'm G. I read your schedule and tracker and can answer things like:</p><ul class="g-ul"><li>What's on today, tomorrow, Thursday or 14 Oct</li><li>What's delayed, what starts or finishes this week</li><li>Which workplans are overdue or due</li><li>People and plant needed on a day or over a week</li><li>The status of any task, for example "1202" or "tank 501"</li><li>Variations, things needing attention, an overall summary</li><li>Live weather and the 7 day forecast for ${SITE.name}, with windy and wet days marked</li></ul>${ls.get(KEY) ? "<p>Your AI key is set, so I can also take general questions, like the time in another city or help wording an email.</p>" : ""}<p>Add an area to narrow it, such as "asbestos tasks tomorrow" or "burner workplans".</p>`;

// ---------- live weather for the site (Open-Meteo, free, no key) ----------
const SITE = APP.site || { name: "Altona North", lat: -37.835, lon: 144.847, tz: "Australia/Melbourne" };
const WX = { 0: "Clear", 1: "Mostly clear", 2: "Partly cloudy", 3: "Overcast", 45: "Fog", 48: "Fog", 51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle", 56: "Freezing drizzle", 57: "Freezing drizzle", 61: "Light rain", 63: "Rain", 65: "Heavy rain", 66: "Freezing rain", 67: "Freezing rain", 71: "Light snow", 73: "Snow", 75: "Heavy snow", 77: "Snow grains", 80: "Light showers", 81: "Showers", 82: "Heavy showers", 85: "Snow showers", 86: "Snow showers", 95: "Thunderstorm", 96: "Thunderstorm with hail", 99: "Thunderstorm with hail" };
const GUST_WARN = 40, RAIN_WARN = 5; // km/h and mm: days at or above these are marked
let wxCache = null;
async function getWeather() {
  if (wxCache && Date.now() - wxCache.at < 20 * 60000) return wxCache.data;
  const u = `https://api.open-meteo.com/v1/forecast?latitude=${SITE.lat}&longitude=${SITE.lon}&current=temperature_2m,apparent_temperature,precipitation,wind_speed_10m,wind_gusts_10m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max&timezone=${encodeURIComponent(SITE.tz)}&forecast_days=7`;
  const r = await fetch(u), j = await r.json().catch(() => ({}));
  if (!r.ok || j.error || !j.daily?.time) throw new Error(j.reason || "The weather service didn't answer. Try again in a minute.");
  const c = j.current || {}, d = j.daily, n = v => v == null ? null : Math.round(v);
  const data = { now: { temp: n(c.temperature_2m), feels: n(c.apparent_temperature), rain: c.precipitation ?? 0, wind: n(c.wind_speed_10m), gust: n(c.wind_gusts_10m), sky: WX[c.weather_code] || "" },
    days: d.time.map((iso, i) => ({ iso, sky: WX[d.weather_code?.[i]] || "", max: n(d.temperature_2m_max?.[i]), min: n(d.temperature_2m_min?.[i]), rain: +(d.precipitation_sum?.[i] ?? 0).toFixed(1), chance: n(d.precipitation_probability_max?.[i]), wind: n(d.wind_speed_10m_max?.[i]), gust: n(d.wind_gusts_10m_max?.[i]) })) };
  wxCache = { at: Date.now(), data }; return data;
}
const wxBad = d => [d.gust >= GUST_WARN ? `gusts ${d.gust} km/h` : "", d.rain >= RAIN_WARN ? `${d.rain} mm rain` : "", /Thunder/.test(d.sky) ? "thunderstorm" : ""].filter(Boolean);
function weatherHTML(w, q) {
  const when = parseWhen(q, today()), one = when?.single ? w.days.find(d => d.iso === toISO(when.from)) : null;
  const bad = w.days.filter(d => wxBad(d).length);
  const row = d => `<tr class="${wxBad(d).length ? "bad" : ""}"><td>${fmtDate(parseISO(d.iso), true).replace(/ \d\d$/, "")}</td><td>${esc(d.sky)}</td><td>${d.min} to ${d.max}°</td><td>${d.rain} mm${d.chance != null ? ` (${d.chance}%)` : ""}</td><td>${d.gust ?? d.wind} km/h</td></tr>`;
  const head = `<tr><th>Day</th><th>Sky</th><th>Temp</th><th>Rain</th><th>Gusts</th></tr>`;
  if (when?.single && !one) return `<p>The forecast only reaches 7 days ahead, so I don't have ${esc(when.label)} yet.</p>`;
  const top = one && +when.from !== +today()
    ? `<p><b>${SITE.name}, ${esc(when.label)}:</b> ${esc(one.sky.toLowerCase())}, ${one.min} to ${one.max}°C, ${one.rain} mm rain${one.chance != null ? ` (${one.chance}% chance)` : ""}, wind up to ${one.wind} km/h with gusts to ${one.gust} km/h.${wxBad(one).length ? ` <b>Watch: ${wxBad(one).join(", ")}.</b>` : ""}</p>`
    : `<p><b>${SITE.name} right now:</b> ${w.now.temp}°C${w.now.feels != null && w.now.feels !== w.now.temp ? ` (feels like ${w.now.feels}°C)` : ""}, ${esc(w.now.sky.toLowerCase())}, ${w.now.rain > 0 ? `raining, ${w.now.rain} mm in the last hour` : "not raining"}, wind ${w.now.wind} km/h with gusts to ${w.now.gust} km/h.</p>`;
  return `${top}${bad.length ? `<p>Days to watch for lifts and work at height: ${bad.map(d => `<b>${fmtDate(parseISO(d.iso), true).replace(/ \d\d$/, "")}</b> (${wxBad(d).join(", ")})`).join("; ")}.</p>` : `<p>No days in the next week reach ${GUST_WARN} km/h gusts or ${RAIN_WARN} mm of rain.</p>`}
    <table class="g-tbl wx">${head}${w.days.map(row).join("")}</table><p class="g-more">Live forecast from Open-Meteo for ${SITE.name}. Marked days have gusts of ${GUST_WARN} km/h or more, ${RAIN_WARN} mm or more of rain, or a thunderstorm. Always go by site wind readings for lifts.</p>`;
}
const weatherText = w => `Live weather for ${SITE.name} (the site). Now: ${w.now.temp}C, feels ${w.now.feels}C, ${w.now.sky}, rain last hour ${w.now.rain} mm, wind ${w.now.wind} km/h, gusts ${w.now.gust} km/h.\nForecast: ${w.days.map(d => `${d.iso}: ${d.sky}, ${d.min}-${d.max}C, rain ${d.rain} mm (${d.chance}% chance), wind ${d.wind} km/h, gusts ${d.gust} km/h`).join("; ")}`;
const WX_RE = /\b(weather|rain(ing|y|s)?|wind(y|s)?|gusts?|temperature|forecast|storms?|thunder|showers?|hot|cold|degrees|umbrella|sunny)\b/;
const ELSEWHERE = /\b(?:in|at|for)\s+(?!altona|melbourne|vic\b|victoria|site|the\b|a\b|next|this|coming|today|tomorrow|\d)([a-z]{3,})/;
function clockText() {
  const d = new Date(), tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown";
  return `Current time on the user's device: ${d.toLocaleString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true })} (time zone ${tz}, UTC offset ${-d.getTimezoneOffset() / 60} hours). The same moment in UTC: ${d.toISOString()}.`;
}

// ---------- optional AI hand over ----------
function contextText() {
  const now = today(), T = ctx.state.model.tasks.filter(t => t.level >= 2);
  const rows = T.map(t => [t.id, "-".repeat(Math.max(0, t.level - 2)) + t.name, t.start || "", t.finish || "", t.actual ?? "", statusMeta(t.tr.status).label, (t.wp || t.tr.workplan).has === "yes" ? `WP ${[(t.wp || t.tr.workplan).ref, statusLabel((t.wp || t.tr.workplan).status)].filter(Boolean).join(" ")}` : (t.wp || t.tr.workplan).has || "", resText(t.res), t.flags.map(f => f.text).join("; "), t.tr.comments.slice(-1).map(c => c.text.slice(0, 120)).join("")].join(" | "));
  return `Today is ${fmtDate(now, true)} (${toISO(now)}). Project: ${APP.title}, ${APP.subtitle}, client ${APP.client}. Schedule status date ${ctx.state.raw.meta?.statusDate || "unknown"}.
Workplan rule: submit ${APP.wpSubmitDays} days before a task starts, approved ${APP.wpApproveDays} days before. A workplan on a main task covers its sub tasks.
Tasks, one per line, as: id | name (leading dashes show depth under the main task) | start | finish | actual % | tracker status | workplan | resources per day | flags | latest comment
${rows.join("\n")}`;
}
async function askAI(question) {
  const key = ls.get(KEY), model = ls.get(MODEL) || DEFAULT_MODEL;
  let wx = ""; try { wx = weatherText(await getWeather()); } catch {}
  const sys = `You are G, a concise, friendly assistant built into a demolition project schedule tracker. The person asking is the project engineer.
You may answer two kinds of question:
1. Questions about the project. Answer these ONLY from the tracker data below. Never invent tasks, dates, numbers or statuses. If the tracker does not hold the answer, say so plainly.
2. General questions (time zones, conversions, definitions, wording an email, calculations, general knowledge). Answer these from your own knowledge, using the clock below for anything about the current time or date.
You have no internet access. Apart from the clock and the site weather given below, you cannot know live information such as news, prices, traffic or weather in other places, so say that instead of guessing.
Start your reply with exactly one tag on its own line: [[tracker]] if the answer comes from the tracker data, [[weather]] if it comes from the site weather below, [[general]] otherwise.
Use Australian date style (5 Oct) and metric units. Keep answers short: a sentence or two, then a short list if needed. When you mention a task from the tracker, put its id in square brackets like [317]. Plain text only, no markdown tables.

${clockText()}
${wx || "Site weather is not available right now."}

${contextText()}`;
  const hist = log.filter(m => m.text).slice(-6).map(m => ({ role: m.who === "me" ? "user" : "model", parts: [{ text: m.text }] }));
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({ system_instruction: { parts: [{ text: sys }] }, contents: [...hist, { role: "user", parts: [{ text: question }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 2000 } })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(r.status === 404 ? `The AI model "${model}" wasn't found. Change the model name in G's settings.` : r.status === 403 || /api key not valid|api_key_invalid/i.test(j.error?.message || "") ? "Google rejected the AI key. Check it in G's settings. It must be a Gemini key from aistudio.google.com." : r.status === 400 ? `Google couldn't process that request: ${j.error?.message || "bad request"}` : r.status === 429 ? "The AI limit for this key has been reached for now. Try again shortly." : (j.error?.message || `AI error ${r.status}`));
  const text = (j.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("").trim();
  if (!text) throw new Error("The AI returned no answer.");
  return text;
}
const SRC = { tracker: "Answered by AI from your tracker data. Check anything important against the schedule.", weather: "Answered by AI from the live site forecast (Open-Meteo).", general: "General answer from the AI, not from your tracker. It has no internet access, so it can be out of date." };
function aiHTML(text) {
  const byId = ctx.state.model.byId, ids = new Set();
  let src = "general"; text = text.replace(/^\s*\[\[(tracker|weather|general)\]\]\s*/i, (m, k) => { src = k.toLowerCase(); return ""; }).replace(/\[\[(tracker|weather|general)\]\]/gi, "");
  let out = esc(text).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\s*\[(\d{1,4})\]/g, (m, id) => { if (src === "tracker" && byId.get(+id)) ids.add(+id); return ""; }).replace(/\n{2,}/g, "</p><p>").replace(/\n/g, "<br>");
  return `<p>${out}</p>${[...ids].slice(0, 8).map(id => tk(byId.get(id))).join("")}<p class="g-more src-${src}"><i></i>${SRC[src]}</p>`;
}

// ---------- the panel ----------
function push(who, html, text) { log.push({ who, html, text }); draw(); }
function draw() {
  const box = $(".g-msgs", el); if (!box) return;
  box.innerHTML = log.map(m => `<div class="g-msg ${m.who}">${m.who === "g" ? `<span class="g-av">G</span>` : ""}<div class="g-bub">${m.html}</div></div>`).join("") + (busy ? `<div class="g-msg g"><span class="g-av">G</span><div class="g-bub g-typing"><i></i><i></i><i></i></div></div>` : "");
  box.scrollTop = box.scrollHeight;
}
async function send(text) {
  text = text.trim(); if (!text || busy) return;
  push("me", esc(text), text);
  const ql = text.toLowerCase(), hasKey = !!ls.get(KEY);
  if (WX_RE.test(ql) && !(ELSEWHERE.test(ql))) {
    busy = true; draw();
    try { const w = await getWeather(); busy = false; return push("g", weatherHTML(w, ql), weatherText(w).slice(0, 700)); }
    catch (e) { busy = false; return push("g", `<p>I couldn't get the weather: ${esc(e.message)}</p>`, ""); }
  }
  const general = /\b(what(s| is) the time|what time|time (is it )?in|time ?zone|convert|how (do|to) (i |you )?(write|say|spell|calculate)|what does .* mean|define|translate|draft|write (me )?an? )\b/.test(ql) || (WX_RE.test(ql) && ELSEWHERE.test(ql));
  let a = null; if (!(general && hasKey)) try { a = answer(text); } catch (e) { console.error(e); }
  if (!a && general && !hasKey && /\bwhat(s| is) the time\b|\bwhat time is it\b/.test(ql) && !/\bin\b/.test(ql)) a = `<p>It's ${new Date().toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })} on ${fmtDate(today(), true)}.</p>`;
  if (a) return push("g", a, a.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 600));
  if (!ls.get(KEY)) return push("g", `<p>I couldn't work that one out from the tracker. Try asking it another way, or pick one of these:</p><div class="g-sugg in">${EXAMPLES.slice(0, 4).map(x => `<button data-q="${esc(x)}">${esc(x)}</button>`).join("")}</div><p class="g-more">For open questions in plain English, add an AI key in ${act("G's settings", "data-settings")}</p>`, "");
  busy = true; draw();
  try { const t = await askAI(text); busy = false; push("g", aiHTML(t), t); }
  catch (e) { busy = false; push("g", `<p>${esc(e.message)}</p>`, ""); }
}
function settingsHTML() {
  const has = !!ls.get(KEY);
  return `<div class="g-set"><h4>AI answers (optional)</h4>
    <p>G already answers schedule and site weather questions on its own, for free. To let it also handle open questions about the project and general questions (time zones, conversions, wording an email), paste a Google Gemini API key here. You can create one at aistudio.google.com under "Get API key".</p>
    <label>API key<input class="input" id="gKey" type="password" placeholder="${has ? "A key is saved. Paste a new one to replace it" : "Paste your key"}" autocomplete="off"></label>
    <label>Model name<input class="input" id="gModel" value="${esc(ls.get(MODEL) || DEFAULT_MODEL)}"></label>
    <p class="g-more">The key is kept in this browser only and is never uploaded to GitHub. When AI is used, your task names, dates, statuses and latest comments are sent to Google to answer that question. Google's terms for the key decide how that data is handled and whether it is free.</p>
    <div class="g-row"><button class="btn sm primary" id="gSave">Save</button>${has ? `<button class="btn sm" id="gForget">Remove key</button>` : ""}<button class="btn sm ghost" id="gBack">Back</button></div></div>`;
}
function openPanel() {
  el.classList.add("open"); if (!log.length) { const now = today(); push("g", `<p>Hi, I'm G. Ask me about the schedule, workplans or resources.</p>${brief(pool(""), now, pool("").leaves.filter(t => !isDone(t) && t.f < now))}`, ""); }
  setTimeout(() => $(".g-in input", el)?.focus(), 250);
}
export function showG(on) { if (el) { el.classList.toggle("hidden", !on); if (!on) { el.classList.remove("open"); log = []; } } }
export function initG(c) {
  ctx = c;
  el = document.createElement("div"); el.className = "gbot hidden";
  el.innerHTML = `<button class="g-fab" aria-label="Open G, the schedule assistant"><span>G</span></button>
    <section class="g-panel" role="dialog" aria-label="G, the schedule assistant">
      <header><span class="g-av big">G</span><div><b>G</b><small>Schedule assistant</small></div><button class="icon-btn" data-settings aria-label="Settings" title="AI settings">${icon("wrench")}</button><button class="icon-btn" data-close aria-label="Close">${icon("close")}</button></header>
      <div class="g-main"><div class="g-msgs" aria-live="polite"></div>
        <div class="g-sugg">${EXAMPLES.map(x => `<button data-q="${esc(x)}">${esc(x)}</button>`).join("")}</div>
        <form class="g-in"><input class="input" placeholder="Ask about tasks, workplans, resources" aria-label="Ask G"><button class="btn primary" aria-label="Send">${icon("arrow")}</button></form></div>
    </section>`;
  document.body.appendChild(el);
  const main = $(".g-main", el), keep = main.innerHTML;
  const restore = () => { main.innerHTML = keep; bindForm(); draw(); };
  const bindForm = () => $(".g-in", el).addEventListener("submit", e => { e.preventDefault(); const i = $("input", e.currentTarget); send(i.value); i.value = ""; });
  bindForm();
  el.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.classList.contains("g-fab")) return el.classList.contains("open") ? el.classList.remove("open") : openPanel();
    if (b.dataset.close != null) return el.classList.remove("open");
    if (b.dataset.settings != null) { main.innerHTML = settingsHTML(); return; }
    if (b.id === "gBack") return restore();
    if (b.id === "gForget") { ls.set(KEY, ""); restore(); return push("g", "<p>AI key removed. I'll answer from the tracker only.</p>", ""); }
    if (b.id === "gSave") { const k = $("#gKey", el).value.trim(), m = $("#gModel", el).value.trim(); if (k) ls.set(KEY, k); ls.set(MODEL, m === DEFAULT_MODEL ? "" : m); restore(); return push("g", `<p>${ls.get(KEY) ? "Saved. I'll use AI for anything I can't answer myself." : "No key saved, so I'll keep answering from the tracker only."}</p>`, ""); }
    if (b.dataset.q) return send(b.dataset.q);
    if (b.dataset.id) return ctx.openTask(+b.dataset.id);
    if (b.dataset.day) { if (matchMedia("(max-width: 820px)").matches) el.classList.remove("open"); return ctx.goDay(b.dataset.day); }
    if (b.dataset.go) { if (matchMedia("(max-width: 820px)").matches) el.classList.remove("open"); return ctx.go(b.dataset.go); }
  });
  el.addEventListener("keydown", e => { if (e.key === "Escape") el.classList.remove("open"); });
}
