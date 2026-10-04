// Import schedule updates from MSP PDF prints, MSP XML or Excel.
import { readAny, mergeLists, assignParents } from "../importers.js";
import { fmtDate, fmtShort } from "../model.js";
import { esc, icon, toast, $, $$ } from "../ui.js";

let pending = null; // { tasks, statusDate, files, diff }

const FIELDS = [["name", "Name"], ["start", "Start"], ["finish", "Finish"], ["planned", "Planned %"], ["actual", "Actual %"], ["remDur", "Remaining"], ["parent", "Parent"], ["level", "Level"]];
const show = (k, v) => v == null || v === "" ? "blank" : (k === "start" || k === "finish") ? fmtShort(v) : (k === "planned" || k === "actual") ? v + "%" : v;

function computeDiff(incoming, current) {
  const cur = new Map(current.map(t => [t.id, t]));
  const inc = new Set(incoming.map(t => t.id));
  const added = [], changed = [], same = [];
  for (const t of incoming) {
    const o = cur.get(t.id);
    if (!o) { added.push(t); continue; }
    const ch = FIELDS.filter(([k]) => (o[k] ?? null) !== (t[k] ?? null) && !(k === "parent" && t.parent == null && o.parent != null)).map(([k, l]) => ({ k, l, from: o[k], to: t[k] }));
    ch.length ? changed.push({ t, ch }) : same.push(t);
  }
  const missing = current.filter(t => !inc.has(t.id));
  return { added, changed, same, missing };
}

export function renderImport(view, ctx, { fresh }) {
  const meta = ctx.state.raw.meta || {};
  view.innerHTML = `<div class="view-inner ${fresh ? "enter" : ""}">
    <section class="panel">
      <div class="panel-head"><h2>Load a schedule update</h2><span class="sub">${meta.lastImport ? `Last loaded ${fmtDate(new Date(meta.lastImport))} from ${esc(meta.lastSource || "a file")}` : "Nothing loaded yet"}</span></div>
      <div class="panel-body">
        <label class="drop" id="drop" tabindex="0">
          <input type="file" id="file" accept=".pdf,.xml,.xlsx,.xls,.csv,.mpp" multiple hidden>
          ${icon("upload", "big")}
          <h3>Drop MSP exports here, or click to choose</h3>
          <p>PDF prints (one or several, they are merged by task ID), MSP XML, or Excel. Your comments and tracking answers are never touched.</p>
        </label>
        <div id="preview"></div>
      </div>
    </section>
    <div class="steps">
      <div class="panel"><h4>${icon("doc")} PDF prints</h4><p>Print the views you already use (Overall, Asbestos, Demolition, Scaffolding). Drop them all in together. Task IDs, dates and % are read from each page and the structure comes from the indents.</p></div>
      <div class="panel"><h4>${icon("db")} MSP XML, most reliable</h4><p>In MS Project use File, Save As, then choose XML Format. Every task, level and date comes across exactly. Planned % isn't in XML, so actual % is used.</p></div>
      <div class="panel"><h4>${icon("excel")} Excel</h4><p>File, Save As, Excel Workbook. Include ID, Name, Start, Finish, Outline Level, Planned % and Actual % columns.</p></div>
    </div>
  </div>`;
  const drop = $("#drop", view), input = $("#file", view);
  drop.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } });
  ["dragenter", "dragover"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", e => handle([...e.dataTransfer.files]));
  input.addEventListener("change", () => handle([...input.files]));
  if (pending) renderPreview(view, ctx);

  async function handle(files) {
    if (!files.length) return;
    drop.insertAdjacentHTML("beforeend", `<div class="scan"></div>`);
    $("h3", drop).textContent = `Reading ${files.length} file${files.length > 1 ? "s" : ""}`;
    try {
      const results = [];
      for (const f of files) results.push({ name: f.name, ...(await readAny(f)) });
      const merged = assignParents(mergeLists(results.map(r => r.tasks)));
      if (!merged.length) throw new Error("No tasks found. Check the file is an MSP print or export with the ID column showing.");
      pending = { tasks: merged, statusDate: results.find(r => r.statusDate)?.statusDate || "", files: results.map(r => `${r.name} (${r.tasks.length})`), diff: computeDiff(merged, ctx.state.raw.tasks) };
      renderPreview(view, ctx);
    } catch (e) { toast(e.message, "err"); }
    $(".scan", drop)?.remove(); $("h3", drop).textContent = "Drop MSP exports here, or click to choose"; input.value = "";
  }
}

function renderPreview(view, ctx) {
  const p = pending, d = p.diff, box = $("#preview", view);
  box.innerHTML = `
    <div class="diffstats">
      <div class="stat"><b class="num" style="color:var(--on)">${d.added.length}</b><span>New tasks</span></div>
      <div class="stat"><b class="num" style="color:var(--risk)">${d.changed.length}</b><span>Changed</span></div>
      <div class="stat"><b class="num">${d.same.length}</b><span>Unchanged</span></div>
      <div class="stat"><b class="num" style="color:var(--ink3)">${d.missing.length}</b><span>Not in these files</span></div>
    </div>
    <p class="note">Read from ${p.files.map(esc).join(", ")}.</p>
    ${d.changed.length || d.added.length ? `<div class="tbl-wrap" data-keep-scroll="imp"><table class="tbl"><thead><tr><th>ID</th><th>Task</th><th>What changes</th></tr></thead><tbody>
      ${d.added.map(t => `<tr><td class="num">${t.id}</td><td>${esc(t.name)}</td><td class="new">New task, ${fmtShort(t.start)} to ${fmtShort(t.finish)}</td></tr>`).join("")}
      ${d.changed.map(({ t, ch }) => `<tr><td class="num">${t.id}</td><td>${esc(t.name)}</td><td>${ch.map(c => `${c.l}: <span class="old">${esc(show(c.k, c.from))}</span> <span class="new">${esc(show(c.k, c.to))}</span>`).join("<br>")}</td></tr>`).join("")}
    </tbody></table></div>` : `<div class="empty">Everything in these files already matches what's loaded.</div>`}
    <div class="toolbar" style="margin-top:16px">
      <label class="q" style="min-width:200px"><span class="note">Schedule status date</span><input class="input" type="date" id="sd" value="${p.statusDate}"></label>
      <label class="toggle" title="Use this when you load the full Overall schedule"><input type="checkbox" id="rm"> Remove the ${d.missing.length} tasks not in these files</label>
      <span class="grow"></span>
      <button class="btn" id="cancel">Cancel</button>
      <button class="btn primary" id="go">${icon("check")} Load ${p.tasks.length} tasks</button>
    </div>`;
  $("#cancel", box).addEventListener("click", () => { pending = null; box.innerHTML = ""; });
  $("#go", box).addEventListener("click", async e => {
    const b = e.currentTarget; b.disabled = true; b.textContent = "Loading";
    try {
      const rm = $("#rm", box).checked ? d.missing.map(t => t.id) : [];
      await ctx.store.importTasks(p.tasks, { removeIds: rm, statusDate: $("#sd", box).value, source: p.files.join(", ").slice(0, 300) });
      toast(`Loaded ${p.tasks.length} tasks${rm.length ? `, removed ${rm.length}` : ""}`);
      pending = null; ctx.go("command");
    } catch (ex) { toast("Load failed: " + ex.message, "err"); b.disabled = false; b.textContent = `Load ${p.tasks.length} tasks`; }
  });
}
