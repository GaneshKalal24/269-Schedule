// Activity feed: every change, comment and import, newest first.
import { esc, icon, timeAgo, $$ } from "../ui.js";
import { histLine } from "../drawer.js";

export function renderActivity(view, ctx, { fresh }) {
  const h = ctx.state.history;
  const groups = {};
  for (const x of h) { const d = new Date(x.at).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" }); (groups[d] ||= []).push(x); }
  const ic = x => x.kind === "comment" ? "chat" : x.kind === "import" ? "upload" : "pulse";
  view.innerHTML = `<div class="view-inner ${fresh ? "enter" : ""}" style="max-width:900px">
    <section class="panel"><div class="panel-head"><h2>Activity</h2><span class="sub">Latest ${h.length} changes</span></div>
    <div class="panel-body">${Object.entries(groups).map(([day, items]) => `
      <h3 class="hud" style="font-size:14px;color:var(--ink3);margin:18px 0 6px">${esc(day)}</h3>
      <div class="feed">${items.map(x => `<div class="fi"><span class="ico">${icon(ic(x))}</span><div class="body">
        ${x.kind === "import" ? `<b>Schedule loaded.</b> ${esc(x.to)}` :
          x.kind === "comment" ? `<span class="t" data-id="${x.taskId}">${esc(x.taskName || "Task " + x.taskId)}</span>: “${esc(x.to)}”` :
          `<span class="t" data-id="${x.taskId}">${esc(x.taskName || "Task " + x.taskId)}</span>. ${histLine(x)}`}
        <div class="meta">${timeAgo(x.at)} by ${esc((x.by || "").split("@")[0])}</div></div></div>`).join("")}</div>`).join("") || `<div class="empty">No activity yet. Changes you make to tasks show up here.</div>`}
    </div></section></div>`;
  $$("[data-id]", view).forEach(e => e.addEventListener("click", () => ctx.openTask(+e.dataset.id)));
}
