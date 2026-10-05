// Data store. Uses Firebase (Auth + Firestore). Add ?demo to the address to run on local sample data instead.
import { firebaseConfig } from "./config.js";

const FB = "https://www.gstatic.com/firebasejs/10.14.1/";
export const DEMO = new URLSearchParams(location.search).has("demo");

let fb = null, auth = null, db = null, currentUser = null;

async function loadFirebase() {
  const [app, authMod, fs] = await Promise.all([
    import(FB + "firebase-app.js"), import(FB + "firebase-auth.js"), import(FB + "firebase-firestore.js")
  ]);
  const a = app.initializeApp(firebaseConfig);
  auth = authMod.getAuth(a);
  try {
    db = fs.initializeFirestore(a, { localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }) });
  } catch { db = fs.getFirestore(a); }
  fb = { ...authMod, ...fs };
}

// ---------- demo backend (browser only) ----------
const LS = "p269-demo";
function demoRead() { try { return JSON.parse(localStorage.getItem(LS)) || null; } catch { return null; } }
function demoWrite(s) { try { localStorage.setItem(LS, JSON.stringify(s)); } catch {} }
let demoState = null; const demoListeners = new Set(); const demoHistListeners = new Set();
function demoEmit() { demoWrite(demoState); demoListeners.forEach(cb => cb(snapshot())); demoHistListeners.forEach(cb => cb(demoState.history.slice().reverse())); }
function snapshot() { return { tasks: Object.values(demoState.tasks), tracking: demoState.tracking, meta: demoState.meta }; }

// ---------- public api ----------
export const store = {
  mode: DEMO ? "demo" : "firebase",

  async init() {
    if (DEMO) {
      demoState = demoRead() || { tasks: {}, tracking: {}, meta: {}, history: [] };
      return;
    }
    await loadFirebase();
  },

  onAuth(cb) {
    if (DEMO) { currentUser = { email: "demo@local" }; setTimeout(() => cb(currentUser), 0); return () => {}; }
    return fb.onAuthStateChanged(auth, u => { currentUser = u; cb(u); });
  },
  user() { return currentUser; },

  async signIn(email, password) {
    if (DEMO) return;
    await fb.setPersistence(auth, fb.browserLocalPersistence);
    return fb.signInWithEmailAndPassword(auth, email, password);
  },
  async resetPassword(email) { if (!DEMO) return fb.sendPasswordResetEmail(auth, email); },
  async signOut() { if (DEMO) { location.href = location.pathname; return; } return fb.signOut(auth); },

  subscribe(cb) {
    if (DEMO) { demoListeners.add(cb); cb(snapshot()); return () => demoListeners.delete(cb); }
    const state = { tasks: [], tracking: {}, meta: {} };
    const flags = { t: false, r: false, m: false };
    const check = () => { if (flags.t && flags.r && flags.m) cb({ ...state }); };
    const onErr = e => cb({ error: e });
    const u1 = fb.onSnapshot(fb.collection(db, "tasks"), s => { state.tasks = s.docs.map(d => d.data()); flags.t = true; check(); }, onErr);
    const u2 = fb.onSnapshot(fb.collection(db, "tracking"), s => { const m = {}; s.docs.forEach(d => m[d.id] = d.data()); state.tracking = m; flags.r = true; check(); }, onErr);
    const u3 = fb.onSnapshot(fb.doc(db, "meta", "app"), s => { state.meta = s.data() || {}; flags.m = true; check(); }, onErr);
    return () => { u1(); u2(); u3(); };
  },

  subscribeHistory(cb, max = 300) {
    if (DEMO) { demoHistListeners.add(cb); cb(demoState.history.slice().reverse()); return () => demoHistListeners.delete(cb); }
    const q = fb.query(fb.collection(db, "history"), fb.orderBy("at", "desc"), fb.limit(max));
    return fb.onSnapshot(q, s => cb(s.docs.map(d => ({ id: d.id, ...d.data() }))));
  },

  async saveTracking(taskId, tracking, changes = []) {
    const id = String(taskId);
    const { comments, ...rest } = tracking;
    rest.updatedAt = new Date().toISOString(); rest.updatedBy = currentUser?.email || "";
    if (DEMO) {
      demoState.tracking[id] = { ...(demoState.tracking[id] || {}), ...rest };
      changes.forEach(c => demoState.history.push({ ...c, taskId, at: new Date().toISOString(), by: "demo@local" }));
      demoEmit(); return;
    }
    const batch = fb.writeBatch(db);
    batch.set(fb.doc(db, "tracking", id), rest, { merge: true });
    changes.forEach(c => batch.set(fb.doc(fb.collection(db, "history")), { ...c, taskId, at: new Date().toISOString(), by: currentUser?.email || "" }));
    await batch.commit();
  },

  async saveMany(entries, label) {
    // entries: [{taskId, tracking}] used by "apply to sub tasks" and board drags
    if (DEMO) {
      for (const e of entries) { const { comments, ...rest } = e.tracking; demoState.tracking[String(e.taskId)] = { ...(demoState.tracking[String(e.taskId)] || {}), ...rest, updatedAt: new Date().toISOString() }; }
      if (label) demoState.history.push({ ...label, at: new Date().toISOString(), by: "demo@local" });
      demoEmit(); return;
    }
    for (let i = 0; i < entries.length; i += 400) {
      const batch = fb.writeBatch(db);
      for (const e of entries.slice(i, i + 400)) {
        const { comments, ...rest } = e.tracking;
        batch.set(fb.doc(db, "tracking", String(e.taskId)), { ...rest, updatedAt: new Date().toISOString(), updatedBy: currentUser?.email || "" }, { merge: true });
      }
      if (i === 0 && label) batch.set(fb.doc(fb.collection(db, "history")), { ...label, at: new Date().toISOString(), by: currentUser?.email || "" });
      await batch.commit();
    }
  },

  async addComment(taskId, text, taskName) {
    const c = { id: Math.random().toString(36).slice(2, 10), at: new Date().toISOString(), by: currentUser?.email || "", text };
    const id = String(taskId);
    if (DEMO) {
      const t = demoState.tracking[id] || (demoState.tracking[id] = {});
      t.comments = [...(t.comments || []), c];
      demoState.history.push({ kind: "comment", taskId, taskName, to: text, at: c.at, by: c.by }); demoEmit(); return;
    }
    const batch = fb.writeBatch(db);
    batch.set(fb.doc(db, "tracking", id), { comments: fb.arrayUnion(c) }, { merge: true });
    batch.set(fb.doc(fb.collection(db, "history")), { kind: "comment", taskId, taskName, to: text, at: c.at, by: c.by });
    await batch.commit();
  },

  async deleteComment(taskId, comment) {
    const id = String(taskId);
    if (DEMO) { const t = demoState.tracking[id]; t.comments = (t.comments || []).filter(c => c.id !== comment.id); demoEmit(); return; }
    await fb.setDoc(fb.doc(db, "tracking", id), { comments: fb.arrayRemove(comment) }, { merge: true });
  },

  async importTasks(list, { removeIds = [], statusDate = "", source = "" } = {}) {
    const meta = { statusDate, lastImport: new Date().toISOString(), lastSource: source, lastImportBy: currentUser?.email || "" };
    const hist = { kind: "import", to: `${source}: ${list.length} tasks${removeIds.length ? `, ${removeIds.length} removed` : ""}` };
    if (DEMO) {
      list.forEach(t => demoState.tasks[t.id] = t);
      removeIds.forEach(id => delete demoState.tasks[id]);
      demoState.meta = { ...demoState.meta, ...meta };
      demoState.history.push({ ...hist, at: meta.lastImport, by: "demo@local" }); demoEmit(); return;
    }
    const ops = [
      ...list.map(t => b => b.set(fb.doc(db, "tasks", String(t.id)), t)),
      ...removeIds.map(id => b => b.delete(fb.doc(db, "tasks", String(id))))
    ];
    for (let i = 0; i < ops.length; i += 450) {
      const batch = fb.writeBatch(db);
      ops.slice(i, i + 450).forEach(op => op(batch));
      await batch.commit();
    }
    await fb.setDoc(fb.doc(db, "meta", "app"), meta, { merge: true });
    await fb.addDoc(fb.collection(db, "history"), { ...hist, at: meta.lastImport, by: currentUser?.email || "" });
  },

  async saveMeta(patch) {
    if (DEMO) { demoState.meta = { ...demoState.meta, ...patch }; demoEmit(); return; }
    await fb.setDoc(fb.doc(db, "meta", "app"), patch, { merge: true });
  }
};
