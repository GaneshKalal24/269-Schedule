// Pieces shared by several views.
import { TAGS } from "../config.js";
import { tagMeta, statusMeta, hasMissing, fmtShort, relDays } from "../model.js";
import { esc, icon } from "../ui.js";

export const STATUS_VAR = { "": "var(--unset)", on: "var(--on)", risk: "var(--risk)", behind: "var(--behind)", done: "var(--done)" };

export function tagHTML(key, removable = false) {
  const m = tagMeta(key);
  return `<span class="tag" style="--h:${m.hue}">${esc(m.label)}${removable ? `<button data-untag="${key}" aria-label="Remove ${esc(m.label)}">×</button>` : ""}</span>`;
}

export function flagChips(t, max = 3) {
  return t.flags.slice().sort((a, b) => b.sev - a.sev).slice(0, max).map(f => `<span class="chip sev${f.sev}">${esc(f.text)}</span>`).join("");
}

export function wpClass(t) {
  const wp = t.tr.workplan;
  return wp.has === "na" ? "na" : wp.has === "no" ? "bad" : wp.has === "yes" ? (wp.status === "approved" ? "ok" : wp.status === "rejected" ? "bad" : "warn") : "";
}
// mini indicators: WP / DRW / VAR
export function indicators(t) {
  const tr = t.tr, wp = tr.workplan, dr = tr.drawings, sc = tr.scope;
  const wpC = wpClass(t);
  const drC = dr.has === "na" ? "na" : dr.has === "no" ? "bad" : dr.has === "yes" ? (dr.approved === "yes" ? "ok" : "warn") : "";
  const vaC = sc.type === "scope" ? "ok" : sc.type === "variation" ? (sc.response === "approved" ? "ok" : sc.response === "rejected" ? "bad" : "warn") : "";
  const tip = (lbl, c) => ({ ok: `${lbl}: done`, warn: `${lbl}: in progress`, bad: `${lbl}: missing or rejected`, na: `${lbl}: not applicable`, "": `${lbl}: not answered` }[c]);
  return `<span class="inds"><span class="ind ${wpC}" data-wp="${t.id}" role="button" tabindex="0" title="${tip("Workplan", wpC)}. Click to edit.">WP</span><span class="ind ${drC}" title="${tip("Drawings", drC)}">DR</span><span class="ind ${vaC}" title="${sc.type === "variation" ? "Variation" : sc.type === "scope" ? "In scope" : "Scope not answered"}">${sc.type === "variation" ? "VAR" : "SC"}</span></span>`;
}

// which tasks match the current filters (before adding context ancestors)
export function matches(t, f) {
  if (f.tags.size && !t.tags.some(k => f.tags.has(k))) return false;
  if (f.status) { if (f.status === "unset" ? t.tr.status : (t.eff !== f.status)) return false; }
  if (f.show === "attention" && !t.flags.length) return false;
  if (f.show === "missing" && !(hasMissing(t) && t.level >= 3)) return false;
  if (f.show === "variation" && t.tr.scope.type !== "variation") return false;
  if (f.show === "workplan" && t.tr.workplan.has !== "yes") return false;
  if (f.show === "comments" && !t.tr.comments.length) return false;
  if (f.q) {
    const q = f.q.toLowerCase();
    if (!(t.name.toLowerCase().includes(q) || String(t.id) === q || t.path.join(" ").toLowerCase().includes(q) || t.tr.comments.some(c => c.text.toLowerCase().includes(q)))) return false;
  }
  return true;
}
export function anyFilter(f) { return f.tags.size || f.status || f.show || f.q; }
export const SHOW = [["", "Everything"], ["attention", "Needs attention"], ["missing", "Questions unanswered"], ["variation", "Variations"], ["workplan", "With a workplan"], ["comments", "With comments"]];

export function tagCounts(tasks) {
  const c = {}; for (const t of tasks) if (t.isLeaf) for (const k of t.tags) c[k] = (c[k] || 0) + 1; return c;
}

export function tagChips(state, counts) {
  return `<div class="chips" role="group" aria-label="Filter by tag">${TAGS.map(tg => `<button class="fchip ${state.filters.tags.has(tg.key) ? "on" : ""}" style="--h:${tg.hue}" data-tag="${tg.key}"><i></i>${esc(tg.label)}<span class="c">${counts[tg.key] || 0}</span></button>`).join("")}${state.filters.tags.size ? `<button class="fchip" data-tag="__clear">Clear tags</button>` : ""}</div>`;
}
export function bindTagChips(root, ctx) {
  root.querySelectorAll("[data-tag]").forEach(b => b.addEventListener("click", () => {
    const k = b.dataset.tag, s = ctx.state.filters.tags;
    if (k === "__clear") s.clear(); else s.has(k) ? s.delete(k) : s.add(k);
    ctx.rerender();
  }));
}

export function whenText(t) {
  if (t.startsIn == null) return "";
  if (t.startsIn > 0) return `Starts ${fmtShort(t.start)} (${relDays(t.startsIn)})`;
  if (t.finishesIn >= 0) return `Running, finishes ${fmtShort(t.finish)}`;
  return `Finished ${fmtShort(t.finish)}`;
}

export function statusDot(t) { return `<span class="sdot" style="--c:${STATUS_VAR[t.eff]}" title="${statusMeta(t.eff).label}"></span>`; }

export function crumb(t) { return esc(t.path.slice(-2).join(" › ")); }
export { icon };
