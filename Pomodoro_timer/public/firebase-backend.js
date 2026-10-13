// ─────────────────────────────────────────────────────────────────────────────
// Cucú · capa de conexión con Firebase
//
// La app (index.html) habla con tres "servicios": db, room y user.
// Este archivo los implementa con Firebase:
//   db   → Cloud Firestore (salas, chat, estadísticas)
//   room → Realtime Database (quién está conectado, reacciones y avisos)
//   user → Inicio de sesión anónimo (un id por navegador, sin cuentas)
// No hace falta tocar nada acá: la configuración va en firebase-config.js.
// ─────────────────────────────────────────────────────────────────────────────
import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import {
  getFirestore, doc as fsDoc, collection as fsCol, getDoc, getDocs, setDoc, deleteDoc, addDoc,
  onSnapshot, query as fsQuery, orderBy as fsOrderBy, limit as fsLimit
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";
import {
  getDatabase, ref, set as rtSet, remove as rtRemove, push as rtPush, onValue, onChildAdded,
  onDisconnect, serverTimestamp, query as rtQuery, orderByChild, startAt
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-database.js";

// ---------- errores con los códigos que entiende la app ----------
const CODES = {
  "permission-denied": "permission_denied", "unauthenticated": "permission_denied", "PERMISSION_DENIED": "permission_denied",
  "resource-exhausted": "quota_exceeded", "unavailable": "unavailable", "not-found": "not_found", "invalid-argument": "bad_data"
};
function wrapErr(e) {
  const err = new Error((e && e.message) || "Error de Firebase");
  err.code = CODES[e && e.code] || (e && /permission/i.test(e.message || "") ? "permission_denied" : (e && e.code) || "unknown");
  return err;
}
const W = p => p.catch(e => { throw wrapErr(e); });
const clean = o => JSON.parse(JSON.stringify(o === undefined ? null : o)); // Firebase no acepta undefined

// ---------- arranque: config + sesión anónima ----------
let ready = null;
function init() {
  if (ready) return ready;
  ready = (async () => {
    const cfg = firebaseConfig || {};
    if (!cfg.apiKey || /PEG(A|Á)/i.test(cfg.apiKey)) throw Object.assign(new Error("Falta completar firebase-config.js"), { code: "config" });
    if (!cfg.databaseURL) throw Object.assign(new Error("Falta databaseURL en firebase-config.js (creá la Realtime Database y volvé a copiar la configuración)"), { code: "config" });
    const app = initializeApp(cfg);
    const auth = getAuth(app);
    const user = await new Promise((resolve, reject) => {
      let off = null;
      off = onAuthStateChanged(auth, u => { if (u) { if (off) off(); resolve(u); } }, reject);
      signInAnonymously(auth).catch(reject);
    });
    const fs = getFirestore(app);
    const rt = getDatabase(app);
    let offset = 0;
    await new Promise(res => {
      const t = setTimeout(res, 3000);
      const off = onValue(ref(rt, ".info/serverTimeOffset"), s => { offset = s.val() || 0; clearTimeout(t); off(); res(); });
    });
    return { app, auth, uid: user.uid, fs, rt, now: () => Date.now() + offset };
  })();
  return ready;
}

// ---------- db (Firestore) ----------
function makeDb(c) {
  const docSnap = s => ({
    id: s.id, exists: s.exists(), data: () => s.data(),
    metadata: { hasPendingWrites: s.metadata.hasPendingWrites, fromCache: s.metadata.fromCache }
  });
  const qSnap = s => ({ empty: s.empty, size: s.size, docs: s.docs.map(d => ({ id: d.id, exists: true, data: () => d.data() })) });
  class DocRef {
    constructor(path) { this.path = path; this.r = fsDoc(c.fs, path); this.id = this.r.id; }
    get() { return W(getDoc(this.r).then(docSnap)); }
    set(data) { return W(setDoc(this.r, clean(data))); }
    delete() { return W(deleteDoc(this.r)); }
    onSnapshot(next, error) { return onSnapshot(this.r, s => next(docSnap(s)), e => error && error(wrapErr(e))); }
  }
  class Query {
    constructor(path, cons = []) { this.path = path; this.cons = cons; }
    orderBy(field, dir = "asc") { return new Query(this.path, this.cons.concat([fsOrderBy(field, dir)])); }
    limit(n) { return new Query(this.path, this.cons.concat([fsLimit(n)])); }
    doc(id) { return new DocRef(this.path + "/" + id); }
    q() { return fsQuery(fsCol(c.fs, this.path), ...this.cons); }
    get() { return W(getDocs(this.q()).then(qSnap)); }
    add(data) { return W(addDoc(fsCol(c.fs, this.path), clean(data)).then(r => new DocRef(r.path))); }
    onSnapshot(next, error) { return onSnapshot(this.q(), s => next(qSnap(s)), e => error && error(wrapErr(e))); }
  }
  return { doc: p => new DocRef(p), collection: p => new Query(p) };
}

// ---------- room (Realtime Database) ----------
function makeRoom(c) {
  let connected = false;
  const connListeners = new Set();
  onValue(ref(c.rt, ".info/connected"), s => { connected = s.val() === true; connListeners.forEach(f => f(connected)); });
  const key = s => String(s).replace(/[.#$\[\]\/]/g, "_");

  async function join(name) {
    const rn = key(name);
    const presRoot = ref(c.rt, `presence/${rn}`);
    const myRef = rtPush(presRoot), me = myRef.key;
    const since = c.now() - 2000;
    let state = {}, left = false;
    const unsubs = [];
    const writePresence = async () => {
      if (left) return;
      await onDisconnect(myRef).remove();
      await rtSet(myRef, { by: c.uid, p: state, t: serverTimestamp() });
    };
    const onConn = ok => { if (ok) writePresence().catch(() => {}); };
    connListeners.add(onConn);
    await writePresence().catch(() => {});

    return {
      name,
      connected: () => connected && !left,
      presence(patch) { state = clean(patch || {}); return W(writePresence()); },
      onPeers(fn, error) {
        const off = onValue(presRoot, s => {
          const v = s.val() || {};
          const peers = Object.entries(v).map(([k, x]) => ({
            peer: k, by: x && typeof x.by === "string" ? x.by : null, presence: (x && x.p) || {},
            isMe: !!x && x.by === c.uid, sameTab: k === me, guest: false, kind: "user"
          }));
          if (!peers.some(p => p.sameTab)) peers.push({ peer: me, by: c.uid, presence: state, isMe: true, sameTab: true, guest: false, kind: "user" });
          fn({ peers });
        }, e => error && error(wrapErr(e)));
        unsubs.push(off); return off;
      },
      emit(topic, data) {
        if (left) return Promise.reject(wrapErr({ code: "unavailable" }));
        const r = rtPush(ref(c.rt, `events/${rn}/${key(topic)}`));
        return W(rtSet(r, { by: c.uid, peer: me, d: clean(data), ts: serverTimestamp() })
          .then(() => { setTimeout(() => rtRemove(r).catch(() => {}), 20000); }));
      },
      on(topic, fn, error) {
        const q = rtQuery(ref(c.rt, `events/${rn}/${key(topic)}`), orderByChild("ts"), startAt(since));
        const off = onChildAdded(q, s => {
          const x = s.val(); if (!x) return;
          fn({ data: x.d === undefined ? null : x.d, by: x.by, peer: x.peer, isMe: x.by === c.uid, sameTab: x.peer === me, guest: false, kind: "user" });
        }, e => error && error(wrapErr(e)));
        unsubs.push(off); return off;
      },
      async leave() {
        left = true; connListeners.delete(onConn);
        unsubs.forEach(u => { try { u(); } catch (e) {} });
        try { await onDisconnect(myRef).cancel(); } catch (e) {}
        await rtRemove(myRef).catch(() => {});
      }
    };
  }
  return { join };
}

// ---------- user (sesión anónima) ----------
function makeUser(c) {
  const hue = id => { let h = 0; for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h % 360; };
  const color = id => `hsl(${hue(id)} 55% 42%)`;
  const avatarFor = (name, id) => {
    const ini = (String(name || "").trim().split(/\s+/).map(w => w[0] || "").join("").slice(0, 2) || "?").toUpperCase().replace(/[<>&'"]/g, "");
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'><rect width='40' height='40' rx='20' fill='${color(id || name)}'/><text x='20' y='26' text-anchor='middle' font-family='system-ui,sans-serif' font-size='16' font-weight='700' fill='#fff'>${ini}</text></svg>`;
    return "data:image/svg+xml," + encodeURIComponent(svg);
  };
  const nick = () => { try { return localStorage.getItem("cucu.nick") || ""; } catch (e) { return ""; } };
  return {
    id: async () => c.uid,
    me: async () => ({ id: c.uid, name: nick(), email: null, avatarUrl: avatarFor(nick(), c.uid), color: color(c.uid), isOwner: false, canEdit: false }),
    profiles: async ids => Object.fromEntries((ids || []).filter(Boolean).map(id => [id, { id, name: "", email: null, avatarUrl: avatarFor("", id), color: color(id), isMe: id === c.uid, guest: false }])),
    isOwner: async () => false,
    canEdit: async () => false,
    can: async () => null,
    avatarFor
  };
}

// ---------- punto de entrada que usa la app ----------
const cache = {};
export const claude = {
  use(name) {
    if (!(name in cache)) {
      cache[name] = init()
        .then(c => name === "db" ? makeDb(c) : name === "room" ? makeRoom(c) : name === "user" ? makeUser(c) : null)
        .catch(e => {
          window.cucuBackendError = (e && (e.code || e.message)) || "error";
          console.error("[Cucú] No se pudo conectar con Firebase:", e);
          return null;
        });
    }
    return cache[name];
  }
};
window.claude = claude;
