import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, connectAuthEmulator, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { initializeFirestore, connectFirestoreEmulator, persistentLocalCache, persistentMultipleTabManager, collection, doc, onSnapshot, getDoc, setDoc, addDoc, updateDoc, deleteDoc, writeBatch, query, where, arrayUnion, arrayRemove } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { esc, inline, fmt, letter, norm, ymd, fecha } from "./js/util.js";
import { PTS, statsFor, ranking, badges, points } from "./js/puntos.js";
import { slug, uniIdOf, carreraIdOf, materiaIdOf, matKey, normTags } from "./js/catalogo.js";
import { EXAMPLE, parseText, parseJSONData, parseHTMLFile, extractJSON, validate, AI_PROMPT } from "./js/parser.js";
import { NOVEDADES } from "./js/novedades.js";

/* ================= Firebase ================= */
// Modo local con emuladores (http://localhost:3000/?emu, ver README): usa cuentas y datos de prueba, nunca la base real.
const EMU = location.hostname === "localhost" && new URLSearchParams(location.search).has("emu");
const fbApp = initializeApp(EMU ? { ...firebaseConfig, apiKey: "demo-key", projectId: "demo-parcialito" } : firebaseConfig);
const auth = getAuth(fbApp);
if (EMU) connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true });
let db;
try { db = initializeFirestore(fbApp, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }); }
catch (e) { db = initializeFirestore(fbApp, {}); }
if (EMU) connectFirestoreEmulator(db, "localhost", 8080);
if (EMU) document.querySelector(".logo").insertAdjacentHTML("afterend", `<span class="emu-badge" title="Datos de prueba en los emuladores locales">Modo prueba</span>`);

/* ================= Estado ================= */
const BLANK = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
const S = {
  user: null, uid: null, admin: null, authReady: false, loginError: "",
  tests: {}, scores: {}, users: {}, tickets: {}, unis: {}, carreras: {}, mats: {}, attempts: [], subs: null,
  got: { tests: false, scores: false, users: false },
  view: "tests", f: null, rankScope: "", rankMateria: "", progMat: "", run: null, unsub: [], desde: "",
  up: { mode: "texto", parsed: null, error: null, busy: false },
  tk: { open: false, ntipo: "mejora", titulo: "", desc: "", tipo: "", estado: "abiertos", mios: false },
  perfil: null
};
const $ = s => document.querySelector(s);
const app = $("#app");
// Un index.html viejo en caché no trae las pestañas nuevas: se completan acá para que la app no se rompa.
if (!$("#novDot")) $("#tabs").innerHTML = [["tests", "Tests"], ["ranking", "Ranking"], ["progreso", "Mi progreso"], ["subir", "Subir un test"], ["ideas", "Ideas y bugs"], ["novedades", "Novedades"]]
  .map(([k, l]) => `<a href="#${k}" data-tab="${k}">${l}${k === "novedades" ? `<span class="tab-dot" id="novDot" hidden><span class="sr">(hay novedades)</span></span>` : ""}</a>`).join("");

/* ================= Utilidades ================= */
const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => t.hidden = true, 3400); }
// localStorage puede no estar disponible (modo privado, bloqueos): solo se usa para comodidades.
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };
function sanitize(html) {
  const ok = new Set(["P","TABLE","THEAD","TBODY","TR","TD","TH","UL","OL","LI","B","STRONG","EM","I","BR","CODE","SUP","SUB"]);
  const d = new DOMParser().parseFromString("<div>" + String(html || "") + "</div>", "text/html");
  const root = d.body.firstChild;
  (function walk(node) {
    [...node.childNodes].forEach(ch => {
      if (ch.nodeType === 1) {
        if (!ok.has(ch.tagName)) { walk(ch); ch.replaceWith(...ch.childNodes); return; }
        [...ch.attributes].forEach(a => ch.removeAttribute(a.name));
        walk(ch);
      } else if (ch.nodeType !== 3) ch.remove();
    });
  })(root);
  return root.innerHTML.replace(/<table>/g, '<div class="case-scroll"><table>').replace(/<\/table>/g, "</table></div>");
}
const multiline = s => esc(s).replace(/\n/g, "<br>");

/* ================= Personas ================= */
const nameOf = id => id === S.uid ? "Vos" : (S.users[id]?.name || "Alguien");
const fullNameOf = id => S.users[id]?.name || (id === S.uid ? (S.user?.displayName || "Vos") : "Alguien");
const photoOf = id => S.users[id]?.photo || (id === S.uid ? S.user?.photoURL : "") || BLANK;
const avatar = (id, cls = "avatar") => `<img class="${cls}" alt="" src="${esc(photoOf(id))}" referrerpolicy="no-referrer">`;
function paintNames(root = document) { root.querySelectorAll("[data-nm]").forEach(el => el.textContent = el.dataset.full ? fullNameOf(el.dataset.nm) : nameOf(el.dataset.nm)); }
const nm = (id, full) => `<span class="nm" data-nm="${esc(id)}"${full ? ' data-full="1"' : ""}></span>`;
const me = () => S.users[S.uid] || {};
// Un admin sin lista de universidades es global (así son los que ya existían).
const canMod = uni => !!S.admin && (S.admin.global || S.admin.unis.includes(uni));

/* ================= Datos derivados ================= */
const testList = () => Object.entries(S.tests).map(([id, t]) => ({ id, ...t }));
const data = () => ({ scores: S.scores, tests: S.tests });
const matNombreDe = t => S.mats[t.materiaId]?.nombre || t.materia || "";
function materias(pred = () => true) {
  const m = new Map();
  testList().forEach(t => { if (!pred(t)) return; const k = matKey(t); const e = m.get(k) || { key: k, nombre: matNombreDe(t), n: 0 }; e.n++; m.set(k, e); });
  return [...m.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}
const matNombre = k => materias(() => true).find(m => m.key === k)?.nombre || "";
const subs = () => ({ materias: [], tags: [], seenAt: 0, ...(S.subs || {}) });
const novedadPendiente = () => NOVEDADES.length > 0 && store.get("novedadesVistas") !== NOVEDADES[0].v;

/* ================= Navegación ================= */
const VIEWS = ["tests", "ranking", "subir", "progreso", "ideas", "perfil", "novedades"];
// El hash puede llevar filtros: #tests?c=unlp__sistemas&q=parcial
function parseHash() {
  const raw = (location.hash || "").slice(1);
  if (raw.startsWith("t/")) return { view: "test", id: decodeURIComponent(raw.slice(2)) };
  const i = raw.indexOf("?"), h = decodeURIComponent(i < 0 ? raw : raw.slice(0, i)), qs = i < 0 ? "" : raw.slice(i + 1);
  if (VIEWS.includes(h)) return { view: h, qs };
  return { view: "tests" };
}
let lastHash = location.hash;
window.addEventListener("hashchange", () => {
  if (S.run && !S.run.saved && Object.keys(S.run.sel).length && !location.hash.startsWith("#t/" + S.run.id)) {
    if (!confirm("Tenés un test a medio hacer. Si salís, se pierden tus respuestas. ¿Salir igual?")) { history.replaceState(null, "", lastHash); return; }
  }
  S.desde = lastHash; lastHash = location.hash; route();
});
window.addEventListener("beforeunload", e => { if (S.run && !S.run.saved && Object.keys(S.run.sel).length) { e.preventDefault(); e.returnValue = ""; } });
function go(hash) { if (location.hash === hash) route(); else location.hash = hash; }
function route() {
  const r = parseHash();
  if (r.view === "test") { if (!S.run || S.run.id !== r.id) startTest(r.id); S.view = "test"; }
  else { S.view = r.view; S.run = null; if (r.view === "tests" && r.qs) filtrosDesdeURL(r.qs); }
  render(); window.scrollTo(0, 0); app.focus({ preventScroll: true });
}

/* ================= Render ================= */
function ready() { return S.got.tests && S.got.scores && S.got.users; }
function render() {
  renderBar();
  if (!S.authReady) { app.innerHTML = `<div class="wrap"><p class="muted">Cargando…</p></div>`; return; }
  if (!S.user) { renderLanding(); return; }
  if (!ready()) { app.innerHTML = `<div class="wrap"><p class="muted">Cargando los tests del curso…</p></div>`; return; }
  ({ ranking: renderRanking, subir: renderUpload, test: renderTest, progreso: renderProgreso, ideas: renderIdeas, perfil: renderPerfil, novedades: renderNovedades }[S.view] || renderHome)();
  paintNames();
}
function renderBar() {
  const tabs = $("#tabs"); tabs.hidden = !S.user;
  tabs.querySelectorAll("a").forEach(a => a.setAttribute("aria-current", (a.dataset.tab === S.view || (S.view === "test" && a.dataset.tab === "tests")) ? "page" : "false"));
  $("#novDot").hidden = !novedadPendiente();
  const box = $("#me");
  if (!S.user) { box.innerHTML = ""; return; }
  const st = ready() ? statsFor(data(), S.uid) : null;
  const pos = ready() ? ranking(data()).findIndex(r => r.id === S.uid) + 1 : 0;
  box.innerHTML = `${st ? `<span><span class="pts num">${st.pts}</span> pts${pos ? ` · puesto <b class="num">${pos}</b>` : ""}</span>` : ""}
    <div class="menu"><button class="menu-btn" id="menuBtn" aria-haspopup="true" aria-expanded="false" aria-label="Tu cuenta">${avatar(S.uid)}</button>
    <div class="menu-pop" id="menuPop" hidden><p><b>${esc(S.user.displayName || "")}</b><br><span class="muted">${esc(S.user.email || "")}</span></p><a href="#perfil">Mi perfil</a><button id="logout">Cerrar sesión</button></div></div>`;
  const btn = $("#menuBtn"), pop = $("#menuPop");
  btn.onclick = e => { e.stopPropagation(); pop.hidden = !pop.hidden; btn.setAttribute("aria-expanded", !pop.hidden); };
  document.addEventListener("click", () => { pop.hidden = true; btn.setAttribute("aria-expanded", "false"); }, { once: true });
  $("#logout").onclick = () => signOut(auth);
}

/* ---------- landing ---------- */
function renderLanding() {
  const rows = [[1, [1]], [2, [0, 2]], [3, [3]], [4, [1, 2]], [5, [0]]];
  app.innerHTML = `<section class="landing">
    <div>
      <h1>Estudiá para el parcial <span class="hl">compitiendo</span> con tu curso.</h1>
      <p class="lead">Subí los tests que tengas por materia y por parcial, resolvé los de tus compañeros y sumá puntos en el ranking mientras repasás.</p>
      <button class="btn big" id="login">Entrar con Google</button>
      ${S.loginError ? `<p class="err">${esc(S.loginError)}</p>` : ""}
      <ul class="steps">
        <li><span class="bub fill">1</span><span>Cada respuesta correcta suma 10 puntos; un test perfecto, 50 más.</span></li>
        <li><span class="bub fill">2</span><span>Cada test que subís para el resto te da 30 puntos.</span></li>
        <li><span class="bub fill">3</span><span>Repetir solo suma si mejorás tu marca, así gana quien estudia.</span></li>
      </ul>
    </div>
    <div class="sheet-demo" aria-hidden="true">
      <div class="form-head"><div class="form-field"><small>Materia</small><span>Minería de Datos</span></div><div class="form-field"><small>Parcial</small><span>1er parcial</span></div></div>
      <div class="demo-rows">${rows.map(([n, f]) => `<div class="demo-row"><span class="n">${n}</span>${[0, 1, 2, 3].map(i => `<span class="bub ${f.includes(i) ? "fill" : ""}">${letter(i)}</span>`).join("")}</div>`).join("")}</div>
      <div class="demo-rank"><div><b>1</b><span>Lucía</span><b>1.240</b></div><div class="is-me"><b>2</b><span>Vos</span><b>1.115</b></div><div><b>3</b><span>Tomás</span><b>980</b></div></div>
    </div>
  </section>`;
  $("#login").onclick = login;
}
async function login() {
  S.loginError = "";
  const provider = new GoogleAuthProvider();
  try { await signInWithPopup(auth, provider); }
  catch (e) {
    if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment") { await signInWithRedirect(auth, provider); return; }
    if (e.code === "auth/popup-closed-by-user" || e.code === "auth/cancelled-popup-request") return;
    S.loginError = e.code === "auth/unauthorized-domain" ? "Este dominio no está autorizado en Firebase. Agregalo en Authentication > Configuración > Dominios autorizados." : "No se pudo iniciar sesión. Probá de nuevo.";
    render();
  }
}

/* ---------- inicio ---------- */
function studentCard() {
  const st = statsFor(data(), S.uid); const pos = ranking(data()).findIndex(r => r.id === S.uid) + 1;
  return `<section class="student" aria-label="Tu resumen">
    ${avatar(S.uid)}
    <div class="student-fields">
      <div class="form-field name"><small>Alumno/a</small><span>${nm(S.uid, true)}</span></div>
      <div class="form-field points"><small>Puntos</small><span class="num">${st.pts}</span></div>
      <div class="form-field"><small>Puesto</small><span class="num">${pos || "–"}</span></div>
      <div class="form-field"><small>Tests hechos</small><span class="num">${st.done}</span></div>
      <div class="form-field"><small>Racha</small><span class="num">${st.streak} ${st.streak === 1 ? "día" : "días"}</span></div>
    </div>
    <div class="stamps">${badges(st).map(([t, on]) => `<span class="stamp ${on ? "" : "off"}">${esc(t)}</span>`).join("")}</div>
  </section>`;
}
const perfilBanner = () => me().carreraId ? "" : `<div class="notice"><p><b>¿De qué universidad y carrera sos?</b> Completalo para ver el ranking de tu carrera y subir tests a tus materias.</p><a class="btn small" href="#perfil">Completar perfil</a></div>`;
function paraVos() {
  const sb = subs(); if (!sb.materias.length && !sb.tags.length) return "";
  const my = S.scores[S.uid]?.tests || {};
  const list = testList().filter(t => !my[t.id] && t.autor !== S.uid && (sb.materias.includes(matKey(t)) || (t.tags || []).some(g => sb.tags.includes(g))))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 6);
  const esNuevo = t => (t.createdAt || 0) > (sb.seenAt || 0);
  return `<section class="foryou" aria-label="Para vos"><div class="foryou-head"><h2>Para vos</h2>${list.some(esNuevo) ? `<button class="link" id="seenAll">Marcar como vistos</button>` : ""}</div>
    ${list.length ? `<ul>${list.map(t => `<li><a href="#t/${encodeURIComponent(t.id)}">${esNuevo(t) ? `<span class="new">Nuevo</span>` : ""}<b>${esc(t.titulo)}</b><span class="muted">${esc(matNombreDe(t))} · ${t.n} preguntas</span></a></li>`).join("")}</ul>`
      : `<p class="muted">No tenés tests pendientes de lo que seguís. Cuando alguien suba uno nuevo, aparece acá.</p>`}</section>`;
}
function saveSubs(next) {
  S.subs = next; render();
  setDoc(doc(db, "subs", S.uid), next).catch(() => toast("No se pudo guardar lo que seguís. Probá de nuevo."));
}
function toggleSub(kind, val, label) {
  const sb = subs(), on = sb[kind].includes(val);
  saveSubs({ ...sb, [kind]: on ? sb[kind].filter(x => x !== val) : [...sb[kind], val].slice(kind === "tags" ? -30 : -50) });
  toast(on ? `Dejaste de seguir ${label}` : `Ahora seguís ${label}`);
}
/* ---------- inicio: buscador, filtros y orden ---------- */
const fold = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const ESTADOS_TEST = [["", "Todos"], ["pend", "Sin hacer"], ["hechos", "Hechos"], ["perf", "Perfectos"], ["mios", "Subidos por mí"]];
const ORDENES = [["", "Por materia"], ["nuevos", "Más nuevos"], ["resueltos", "Más resueltos"], ["repasar", "Para repasar"], ["titulo", "Título A-Z"]];
// Clave corta en la URL → campo del filtro.
const FKEYS = { u: "uni", c: "car", m: "mat", p: "parcial", e: "estado", t: "tag", q: "q", o: "orden" };
const filtrosVacios = () => ({ uni: "", car: "", mat: "", parcial: "", estado: "", tag: "", q: "", orden: "" });
// Mientras la persona no toque universidad o carrera, siguen a su perfil (que puede llegar después del primer render).
function filtros() {
  if (!S.f) S.f = { ...filtrosVacios(), auto: true };
  if (S.f.auto) Object.assign(S.f, { uni: me().universidadId || "", car: me().carreraId || "" });
  return S.f;
}
function filtrosDesdeURL(qs) {
  const p = new URLSearchParams(qs), f = { ...filtrosVacios(), auto: false };
  for (const [k, key] of Object.entries(FKEYS)) if (p.has(k)) f[key] = p.get(k);
  S.f = f;
}
function syncURL() {
  const p = new URLSearchParams();
  for (const [k, key] of Object.entries(FKEYS)) if (S.f[key]) p.set(k, S.f[key]);
  const h = "#tests" + (p.toString() ? "?" + p : "");
  if (location.hash !== h) { history.replaceState(null, "", h); lastHash = h; }
}
const hayFiltros = f => !!(f.q || f.mat || f.parcial || f.estado || f.tag || f.orden);
const alcanceDe = f => f.car ? S.carreras[f.car]?.nombre || "la carrera" : f.uni ? S.unis[f.uni]?.sigla || S.unis[f.uni]?.nombre || "la universidad" : "todo Parcialito";
const etiquetaUbicacion = t => [S.unis[t.universidadId]?.sigla || S.unis[t.universidadId]?.nombre, S.carreras[t.carreraId]?.nombre].filter(Boolean).join(" · ") || "Sin carrera asignada";
const pctMio = t => { const r = S.scores[S.uid]?.tests?.[t.id]; return r ? r.best / r.max : null; };
const resueltoPor = tid => Object.values(S.scores).filter(s => s.tests && s.tests[tid]).length;
function testsEnAlcance(f) { return testList().filter(t => (!f.uni || t.universidadId === f.uni) && (!f.car || t.carreraId === f.car)); }
function aplicarFiltros(f, base) {
  const words = fold(f.q).split(/\s+/).filter(Boolean);
  return base.filter(t => {
    if (f.mat && matKey(t) !== f.mat) return false;
    if (f.parcial && t.parcial !== f.parcial) return false;
    if (f.tag && !(t.tags || []).includes(f.tag)) return false;
    const p = pctMio(t);
    if (f.estado === "pend" && p != null) return false;
    if (f.estado === "hechos" && p == null) return false;
    if (f.estado === "perf" && !(p >= 1)) return false;
    if (f.estado === "mios" && t.autor !== S.uid) return false;
    if (words.length) {
      const texto = fold([t.titulo, matNombreDe(t), t.parcial, ...(t.tags || []).map(g => "#" + g), fullNameOf(t.autor)].join(" "));
      if (!words.every(w => texto.includes(w.replace(/^#/, "")))) return false;
    }
    return true;
  });
}
function ordenar(list, orden) {
  const by = {
    nuevos: (a, b) => (b.createdAt || 0) - (a.createdAt || 0),
    resueltos: (a, b) => resueltoPor(b.id) - resueltoPor(a.id),
    // Primero los que peor te salieron; los que no hiciste van al final.
    repasar: (a, b) => (pctMio(a) ?? 2) - (pctMio(b) ?? 2),
    titulo: (a, b) => a.titulo.localeCompare(b.titulo, "es", { numeric: true })
  }[orden];
  return [...list].sort(by);
}
function trowHTML(t, conContexto) {
  const r = S.scores[S.uid]?.tests?.[t.id], n = resueltoPor(t.id), pct = r ? Math.round(r.best / r.max * 100) : 0;
  const canDel = t.autor === S.uid || canMod(t.universidadId || "");
  return `<div class="trow"><div>
    ${conContexto ? `<div class="ctx">${esc(matNombreDe(t))} · ${esc(t.parcial)}</div>` : ""}
    <a class="t" href="#t/${encodeURIComponent(t.id)}">${esc(t.titulo)}</a>
    <div class="s">${t.n} preguntas · subido por ${nm(t.autor)} · ${n === 0 ? "nadie lo hizo todavía" : n === 1 ? "lo hizo 1 persona" : `lo hicieron ${n} personas`}${canDel ? ` · <button class="link danger" data-del="${esc(t.id)}">Borrar</button>` : ""}</div>
    ${(t.tags || []).length ? `<div class="tags">${t.tags.map(g => `<button class="tagbtn" data-ft="${esc(g)}" aria-label="Filtrar por la etiqueta ${esc(g)}">#${esc(g)}</button>`).join("")}</div>` : ""}</div>
    <div class="meter ${r && r.best >= r.max ? "perfect" : ""}">${r ? `<span>Tu mejor: <b>${fmt(r.best)}/${r.max}</b></span>` : `<span>Sin hacer</span>`}<div class="track"><div class="fill" style="width:${pct}%"></div></div></div>
    <a class="btn small ${r ? "ghost" : ""}" href="#t/${encodeURIComponent(t.id)}">${r ? "Repetir" : "Hacer"}</a></div>`;
}
function resultsHTML(list, f) {
  if (!list.length) return `<div class="empty"><p><b>Ningún test coincide${f.q ? ` con “${esc(f.q)}”` : ""}.</b></p><p>Probá con otras palabras o sacá algún filtro.</p>
    <div class="row-center">${hayFiltros(f) ? `<button class="btn small" data-clear="1">Limpiar filtros</button>` : ""}${f.car || f.uni ? `<button class="btn small ghost" data-widen="1">Buscar en ${f.car ? "toda la universidad" : "todo Parcialito"}</button>` : ""}</div></div>`;
  if (f.orden) return `<div class="tlist">${ordenar(list, f.orden).map(t => trowHTML(t, true)).join("")}</div>`;
  const grupos = new Map();
  list.forEach(t => { const k = matKey(t); const g = grupos.get(k) || { key: k, nombre: matNombreDe(t), muestra: t, tests: [] }; g.tests.push(t); grupos.set(k, g); });
  const sb = subs();
  return [...grupos.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")).map(g => {
    const byP = {}; g.tests.forEach(t => (byP[t.parcial] ||= []).push(t));
    const sigo = sb.materias.includes(g.key);
    return `<section class="mgroup"><div class="mgroup-head"><div><h2>${esc(g.nombre)}</h2>${!f.car ? `<p class="muted">${esc(etiquetaUbicacion(g.muestra))}</p>` : ""}</div>
      <button class="btn small ghost" data-follow="${esc(g.key)}" data-nombre="${esc(g.nombre)}" aria-pressed="${sigo}">${sigo ? "Siguiendo" : "Seguir"}</button></div>
      ${Object.keys(byP).sort((a, b) => a.localeCompare(b, "es", { numeric: true })).map(p => {
        const ts = byP[p].sort((a, b) => (a.orden ?? 999) - (b.orden ?? 999) || (a.createdAt || 0) - (b.createdAt || 0));
        return `<div class="parcial"><h3>${esc(p)} <small>${ts.length} ${ts.length === 1 ? "test" : "tests"}</small></h3>${ts.map(t => trowHTML(t, false)).join("")}</div>`;
      }).join("")}</section>`;
  }).join("");
}
function renderHome() {
  if (!testList().length) {
    app.innerHTML = `<div class="wrap">${perfilBanner()}${studentCard()}<div class="empty"><p><b>Todavía no hay tests en Parcialito.</b></p><p>Subí el primero: un parcial viejo, un simulacro o preguntas que armaste vos.</p><a class="btn" href="#subir">Subir un test</a></div></div>`;
    return;
  }
  const f = filtros(), u = me();
  const base = testsEnAlcance(f), ids = new Set(base.map(t => t.id));
  const mats = materias(t => ids.has(t.id));
  if (f.mat && !mats.some(m => m.key === f.mat)) f.mat = "";
  const enMat = f.mat ? base.filter(t => matKey(t) === f.mat) : base;
  const parciales = [...new Set(enMat.map(t => t.parcial))].sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
  if (f.parcial && !parciales.includes(f.parcial)) f.parcial = "";
  const cuenta = {}; enMat.forEach(t => (t.tags || []).forEach(g => cuenta[g] = (cuenta[g] || 0) + 1));
  const tags = Object.entries(cuenta).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es")).slice(0, 14).map(e => e[0]);
  if (f.tag && !cuenta[f.tag]) f.tag = "";
  const unis = Object.values(S.unis).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  const carreras = Object.values(S.carreras).filter(c => c.universidadId === f.uni).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  const opt = (v, l, cur) => `<option value="${esc(v)}" ${v === cur ? "selected" : ""}>${esc(l)}</option>`;
  const chips = (attr, items, cur) => items.map(([v, l]) => `<button class="chip" data-${attr}="${esc(v)}" aria-pressed="${v === cur}">${esc(l)}</button>`).join("");
  const rkPred = (t, id) => ids.has(id) && (!f.mat || matKey(t) === f.mat), rk = ranking(data(), rkPred), miPos = rk.findIndex(r => r.id === S.uid) + 1;
  const activos = [f.parcial, f.estado, f.tag].filter(Boolean).length;
  const rkTitulo = f.mat ? matNombre(f.mat) : alcanceDe(f), sigoTag = f.tag && subs().tags.includes(f.tag);
  app.innerHTML = `<div class="wrap">${perfilBanner()}${studentCard()}${paraVos()}
    <section class="finder ${S.fMas ? "mas" : ""}" aria-label="Buscar y filtrar tests">
      <div class="search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M20 20l-4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        <input id="fq" type="search" value="${esc(f.q)}" placeholder="Buscar por título, materia, #etiqueta o autor" aria-label="Buscar tests" autocomplete="off"></div>
      <div class="selects">
        <label class="sel"><span>Universidad</span><select id="fu">${opt("", "Todas", f.uni)}${unis.map(x => opt(x.id, x.sigla ? `${x.sigla} · ${x.nombre}` : x.nombre, f.uni)).join("")}</select></label>
        <label class="sel"><span>Carrera</span><select id="fc" ${f.uni ? "" : "disabled"}>${opt("", f.uni ? "Todas" : "Elegí una universidad", f.car)}${carreras.map(c => opt(c.id, c.nombre, f.car)).join("")}</select></label>
        <label class="sel"><span>Materia</span><select id="fm">${opt("", `Todas (${mats.length})`, f.mat)}${mats.map(m => opt(m.key, `${m.nombre} (${m.n})`, f.mat)).join("")}</select></label>
        <label class="sel"><span>Ordenar</span><select id="fo">${ORDENES.map(([v, l]) => opt(v, l, f.orden)).join("")}</select></label>
      </div>
      <button class="link fmas-btn" id="fMas" aria-expanded="${!!S.fMas}">${S.fMas ? "Menos filtros" : "Más filtros"}${activos ? ` (${activos} ${activos === 1 ? "activo" : "activos"})` : ""}</button>
      ${parciales.length > 1 ? `<div class="frow" role="group" aria-label="Parcial"><span class="flabel">Parcial</span><div class="chips">${chips("fp", [["", "Todos"], ...parciales.map(p => [p, p])], f.parcial)}</div></div>` : ""}
      <div class="frow" role="group" aria-label="Estado"><span class="flabel">Estado</span><div class="chips">${chips("fe", ESTADOS_TEST, f.estado)}</div></div>
      ${tags.length ? `<div class="frow" role="group" aria-label="Etiquetas"><span class="flabel">Etiquetas</span><div class="chips">${chips("ft", [["", "Todas"], ...tags.map(g => [g, "#" + g])], f.tag)}
        ${f.tag ? `<button class="link" id="followTag">${sigoTag ? `Dejar de seguir #${esc(f.tag)}` : `Seguir #${esc(f.tag)}`}</button>` : ""}</div></div>` : ""}
    </section>
    <div class="results-head"><p id="fcount" role="status"></p><div class="row"><button class="link" id="fclear" hidden>Limpiar filtros</button><button class="link" id="fshare">Copiar link de esta búsqueda</button></div></div>
    <details class="rank-panel" id="rkPanel" ${store.get("rankOpen") === "1" ? "open" : ""}>
      <summary>Ranking de ${esc(rkTitulo)}${miPos ? ` <span class="muted">· estás en el puesto ${miPos}</span>` : ""}</summary>
      ${rk.length ? `<ol class="mini-rank">${rk.slice(0, 5).map((r, i) => `<li class="${r.id === S.uid ? "is-me" : ""}"><span class="num">${i + 1}</span>${avatar(r.id)}${nm(r.id)}<span class="p">${r.pts}</span></li>`).join("")}</ol>` : `<p class="muted">Nadie sumó puntos acá todavía. Hacé un test y arrancás primero.</p>`}
      <button class="link" id="seeRank">Ver ranking completo</button>
    </details>
    <div id="results"></div></div>`;
  const rerender = (id, fn) => { fn(); S.refocus = id; render(); };
  $("#fu").onchange = e => rerender("fu", () => Object.assign(f, { uni: e.target.value, car: "", mat: "", parcial: "", tag: "", auto: false }));
  $("#fc").onchange = e => rerender("fc", () => Object.assign(f, { car: e.target.value, mat: "", parcial: "", tag: "", auto: false }));
  $("#fm").onchange = e => rerender("fm", () => Object.assign(f, { mat: e.target.value, parcial: "", tag: "" }));
  $("#fo").onchange = e => rerender("fo", () => f.orden = e.target.value);
  app.querySelectorAll("[data-fp]").forEach(b => b.onclick = () => { f.parcial = b.dataset.fp; render(); });
  app.querySelectorAll("[data-fe]").forEach(b => b.onclick = () => { f.estado = b.dataset.fe; render(); });
  app.querySelectorAll(".finder [data-ft]").forEach(b => b.onclick = () => { f.tag = b.dataset.ft; render(); });
  $("#fMas").onclick = () => { S.fMas = !S.fMas; S.refocus = "fMas"; render(); };
  let tm; $("#fq").oninput = e => { clearTimeout(tm); tm = setTimeout(() => { f.q = e.target.value.trim(); renderResults(base); }, 150); };
  $("#fclear").onclick = () => { Object.assign(f, { q: "", mat: "", parcial: "", estado: "", tag: "", orden: "" }); render(); };
  $("#fshare").onclick = async () => { try { await navigator.clipboard.writeText(location.href); toast("Link copiado. Compartilo con tu curso."); } catch { toast("No se pudo copiar el link"); } };
  $("#followTag")?.addEventListener("click", () => toggleSub("tags", f.tag, "#" + f.tag));
  $("#seenAll")?.addEventListener("click", () => saveSubs({ ...subs(), seenAt: Date.now() }));
  $("#rkPanel").ontoggle = e => store.set("rankOpen", e.target.open ? "1" : "0");
  $("#seeRank").onclick = () => {
    S.rankMateria = f.mat; S.rankScope = f.car && f.car === u.carreraId ? "carrera" : f.uni && f.uni === u.universidadId ? "uni" : "";
    go("#ranking");
  };
  renderResults(base);
  if (S.refocus) { $("#" + S.refocus)?.focus(); S.refocus = null; }
}
// Solo se redibuja la lista, así el buscador no pierde el foco mientras se escribe.
function renderResults(base) {
  const f = S.f, list = aplicarFiltros(f, base), box = $("#results"); if (!box) return;
  box.innerHTML = resultsHTML(list, f);
  $("#fcount").textContent = `${list.length} ${list.length === 1 ? "test" : "tests"}${f.q ? ` para “${f.q}”` : ""} en ${alcanceDe(f)}`;
  $("#fclear").hidden = !hayFiltros(f);
  box.querySelectorAll("[data-del]").forEach(b => b.onclick = () => deleteTest(b.dataset.del));
  box.querySelectorAll("[data-follow]").forEach(b => b.onclick = () => toggleSub("materias", b.dataset.follow, b.dataset.nombre));
  box.querySelectorAll("[data-ft]").forEach(b => b.onclick = () => { f.tag = b.dataset.ft; render(); window.scrollTo({ top: $(".finder").offsetTop - 80, behavior: reduceMotion() ? "auto" : "smooth" }); });
  box.querySelector("[data-clear]")?.addEventListener("click", () => { Object.assign(f, { q: "", mat: "", parcial: "", estado: "", tag: "", orden: "" }); render(); });
  box.querySelector("[data-widen]")?.addEventListener("click", () => { if (f.car) f.car = ""; else f.uni = ""; f.auto = false; render(); });
  paintNames(box);
  syncURL();
}
async function deleteTest(id) {
  const t = S.tests[id]; if (!t) return;
  if (!confirm(`¿Borrar “${t.titulo}”? Los puntos que se sumaron con este test dejan de contar.`)) return;
  try { const b = writeBatch(db); b.delete(doc(db, "tests", id)); b.delete(doc(db, "bodies", id)); await b.commit(); toast("Test borrado"); }
  catch (e) { toast("No se pudo borrar el test"); }
}

/* ---------- ranking ---------- */
function renderRanking() {
  const u = me(), uni = S.unis[u.universidadId], car = S.carreras[u.carreraId];
  const scopes = [["", "Todo Parcialito"]];
  if (u.universidadId) scopes.push(["uni", uni?.sigla || uni?.nombre || "Mi universidad"]);
  if (u.carreraId) scopes.push(["carrera", car?.nombre || "Mi carrera"]);
  if (!scopes.some(s => s[0] === S.rankScope)) S.rankScope = "";
  const scopePred = S.rankScope === "uni" ? t => t.universidadId === u.universidadId : S.rankScope === "carrera" ? t => t.carreraId === u.carreraId : () => true;
  const mats = materias(scopePred);
  if (S.rankMateria && !mats.some(m => m.key === S.rankMateria)) S.rankMateria = "";
  const pred = S.rankMateria ? t => scopePred(t) && matKey(t) === S.rankMateria : S.rankScope ? scopePred : null;
  const rows = ranking(data(), pred);
  const order = [1, 0, 2].filter(i => rows[i]);
  const titulo = S.rankMateria ? "de " + mats.find(m => m.key === S.rankMateria).nombre : S.rankScope ? "de " + scopes.find(s => s[0] === S.rankScope)[1] : "general";
  app.innerHTML = `<div class="wrap">
    <div class="rank-top"><h1>Ranking ${esc(titulo)}</h1></div>
    ${scopes.length > 1 ? `<div class="chips" role="group" aria-label="Alcance del ranking">${scopes.map(([k, l]) => `<button class="chip" data-scope="${k}" aria-pressed="${k === S.rankScope}">${esc(l)}</button>`).join("")}</div>` : ""}
    <div class="chips" role="group" aria-label="Filtrar por materia"><button class="chip" data-rm="" aria-pressed="${!S.rankMateria}">Todas las materias</button>${mats.map(m => `<button class="chip" data-rm="${esc(m.key)}" aria-pressed="${m.key === S.rankMateria}">${esc(m.nombre)}</button>`).join("")}</div>
    <p class="how">Cuenta tu mejor resultado en cada test: ${PTS.perQ} puntos por respuesta correcta, ${PTS.perfect} extra por test perfecto y ${PTS.upload} por cada test que subís. Repetir solo suma si mejorás tu marca.${!u.carreraId ? ` <a href="#perfil">Completá tu perfil</a> para ver el ranking de tu carrera.` : ""}</p>
    ${rows.length ? `
      <div class="podium">${order.map(i => { const r = rows[i]; return `<div class="pod p${i + 1}">${avatar(r.id)}<span class="nm" data-nm="${esc(r.id)}"></span><span class="pts">${r.pts}</span><div class="block">${i + 1}</div></div>`; }).join("")}<div class="podium-base"></div></div>
      <div class="tblwrap"><table class="rank"><thead><tr><th>#</th><th>Participante</th><th class="r">Puntos</th><th class="r">Tests</th><th class="r hide-sm">Perfectos</th><th class="r hide-sm">Subidos</th><th class="r hide-sm">Promedio</th></tr></thead><tbody>
      ${rows.map((r, i) => `<tr class="${r.id === S.uid ? "is-me" : ""}"><td class="pos">${i + 1}</td><td><span class="who">${avatar(r.id)}${nm(r.id)}</span></td><td class="r pts">${r.pts}</td><td class="r">${r.done}</td><td class="r hide-sm">${r.perfect}</td><td class="r hide-sm">${r.uploads}</td><td class="r hide-sm">${r.avg == null ? "–" : Math.round(r.avg * 100) + "%"}</td></tr>`).join("")}
      </tbody></table></div>`
    : `<div class="empty"><p>Nadie sumó puntos ${S.rankMateria || S.rankScope ? "acá " : ""}todavía. Hacé un test y arrancás primero.</p><a class="btn" href="#tests">Ir a los tests</a></div>`}
  </div>`;
  app.querySelectorAll("[data-scope]").forEach(b => b.onclick = () => { S.rankScope = b.dataset.scope; render(); });
  app.querySelectorAll("[data-rm]").forEach(b => b.onclick = () => { S.rankMateria = b.dataset.rm; render(); });
}

/* ---------- test ---------- */
async function startTest(id) {
  S.run = { id, meta: S.tests[id] || null, body: null, sel: {}, graded: {}, order: null, shuffle: false, saved: false, result: null, error: false };
  try {
    const snap = await getDoc(doc(db, "bodies", id));
    if (!snap.exists()) throw new Error("missing");
    if (S.run?.id !== id) return;
    S.run.body = snap.data(); S.run.order = S.run.body.questions.map((_, i) => i);
  } catch (e) { if (S.run?.id === id) S.run.error = true; }
  if (S.view === "test" && S.run?.id === id) render();
}
function qHTML(i, pos) {
  const R = S.run, q = R.body.questions[i], sel = R.sel[i] || new Set(), graded = i in R.graded, key = new Set(q.key);
  const opts = q.opts.map((t, j) => {
    let cls = "", mark = "";
    if (graded) {
      if (sel.has(j) && key.has(j)) { cls = "hit"; mark = "Correcta"; }
      else if (sel.has(j)) { cls = "wrong"; mark = "Incorrecta"; }
      else if (key.has(j)) { cls = "miss"; mark = "Faltó marcar"; }
    }
    return `<li class="opt ${cls}"><label><input type="checkbox" data-q="${i}" value="${j}" ${sel.has(j) ? "checked" : ""} ${graded ? "disabled" : ""}><span class="bub" aria-hidden="true">${letter(j)}</span><span class="txt">${inline(t)}</span>${mark ? `<span class="mark">${mark}</span>` : ""}</label></li>`;
  }).join("");
  let foot;
  if (graded) { const p = R.graded[i], cls = p === 1 ? "v-full" : p === 0.5 ? "v-half" : "v-zero"; foot = `<span class="${cls}"><b>${p === 1 ? "+10." : p === 0.5 ? "+5." : "0."}</b> Correctas: ${q.key.map(letter).join(", ")}. ${inline(q.why || "")}</span>`; }
  else foot = `<button class="link" data-check="${i}">Comprobar esta pregunta</button>`;
  const caseBtn = q.case ? `<button class="q-case" data-case="${i}" aria-expanded="false">Caso ${esc(q.case)}</button>` : "";
  return `<article class="q ${graded ? "graded" : ""}" id="q-${i}"><div class="q-head"><span class="q-n">${pos + 1}</span><p class="q-stem">${caseBtn}${inline(q.stem)}</p></div>
    <div class="q-case-text" id="ct-${i}" hidden>${q.case ? caseBody(q.case) : ""}</div><ul class="opts">${opts}</ul><div class="q-foot">${foot}</div></article>`;
}
function caseBody(id) { const c = (S.run.body.cases || []).find(c => c.id === id); return c ? sanitize(c.html) : ""; }
function runScore() { const v = Object.values(S.run.graded); return { pts: v.reduce((a, b) => a + b, 0), done: v.length }; }
function sheetHTML() {
  const R = S.run, n = R.body.questions.length, sc = runScore();
  const bubs = R.order.map((i, pos) => {
    let c = "";
    if (i in R.graded) c = R.graded[i] === 1 ? "ok" : R.graded[i] === 0.5 ? "half" : "bad";
    else if (R.sel[i]) c = "ans";
    return `<button data-jump="${i}" aria-label="Ir a la pregunta ${pos + 1}"><span class="bub ${c}">${pos + 1}</span></button>`;
  }).join("");
  const answered = R.order.filter(i => R.sel[i] || i in R.graded).length;
  return `<h2>Hoja de respuestas</h2><p class="sub">${answered} de ${n} respondidas</p>
    <div class="grid-bubs">${bubs}</div>
    <div class="sheet-score"><span class="muted">${sc.done ? `${sc.done} corregidas` : "Puntaje"}</span><b>${fmt(sc.pts)}<span class="muted" style="font-size:1rem"> / ${n}</span></b></div>
    ${R.saved ? `<button class="btn" id="again">Hacerlo de nuevo</button>` : `<button class="btn" id="finish">Terminar y sumar puntos</button>`}
    ${R.saved ? "" : `<label class="opt-shuf"><input type="checkbox" id="shuf" ${R.shuffle ? "checked" : ""}> Mezclar el orden</label>`}
    <div class="legend"><span><i style="background:var(--ink);border-color:var(--ink)"></i>Respondida</span><span><i style="background:var(--ok);border-color:var(--ok)"></i>Bien</span><span><i style="background:var(--half);border-color:var(--half)"></i>Parcial</span><span><i style="background:var(--bad);border-color:var(--bad)"></i>Mal</span></div>`;
}
function renderTest() {
  const R = S.run; if (!R) return;
  const m = R.meta || S.tests[R.id];
  if (!m && !R.body && !R.error) { app.innerHTML = `<div class="wrap"><p class="muted">Cargando el test…</p></div>`; return; }
  if (R.error || !m) { app.innerHTML = `<div class="wrap"><div class="empty"><p><b>Este test no existe o fue borrado.</b></p><a class="btn" href="#tests">Volver a los tests</a></div></div>`; return; }
  R.meta = m;
  const mejor = pctMio({ id: R.id }), tags = m.tags || [];
  const head = `<div class="test-head"><div class="crumbs"><a class="link" href="#tests">Tests</a><span>/</span><a class="link" href="${hrefFiltro(m, { m: matKey(m) })}">${esc(matNombreDe(m))}</a><span>/</span><span>${esc(m.parcial)}</span></div>
    <h1>${esc(m.titulo)}</h1>
    <div class="test-meta"><span>${m.n} preguntas</span><span>subido por ${nm(m.autor)}</span>${m.carreraId ? `<span>${esc(etiquetaUbicacion(m))}</span>` : ""}${mejor != null ? `<span>tu mejor: <b>${Math.round(mejor * 100)}%</b></span>` : ""}</div>
    ${tags.length ? `<div class="test-tags" aria-label="Etiquetas">${tags.map(g => `<a class="tagchip" href="${hrefFiltro(m, { t: g })}" title="Ver más tests con #${esc(g)}">#${esc(g)}</a>`).join("")}</div>` : ""}
    ${R.body?.intro ? `<p>${inline(R.body.intro)}</p>` : ""}</div>`;
  if (!R.body) { app.innerHTML = `<div class="wrap">${head}<p class="muted">Cargando preguntas…</p></div>`; return; }
  const cases = R.body.cases || [];
  app.innerHTML = `<div class="wrap"><div class="test"><div>${head}
    ${R.result ? resultHTML(R.result) + relatedHTML(R.id, m) : ""}
    ${cases.length ? `<div class="cases">${cases.map(c => `<details class="case"><summary><span class="cid">${esc(c.id)}</span>${esc(c.title || "")}</summary><div class="case-body">${sanitize(c.html)}</div></details>`).join("")}</div>` : ""}
    ${R.order.map((i, pos) => qHTML(i, pos)).join("")}
    </div><aside class="answer-sheet" id="sheet">${sheetHTML()}</aside></div></div>`;
  bindTest();
}
function refreshSheet() { const el = $("#sheet"); if (el) { el.innerHTML = sheetHTML(); bindSheet(); } }
function bindSheet() {
  const R = S.run;
  app.querySelectorAll("[data-jump]").forEach(b => b.onclick = () => document.getElementById("q-" + b.dataset.jump)?.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "start" }));
  $("#finish")?.addEventListener("click", finish);
  $("#again")?.addEventListener("click", () => { startTest(R.id); render(); window.scrollTo(0, 0); });
  const sh = $("#shuf"); if (sh) sh.onchange = () => {
    R.shuffle = sh.checked; R.order = R.body.questions.map((_, i) => i);
    if (R.shuffle) for (let i = R.order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [R.order[i], R.order[j]] = [R.order[j], R.order[i]]; }
    renderTest();
  };
}
function bindTest() {
  const R = S.run;
  app.querySelectorAll("input[data-q]").forEach(cb => cb.onchange = () => {
    const i = +cb.dataset.q, s = R.sel[i] || (R.sel[i] = new Set());
    cb.checked ? s.add(+cb.value) : s.delete(+cb.value);
    if (!s.size) delete R.sel[i];
    refreshSheet();
  });
  app.querySelectorAll("[data-check]").forEach(b => b.onclick = () => {
    const i = +b.dataset.check; R.graded[i] = points(R.body.questions[i], R.sel[i] || new Set());
    const open = !$("#ct-" + i).hidden; $("#q-" + i).outerHTML = qHTML(i, R.order.indexOf(i));
    if (open) toggleCase(i, true);
    bindTest(); refreshSheet();
  });
  app.querySelectorAll("[data-case]").forEach(b => b.onclick = () => toggleCase(+b.dataset.case));
  bindSheet();
}
function toggleCase(i, force) { const box = $("#ct-" + i), btn = document.querySelector(`#q-${i} .q-case`); const show = force ?? box.hidden; box.hidden = !show; btn?.setAttribute("aria-expanded", show); }
// Link a la lista de tests filtrada en la carrera del test (por materia, etiqueta, etc.).
function hrefFiltro(t, extra) {
  const p = new URLSearchParams();
  if (t.universidadId) p.set("u", t.universidadId);
  if (t.carreraId) p.set("c", t.carreraId);
  for (const [k, v] of Object.entries(extra)) p.set(k, v);
  return "#tests?" + p;
}
// Tests parecidos para seguir practicando: comparten etiquetas o materia; primero los que no hiciste.
function relatedHTML(id, m) {
  const tags = new Set(m.tags || []), key = matKey(m);
  const afinidad = t => (t.tags || []).filter(g => tags.has(g)).length * 2 + (matKey(t) === key ? 1 : 0);
  const list = testList().filter(t => t.id !== id && afinidad(t) > 0 && (!m.universidadId || t.universidadId === m.universidadId))
    .sort((a, b) => (pctMio(a) == null ? 0 : 1) - (pctMio(b) == null ? 0 : 1) || afinidad(b) - afinidad(a)).slice(0, 4);
  if (!list.length) return "";
  return `<section class="related" aria-label="Seguí practicando"><h2>Seguí practicando</h2><ul>${list.map(t => {
    const p = pctMio(t);
    return `<li><a href="#t/${encodeURIComponent(t.id)}"><b>${esc(t.titulo)}</b><span class="muted">${esc(matNombreDe(t))} · ${t.n} preguntas · ${p == null ? "sin hacer" : `tu mejor ${Math.round(p * 100)}%`}</span>${(t.tags || []).length ? `<span class="tags">${t.tags.slice(0, 3).map(g => `<span>#${esc(g)}</span>`).join("")}</span>` : ""}</a></li>`;
  }).join("")}</ul></section>`;
}
function resultHTML(r) {
  return `<div class="result" id="result"><div class="big">${fmt(r.score)}<small> / ${r.max}</small></div><div>
    <p><b>${r.gained > 0 ? `<span class="gain">+${r.gained} puntos</span>` : r.first ? "Guardado." : `No superaste tu marca de ${fmt(r.prevBest)}, así que tus puntos no cambian.`}</b>${r.perfect ? ` Test perfecto: incluye ${PTS.perfect} de bonus.` : ""}</p>
    <p class="muted">${r.pos ? `Estás en el puesto ${r.pos} de ${r.of} en el ranking general${r.prevPos && r.prevPos > r.pos ? `: subiste ${r.prevPos - r.pos} ${r.prevPos - r.pos === 1 ? "lugar" : "lugares"}` : ""}.` : ""}${r.saveError ? " No se pudo guardar el puntaje: revisá tu conexión. Se reintenta solo cuando vuelva." : ""}</p>
    <div class="row"><a class="btn small" href="#ranking">Ver ranking</a><a class="btn small ghost" href="#progreso">Ver mi progreso</a><a class="btn small ghost" href="#tests">Elegir otro test</a></div></div></div>`;
}
async function finish() {
  const R = S.run, Q = R.body.questions, m = R.meta;
  const pending = Q.filter((_, i) => !(i in R.graded) && !R.sel[i]).length;
  if (pending && !confirm(`Te ${pending === 1 ? "queda 1 pregunta" : `quedan ${pending} preguntas`} sin responder y cuentan como 0. ¿Terminar igual?`)) return;
  Q.forEach((q, i) => { if (!(i in R.graded)) R.graded[i] = points(q, R.sel[i] || new Set()); });
  const score = Object.values(R.graded).reduce((a, b) => a + b, 0), max = Q.length;
  const prevPts = statsFor(data(), S.uid).pts, prevPos = ranking(data()).findIndex(r => r.id === S.uid) + 1 || null;
  const cur = S.scores[S.uid] || {}, old = cur.tests?.[R.id];
  const result = { score, max, first: !old, prevBest: old?.best ?? 0, perfect: score >= max && !(old && old.best >= old.max), prevPos };
  const tests = { ...(cur.tests || {}) };
  tests[R.id] = { best: Math.max(score, old?.best ?? 0), max, tries: (old?.tries || 0) + 1, last: score, at: Date.now() };
  const days = [...new Set([...(cur.days || []), ymd()])].sort().slice(-90);
  const next = { tests, days, updatedAt: Date.now() };
  S.scores[S.uid] = next; R.saved = true;
  // Con caché local, setDoc confirma recién cuando llega al servidor: no bloqueamos la pantalla esperándolo.
  setDoc(doc(db, "scores", S.uid), next).catch(() => toast("No se pudo guardar el puntaje. Revisá tu conexión y repetí el test."));
  // Historial de intentos: lo usa "Mi progreso". No toca scores, así el ranking no cambia.
  addDoc(collection(db, "attempts"), { uid: S.uid, testId: R.id, materia: m.materia || "", materiaId: m.materiaId || null, carreraId: m.carreraId || null, universidadId: m.universidadId || null, score, max, at: Date.now() }).catch(() => {});
  result.gained = Math.max(0, statsFor(data(), S.uid).pts - prevPts);
  const rk = ranking(data()); result.pos = rk.findIndex(r => r.id === S.uid) + 1 || null; result.of = rk.length;
  R.result = result; render();
  $("#result")?.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "center" });
}

/* ================= Subir ================= */
function popularTags(pred) {
  const c = {}; testList().forEach(t => { if (pred(t)) (t.tags || []).forEach(g => c[g] = (c[g] || 0) + 1); });
  return Object.entries(c).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es")).slice(0, 12).map(e => e[0]);
}
function renderUpload() {
  const U = S.up, u = me();
  if (!u.carreraId) { app.innerHTML = `<div class="wrap"><div class="empty"><p><b>Antes de subir, contanos de qué universidad y carrera sos.</b></p><p>Así el test queda en la materia correcta y lo encuentra tu curso.</p><a class="btn" href="#perfil">Completar perfil</a></div></div>`; return; }
  const uni = S.unis[u.universidadId], car = S.carreras[u.carreraId];
  const mats = Object.values(S.mats).filter(m => m.carreraId === u.carreraId).map(m => m.nombre).sort((a, b) => a.localeCompare(b, "es"));
  const parcs = [...new Set(["1er parcial", "2do parcial", "Recuperatorio", "Final", ...testList().map(t => t.parcial)])];
  const sug = popularTags(t => t.carreraId === u.carreraId);
  const modes = [["texto", "Escribir o pegar"], ["archivo", "Desde un archivo"], ["ia", "Con ayuda de una IA"]];
  U.materia ??= matNombre(S.f?.mat || "");
  app.innerHTML = `<div class="wrap"><div class="up"><section>
    <h1>Subir un test</h1>
    <p class="lead">Cada test que subís le sirve a todo el curso y te suma ${PTS.upload} puntos en el ranking.</p>
    <div class="card"><h2><span class="bub fill">1</span>¿De qué es?</h2>
      <p class="hint-line">Se publica en <b>${esc(car?.nombre || "tu carrera")}</b>${uni ? ` · ${esc(uni.sigla || uni.nombre)}` : ""}. <a href="#perfil">Cambiar</a></p>
      <div class="fields">
      <div class="field"><label for="f-mat">Materia</label><input id="f-mat" list="dl-mat" value="${esc(U.materia || "")}" placeholder="Ej.: Minería de Datos" autocomplete="off"><datalist id="dl-mat">${mats.map(m => `<option value="${esc(m)}">`).join("")}</datalist></div>
      <div class="field"><label for="f-par">Parcial</label><input id="f-par" list="dl-par" value="${esc(U.parcial || "")}" placeholder="Ej.: 1er parcial" autocomplete="off"><datalist id="dl-par">${parcs.map(p => `<option value="${esc(p)}">`).join("")}</datalist></div>
      <div class="field full"><label for="f-tit">Título del test</label><input id="f-tit" value="${esc(U.titulo || "")}" placeholder="Ej.: Simulacro 2025, tema A"><div class="hint">Si el archivo trae varios tests (por ejemplo, uno por unidad), cada uno usa su propio título.</div></div>
      <div class="field full"><label for="f-tags">Etiquetas</label><input id="f-tags" value="${esc(U.tags || "")}" placeholder="Ej.: 2025, simulacro, unidad 3" autocomplete="off"><div class="hint">Separadas por coma, hasta 8. Ayudan a que otros encuentren el test y lo sigan.</div>
        ${sug.length ? `<div class="tag-sug" aria-label="Etiquetas usadas en tu carrera">${sug.map(g => `<button type="button" class="chip small" data-addtag="${esc(g)}">#${esc(g)}</button>`).join("")}</div>` : ""}</div>
    </div></div>
    <div class="card"><h2><span class="bub fill">2</span>Las preguntas</h2>
      <div class="modes" role="group" aria-label="Cómo cargar las preguntas">${modes.map(([k, l]) => `<button class="chip" data-mode="${k}" aria-pressed="${U.mode === k}">${l}</button>`).join("")}</div>
      <div id="mode-body">${modeBody()}</div>
      <div id="preview">${previewHTML()}</div>
      <div class="row-end"><button class="btn" id="publish" ${U.parsed && !U.error && !U.busy ? "" : "disabled"}>Publicar test</button><span class="muted" id="pubmsg"></span></div>
    </div>
  </section>
  <aside class="help"><h3>Cómo escribir un test</h3>
    <ul><li>Numerá las preguntas: <b>1.</b>, <b>2.</b></li><li>Las opciones van con letra: <b>a)</b>, <b>b)</b></li><li>Poné <b>*</b> delante de cada opción correcta. Puede haber más de una.</li><li>Una línea que empieza con <b>&gt;</b> es la explicación que se ve al corregir.</li><li>Opcional: un caso con <b>### Caso A1: título</b>, y las preguntas que lo usan terminan en <b>(Caso A1)</b>.</li></ul>
    <pre>${esc(EXAMPLE)}</pre>
    <p class="muted" style="margin:0">También acepta archivos .json y los HTML de evaluaciones por unidad.</p></aside></div></div>`;
  const keep = () => { U.materia = $("#f-mat").value; U.parcial = $("#f-par").value; U.titulo = $("#f-tit").value; U.tags = $("#f-tags").value; };
  ["#f-mat", "#f-par", "#f-tit", "#f-tags"].forEach(s => $(s).oninput = keep);
  app.querySelectorAll("[data-addtag]").forEach(b => b.onclick = () => {
    const inp = $("#f-tags"), cur = normTags(inp.value);
    if (!cur.includes(b.dataset.addtag)) { inp.value = [...cur, b.dataset.addtag].join(", "); keep(); }
  });
  app.querySelectorAll("[data-mode]").forEach(b => b.onclick = () => { keep(); U.mode = b.dataset.mode; U.parsed = null; U.error = null; renderUpload(); });
  bindMode();
  $("#publish").onclick = publish;
}
function modeBody() {
  const U = S.up;
  if (U.mode === "archivo") return `<div class="drop" id="drop"><p>Arrastrá un archivo .txt, .json o .html acá</p><label class="btn ghost small">Elegir archivo<input type="file" id="file" accept=".txt,.json,.html,.htm,.md" hidden></label>${U.fileName ? `<p class="muted" style="margin:12px 0 0">${esc(U.fileName)}</p>` : ""}</div>`;
  if (U.mode === "ia") return `<ol class="ai-steps"><li>Pegá un parcial viejo o tus apuntes y tocá <b>Copiar instrucciones</b>.</li><li>Pegalo en Claude, ChatGPT o la IA que uses.</li><li>Copiá lo que te responda y pegalo en el segundo cuadro. Revisá las respuestas antes de publicar.</li></ol>
    <div class="field"><label for="f-raw">Material</label><textarea class="short" id="f-raw" placeholder="Un parcial viejo con sus respuestas, preguntas sueltas o tus apuntes de la unidad.">${esc(U.raw || "")}</textarea></div>
    <div class="row-end" style="margin:10px 0 16px"><button class="btn ghost small" id="copyPrompt">Copiar instrucciones</button></div>
    <div class="field"><label for="f-ai">Respuesta de la IA</label><textarea class="short" id="f-ai" placeholder='{"titulo": "…", "questions": [ … ]}'>${esc(U.aiOut || "")}</textarea></div>`;
  return `<div class="field"><label for="f-txt">Preguntas</label><textarea id="f-txt" placeholder="${esc(EXAMPLE)}">${esc(U.text || "")}</textarea></div>`;
}
function previewHTML() {
  const U = S.up;
  if (U.error) return `<div class="preview err"><b>Hay que corregir algunas cosas:</b><ul>${(Array.isArray(U.error) ? U.error : [U.error]).slice(0, 8).map(e => `<li>${esc(e)}</li>`).join("")}</ul></div>`;
  if (!U.parsed) return "";
  const ts = U.parsed.tests;
  return `<div class="preview"><b>Listo para publicar: ${ts.length === 1 ? `${ts[0].questions.length} ${ts[0].questions.length === 1 ? "pregunta" : "preguntas"}` : `${ts.length} tests, ${ts.reduce((a, t) => a + t.questions.length, 0)} preguntas en total`}.</b>
    ${ts.slice(0, 3).map(t => `${ts.length > 1 ? `<div class="pq"><b>${esc(t.titulo || "Sin título")}</b></div>` : ""}${t.questions.slice(0, ts.length > 1 ? 1 : 3).map((q, i) => `<div class="pq">${i + 1}. ${inline(q.stem)} <span class="muted">(${q.opts.length} opciones, correcta${q.key.length > 1 ? "s" : ""}: ${q.key.map(letter).join(", ")})</span></div>`).join("")}`).join("")}</div>`;
}
function setParsed(p) {
  const U = S.up, errs = validate(p); U.parsed = p; U.error = errs.length ? errs : null;
  if (p.tests.length === 1) {
    const t = p.tests[0];
    if (t.materia && !$("#f-mat").value) $("#f-mat").value = U.materia = t.materia;
    if (t.parcial && !$("#f-par").value) $("#f-par").value = U.parcial = t.parcial;
    if (t.titulo && !$("#f-tit").value) $("#f-tit").value = U.titulo = t.titulo;
    if (t.tags?.length && !$("#f-tags").value) $("#f-tags").value = U.tags = t.tags.join(", ");
  }
  showPreview();
}
function setError(msg) { S.up.parsed = null; S.up.error = [msg]; showPreview(); }
function clearPreview() { S.up.parsed = null; S.up.error = null; showPreview(); }
function showPreview() { $("#preview").innerHTML = previewHTML(); $("#publish").disabled = !S.up.parsed || !!S.up.error || S.up.busy; }
function bindMode() {
  const U = S.up;
  const ta = $("#f-txt");
  if (ta) { let tm; ta.oninput = () => { U.text = ta.value; clearTimeout(tm); tm = setTimeout(() => ta.value.trim() ? setParsed(parseText(ta.value)) : clearPreview(), 350); }; if (U.text) setParsed(parseText(U.text)); }
  const raw = $("#f-raw"); if (raw) raw.oninput = () => U.raw = raw.value;
  $("#copyPrompt")?.addEventListener("click", async () => {
    const m = (U.raw || "").trim(); if (!m) { toast("Pegá primero el material"); return; }
    try { await navigator.clipboard.writeText(AI_PROMPT(m.slice(0, 60000))); toast("Instrucciones copiadas. Pegalas en tu IA."); }
    catch { toast("No se pudo copiar. Seleccioná el texto a mano."); }
  });
  const ai = $("#f-ai");
  if (ai) { let tm; ai.oninput = () => { U.aiOut = ai.value; clearTimeout(tm); tm = setTimeout(() => { if (!ai.value.trim()) return clearPreview(); try { setParsed(parseJSONData(extractJSON(ai.value))); } catch (e) { setError(e.message.startsWith("No encontré") ? e.message : "La respuesta no es un JSON válido. Copiala completa, sin cortar el final."); } }, 350); }; if (U.aiOut) ai.oninput(); }
  const drop = $("#drop"), file = $("#file");
  if (drop) {
    const read = async f => {
      U.fileName = f.name;
      try {
        const txt = await f.text();
        const p = /\.html?$/i.test(f.name) ? parseHTMLFile(txt) : /\.json$/i.test(f.name) ? parseJSONData(JSON.parse(txt)) : parseText(txt);
        renderModeOnly(); setParsed(p);
      } catch (e) { renderModeOnly(); setError(e instanceof SyntaxError ? "No se pudo leer el archivo: el JSON tiene un error de formato." : (e.message || "No se pudo leer el archivo.")); }
    };
    file.onchange = () => file.files[0] && read(file.files[0]);
    drop.ondragover = e => { e.preventDefault(); drop.classList.add("over"); };
    drop.ondragleave = () => drop.classList.remove("over");
    drop.ondrop = e => { e.preventDefault(); drop.classList.remove("over"); const f = e.dataTransfer.files[0]; if (f) read(f); };
  }
}
function renderModeOnly() { $("#mode-body").innerHTML = modeBody(); bindMode(); }
async function publish() {
  const U = S.up, u = me(); if (!U.parsed || U.error) return;
  const materia = norm($("#f-mat").value), parcial = norm($("#f-par").value), titulo = norm($("#f-tit").value), tags = normTags($("#f-tags").value);
  const ts = U.parsed.tests;
  if (!materia || !parcial) { toast("Completá materia y parcial"); return; }
  if (!slug(materia)) { toast("El nombre de la materia necesita letras o números"); return; }
  if (ts.length === 1 && !titulo && !ts[0].titulo) { toast("Ponele un título al test"); return; }
  U.busy = true; $("#publish").disabled = true; $("#pubmsg").textContent = "Publicando…";
  try {
    const materiaId = materiaIdOf(u.carreraId, materia);
    // Se pregunta al servidor y no al catálogo local, que puede no estar al día: crear una materia que ya existe falla.
    const matSnap = await getDoc(doc(db, "materias", materiaId));
    const nombreMat = (matSnap.exists() ? matSnap.data().nombre : materia).slice(0, 120);
    for (const [k, t] of ts.entries()) {
      const ref = doc(collection(db, "tests"));
      const b = writeBatch(db);
      if (k === 0 && !matSnap.exists()) b.set(doc(db, "materias", materiaId), { nombre: nombreMat, carreraId: u.carreraId, universidadId: u.universidadId, creadoPor: S.uid, createdAt: Date.now() });
      b.set(doc(db, "bodies", ref.id), { autor: S.uid, intro: t.intro || "", cases: t.cases || [], questions: t.questions });
      b.set(ref, {
        materia: nombreMat, materiaId, carreraId: u.carreraId, universidadId: u.universidadId, parcial: parcial.slice(0, 80),
        titulo: (ts.length === 1 ? (titulo || t.titulo) : (t.titulo || `${titulo || "Test"} ${k + 1}`)).slice(0, 160),
        tags: tags.length ? tags : normTags(t.tags || []), n: t.questions.length, autor: S.uid, orden: t.orden ?? null, createdAt: Date.now() + k
      });
      await b.commit();
    }
    S.f = { ...filtrosVacios(), uni: u.universidadId, car: u.carreraId, mat: materiaId, auto: false };
    S.up ={ mode: U.mode, parsed: null, error: null, busy: false, materia: nombreMat, parcial };
    toast(ts.length === 1 ? `Test publicado: +${PTS.upload} puntos` : `${ts.length} tests publicados: +${PTS.upload * ts.length} puntos`);
    go("#tests");
  } catch (e) {
    U.busy = false; $("#pubmsg").textContent = "";
    toast(e.code === "permission-denied" ? "Firebase rechazó el test: revisá que materia, parcial y título no estén vacíos." : e.code === "invalid-argument" ? "El test es demasiado grande. Dividilo en partes." : "No se pudo publicar. Probá de nuevo en un momento.");
    $("#publish").disabled = false;
  }
}

/* ================= Mi progreso ================= */
const pctOf = a => a.max ? a.score / a.max : 0;
const pctTxt = v => v == null ? "–" : Math.round(v * 100) + "%";
const avgPct = xs => xs.length ? xs.reduce((s, a) => s + pctOf(a), 0) / xs.length : null;
const tipText = a => `${fecha(a.at)} · ${S.tests[a.testId]?.titulo || "Test borrado"} · ${fmt(a.score)}/${a.max} (${pctTxt(pctOf(a))})`;
function tendencia(xs) {
  if (xs.length < 4) return "–";
  const k = Math.min(3, Math.floor(xs.length / 2)), d = Math.round((avgPct(xs.slice(-k)) - avgPct(xs.slice(0, k))) * 100);
  return d > 0 ? `↑ +${d} p.p.` : d < 0 ? `↓ ${d} p.p.` : "= sin cambio";
}
function renderProgreso() {
  const all = [...S.attempts].sort((a, b) => a.at - b.at);
  if (!all.length) {
    app.innerHTML = `<div class="wrap"><h1 class="page-title">Mi progreso</h1><div class="empty"><p><b>Todavía no hay intentos guardados.</b></p><p>Desde esta versión, cada test que terminás queda en tu historial y acá ves cómo venís en cada materia.</p><a class="btn" href="#tests">Hacer un test</a></div></div>`;
    return;
  }
  const porMat = new Map();
  all.forEach(a => { const k = matKey(a); const e = porMat.get(k) || { key: k, nombre: S.mats[a.materiaId]?.nombre || a.materia || "Sin materia", xs: [] }; e.xs.push(a); porMat.set(k, e); });
  const mats = [...porMat.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  if (S.progMat && !porMat.has(S.progMat)) S.progMat = "";
  const list = S.progMat ? porMat.get(S.progMat).xs : all;
  const now = Date.now(), D30 = 30 * 864e5;
  const rec = avgPct(list.filter(a => a.at > now - D30)), prev = avgPct(list.filter(a => a.at <= now - D30 && a.at > now - 2 * D30));
  const delta = rec != null && prev != null ? Math.round((rec - prev) * 100) : null;
  S.chartPts = list.slice(-60);
  app.innerHTML = `<div class="wrap">
    <h1 class="page-title">Mi progreso</h1>
    <div class="chips" role="group" aria-label="Filtrar por materia"><button class="chip" data-pm="" aria-pressed="${!S.progMat}">Todas</button>${mats.map(m => `<button class="chip" data-pm="${esc(m.key)}" aria-pressed="${m.key === S.progMat}">${esc(m.nombre)}</button>`).join("")}</div>
    <section class="stat-row" aria-label="Resumen">
      <div class="form-field"><small>Intentos</small><span class="num">${list.length}</span></div>
      <div class="form-field"><small>Tests distintos</small><span class="num">${new Set(list.map(a => a.testId)).size}</span></div>
      <div class="form-field"><small>Promedio, últimos 30 días</small><span class="num">${pctTxt(rec)}</span></div>
      <div class="form-field"><small>Contra los 30 días anteriores</small><span class="num">${delta == null ? "–" : `${delta > 0 ? "+" : ""}${delta} p.p.`}</span></div>
    </section>
    <figure class="chart"><figcaption>Puntaje de cada intento${list.length > 60 ? " (últimos 60)" : ""}</figcaption>
      <div class="chart-box" id="chartBox"></div><p class="ax-note">Intentos, del más viejo al más nuevo. Pasá el mouse o el foco por un punto para ver el detalle.</p></figure>
    ${!S.progMat && mats.length ? `<h2 class="sec-title">Por materia</h2>
      <div class="tblwrap"><table class="rank"><thead><tr><th>Materia</th><th class="r">Intentos</th><th class="r">Último</th><th class="r hide-sm">Mejor</th><th class="r hide-sm">Promedio</th><th class="r">Tendencia</th></tr></thead><tbody>
      ${mats.map(m => `<tr><td><button class="link" data-pm="${esc(m.key)}">${esc(m.nombre)}</button></td><td class="r">${m.xs.length}</td><td class="r">${pctTxt(pctOf(m.xs[m.xs.length - 1]))}</td><td class="r hide-sm">${pctTxt(Math.max(...m.xs.map(pctOf)))}</td><td class="r hide-sm">${pctTxt(avgPct(m.xs))}</td><td class="r nowrap">${tendencia(m.xs)}</td></tr>`).join("")}
      </tbody></table></div>` : ""}
    <details class="hist"><summary>Ver todos los intentos como tabla</summary>
      <div class="tblwrap"><table class="rank"><thead><tr><th>Fecha</th><th>Test</th><th class="hide-sm">Materia</th><th class="r">Puntaje</th></tr></thead><tbody>
      ${[...list].reverse().map(a => `<tr><td>${fecha(a.at)}</td><td>${esc(S.tests[a.testId]?.titulo || "Test borrado")}</td><td class="hide-sm">${esc(S.mats[a.materiaId]?.nombre || a.materia || "")}</td><td class="r">${fmt(a.score)}/${a.max} · ${pctTxt(pctOf(a))}</td></tr>`).join("")}
      </tbody></table></div></details>
  </div>`;
  app.querySelectorAll("[data-pm]").forEach(b => b.onclick = () => { S.progMat = b.dataset.pm; render(); });
  drawChart();
}
// El SVG se dibuja al ancho real del contenedor para que el texto no se achique en el celular.
function drawChart() {
  const box = $("#chartBox"), pts = S.chartPts || []; if (!box || !pts.length) return;
  const W = Math.max(280, box.clientWidth), H = 220, L = 44, R = 48, T = 14, B = 14, w = W - L - R, h = H - T - B, n = pts.length;
  const x = i => L + (n === 1 ? w / 2 : i * w / (n - 1)), y = v => T + h - v * h;
  const xy = (a, i) => [x(i).toFixed(1), y(pctOf(a)).toFixed(1)];
  const grid = [0, 0.5, 1].map(v => `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="ax" x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${v * 100}%</text>`).join("");
  const line = n > 1 ? `<polyline class="ln" points="${pts.map((a, i) => xy(a, i).join(",")).join(" ")}"/>` : "";
  const dots = pts.map((a, i) => { const [cx, cy] = xy(a, i); return `<circle class="pt" cx="${cx}" cy="${cy}" r="4"/>`; }).join("");
  const [lx, ly] = xy(pts[n - 1], n - 1);
  const label = `<text class="lab" x="${+lx + 9}" y="${+ly + 4}">${pctTxt(pctOf(pts[n - 1]))}</text>`;
  const hits = pts.map((a, i) => { const [cx, cy] = xy(a, i); return `<circle class="hit" data-i="${i}" cx="${cx}" cy="${cy}" r="12" tabindex="0" role="img" aria-label="${esc(tipText(a))}"/>`; }).join("");
  box.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="group" aria-label="Puntaje de cada intento">${grid}${line}${dots}${label}${hits}</svg><div class="tip" id="tip" hidden></div>`;
  const tip = $("#tip");
  const show = el => {
    tip.textContent = tipText(pts[+el.dataset.i]); tip.hidden = false;
    const bx = box.getBoundingClientRect(), r = el.getBoundingClientRect();
    tip.style.left = Math.min(Math.max(r.left - bx.left + r.width / 2, 100), bx.width - 100) + "px";
    tip.style.top = (r.top - bx.top - 6) + "px";
  };
  const hide = () => tip.hidden = true;
  box.querySelectorAll(".hit").forEach(el => { el.addEventListener("pointerenter", () => show(el)); el.addEventListener("focus", () => show(el)); el.addEventListener("pointerleave", hide); el.addEventListener("blur", hide); });
}
let resizeT; window.addEventListener("resize", () => { clearTimeout(resizeT); resizeT = setTimeout(() => { if (S.view === "progreso") drawChart(); }, 200); });

/* ================= Ideas y bugs ================= */
const TIPOS = { mejora: "Mejora", bug: "Bug", otro: "Otro" };
const ESTADOS = { nuevo: "Nuevo", revision: "En revisión", planificado: "Planificado", en_curso: "En curso", hecho: "Hecho", descartado: "Descartado" };
const ABIERTOS = ["nuevo", "revision", "planificado", "en_curso"];
const httpsUrl = u => /^https:\/\/\S+$/.test(u || "") ? u : "";
function ticketHTML(t) {
  const votos = t.votos || [], voted = votos.includes(S.uid), id = esc(t.id);
  const canDel = !!S.admin || (t.autor === S.uid && t.estado === "nuevo"), issue = httpsUrl(t.issueUrl);
  return `<li class="ticket">
    <button class="vote" data-vote="${id}" aria-pressed="${voted}" aria-label="${voted ? "Quitar mi voto" : "Votar"} (${votos.length} ${votos.length === 1 ? "voto" : "votos"})"><span aria-hidden="true">▲</span><b class="num">${votos.length}</b></button>
    <div class="tk-body">
      <div class="tk-head"><span class="tk-tipo">${TIPOS[t.tipo] || "Otro"}</span><span class="tk-estado e-${esc(t.estado)}">${ESTADOS[t.estado] || esc(t.estado)}</span></div>
      <h3>${esc(t.titulo)}</h3>
      ${t.descripcion ? `<p class="tk-desc">${multiline(t.descripcion)}</p>` : ""}
      ${t.respuesta ? `<div class="tk-resp"><b>Respuesta:</b> ${multiline(t.respuesta)}</div>` : ""}
      <p class="tk-meta">${nm(t.autor)} · ${fecha(t.createdAt)}${issue ? ` · <a href="${esc(issue)}" target="_blank" rel="noopener">Ver en GitHub</a>` : ""}${canDel ? ` · <button class="link danger" data-tkdel="${id}">Borrar</button>` : ""}</p>
      ${S.admin ? `<details class="tk-mod"><summary>Moderar</summary>
        ${t.contexto ? `<p class="muted tk-ctx">Contexto: ${esc(t.contexto)}</p>` : ""}
        <div class="fields">
          <div class="field"><label for="me-${id}">Estado</label><select id="me-${id}">${Object.entries(ESTADOS).map(([k, l]) => `<option value="${k}" ${k === t.estado ? "selected" : ""}>${l}</option>`).join("")}</select></div>
          <div class="field"><label for="mi-${id}">Link al issue</label><input id="mi-${id}" value="${esc(t.issueUrl || "")}" placeholder="https://github.com/…"></div>
          <div class="field full"><label for="mr-${id}">Respuesta pública</label><textarea class="short" id="mr-${id}" maxlength="1000">${esc(t.respuesta || "")}</textarea></div>
        </div>
        <div class="row-end"><button class="btn small" data-tksave="${id}">Guardar</button></div></details>` : ""}
    </div></li>`;
}
function renderIdeas() {
  const T = S.tk;
  let list = Object.entries(S.tickets).map(([id, t]) => ({ id, ...t }));
  if (T.tipo) list = list.filter(t => t.tipo === T.tipo);
  if (T.estado === "abiertos") list = list.filter(t => ABIERTOS.includes(t.estado));
  else if (T.estado === "cerrados") list = list.filter(t => !ABIERTOS.includes(t.estado));
  if (T.mios) list = list.filter(t => t.autor === S.uid);
  list.sort((a, b) => (b.votos?.length || 0) - (a.votos?.length || 0) || (b.createdAt || 0) - (a.createdAt || 0));
  const chip = (attr, val, cur, label) => `<button class="chip" data-${attr}="${val}" aria-pressed="${val === cur}">${label}</button>`;
  app.innerHTML = `<div class="wrap ideas">
    <div class="rank-top"><h1>Ideas y bugs</h1><button class="btn" id="tkNew" aria-expanded="${T.open}">${T.open ? "Cerrar" : "Nuevo ticket"}</button></div>
    <p class="how">Proponé mejoras, avisá si algo no anda y votá lo que te parece más importante. Lo más votado se revisa primero.</p>
    ${T.open ? `<form class="card tk-form" id="tkForm">
      <h2>Nuevo ticket</h2>
      <div class="modes" role="group" aria-label="Tipo de ticket">${Object.entries(TIPOS).map(([k, l]) => `<button type="button" class="chip" data-ntipo="${k}" aria-pressed="${T.ntipo === k}">${l}</button>`).join("")}</div>
      <div class="field"><label for="tkTitulo">Título</label><input id="tkTitulo" maxlength="120" value="${esc(T.titulo)}" placeholder="${T.ntipo === "bug" ? "Ej.: No se guarda el puntaje en el celular" : "Ej.: Poder filtrar tests por año"}"></div>
      <div class="field"><label for="tkDesc">Descripción</label><textarea class="short" id="tkDesc" maxlength="2000" placeholder="${T.ntipo === "bug" ? "Qué hiciste, qué esperabas que pase y qué pasó." : "Qué te gustaría y para qué te serviría."}">${esc(T.desc)}</textarea>
        <div class="hint">${T.ntipo === "bug" ? "Se adjunta sola la pantalla donde estabas y tu navegador, para poder reproducirlo." : "Tu nombre se muestra junto al ticket."}</div></div>
      <div class="row-end"><button class="btn" type="submit">Enviar</button></div>
    </form>` : ""}
    <div class="chips" role="group" aria-label="Filtrar por tipo">${chip("ftipo", "", T.tipo, "Todos")}${Object.entries(TIPOS).map(([k, l]) => chip("ftipo", k, T.tipo, l + "s")).join("")}</div>
    <div class="chips" role="group" aria-label="Filtrar por estado">${chip("festado", "abiertos", T.estado, "Abiertos")}${chip("festado", "cerrados", T.estado, "Cerrados")}${chip("festado", "todos", T.estado, "Todos")}
      <button class="chip" id="tkMios" aria-pressed="${T.mios}">Mis tickets</button></div>
    ${list.length ? `<ul class="tickets">${list.map(ticketHTML).join("")}</ul>`
      : `<div class="empty"><p><b>No hay tickets ${T.mios ? "tuyos " : ""}con estos filtros.</b></p><p>¿Tenés una idea o encontraste un error? Contalo.</p></div>`}
  </div>`;
  $("#tkNew").onclick = () => { T.open = !T.open; render(); if (T.open) $("#tkTitulo")?.focus(); };
  app.querySelectorAll("[data-ntipo]").forEach(b => b.onclick = () => { T.ntipo = b.dataset.ntipo; render(); });
  app.querySelectorAll("[data-ftipo]").forEach(b => b.onclick = () => { T.tipo = b.dataset.ftipo; render(); });
  app.querySelectorAll("[data-festado]").forEach(b => b.onclick = () => { T.estado = b.dataset.festado; render(); });
  $("#tkMios").onclick = () => { T.mios = !T.mios; render(); };
  const ti = $("#tkTitulo"), de = $("#tkDesc");
  if (ti) { ti.oninput = () => T.titulo = ti.value; de.oninput = () => T.desc = de.value; $("#tkForm").onsubmit = e => { e.preventDefault(); sendTicket(); }; }
  app.querySelectorAll("[data-vote]").forEach(b => b.onclick = () => vote(b.dataset.vote));
  app.querySelectorAll("[data-tkdel]").forEach(b => b.onclick = () => deleteTicket(b.dataset.tkdel));
  app.querySelectorAll("[data-tksave]").forEach(b => b.onclick = () => moderate(b.dataset.tksave));
}
async function sendTicket() {
  const T = S.tk, titulo = norm(T.titulo).slice(0, 120), descripcion = String(T.desc || "").trim().slice(0, 2000);
  if (titulo.length < 4) { toast("Poné un título un poco más largo"); return; }
  // Freno simple contra envíos repetidos; el límite real lo pondría App Check o una Cloud Function.
  const last = +(store.get("ultimoTicket") || 0);
  if (Date.now() - last < 60000) { toast("Esperá un minuto antes de mandar otro ticket"); return; }
  const now = Date.now(), t = { tipo: T.ntipo, titulo, descripcion, autor: S.uid, estado: "nuevo", votos: [S.uid], createdAt: now, updatedAt: now };
  if (T.ntipo === "bug") t.contexto = `${S.desde || "#tests"} · ${navigator.userAgent}`.slice(0, 400);
  try {
    await addDoc(collection(db, "tickets"), t);
    store.set("ultimoTicket", String(now));
    Object.assign(T, { open: false, titulo: "", desc: "", estado: "abiertos", tipo: "" });
    toast("¡Gracias! Tu ticket quedó publicado."); render();
  } catch { toast("No se pudo enviar el ticket. Probá de nuevo."); }
}
async function vote(id) {
  const t = S.tickets[id]; if (!t) return;
  const voted = (t.votos || []).includes(S.uid);
  try { await updateDoc(doc(db, "tickets", id), { votos: voted ? arrayRemove(S.uid) : arrayUnion(S.uid) }); }
  catch { toast("No se pudo registrar el voto"); }
}
async function deleteTicket(id) {
  const t = S.tickets[id]; if (!t || !confirm(`¿Borrar “${t.titulo}”?`)) return;
  try { await deleteDoc(doc(db, "tickets", id)); toast("Ticket borrado"); } catch { toast("No se pudo borrar el ticket"); }
}
async function moderate(id) {
  const issueUrl = $("#mi-" + id).value.trim();
  if (issueUrl && !httpsUrl(issueUrl)) { toast("El link tiene que empezar con https://"); return; }
  try {
    await updateDoc(doc(db, "tickets", id), { estado: $("#me-" + id).value, respuesta: $("#mr-" + id).value.trim().slice(0, 1000), issueUrl, updatedAt: Date.now() });
    toast("Ticket actualizado");
  } catch { toast("No se pudo actualizar el ticket"); }
}

/* ================= Perfil ================= */
const buscarUni = nombre => { const s = slug(nombre); return s ? Object.values(S.unis).find(u => slug(u.nombre) === s || (u.sigla && slug(u.sigla) === s)) : null; };
const carrerasDe = uni => uni ? Object.values(S.carreras).filter(c => c.universidadId === uni.id).sort((a, b) => a.nombre.localeCompare(b.nombre, "es")) : [];
function renderPerfil() {
  const u = me();
  const P = S.perfil ||= { uni: S.unis[u.universidadId]?.nombre || "", sigla: "", carrera: S.carreras[u.carreraId]?.nombre || "" };
  const unis = Object.values(S.unis).sort((a, b) => a.nombre.localeCompare(b.nombre, "es")), uniSel = buscarUni(P.uni), sb = subs();
  app.innerHTML = `<div class="wrap perfil">
    <h1 class="page-title">Mi perfil</h1>
    <p class="how">Tu universidad y carrera definen dónde se publican tus tests y qué ranking ves. Si no está la tuya, escribila y se crea.</p>
    <form class="card" id="pForm"><div class="fields">
      <div class="field full"><label for="pUni">Universidad</label><input id="pUni" list="dlUni" value="${esc(P.uni)}" placeholder="Ej.: Universidad Nacional de La Plata" autocomplete="off">
        <datalist id="dlUni">${unis.map(x => `<option value="${esc(x.nombre)}">${esc(x.sigla || "")}</option>`).join("")}</datalist></div>
      <div class="field" id="pSigWrap" ${uniSel || !norm(P.uni) ? "hidden" : ""}><label for="pSig">Sigla (opcional)</label><input id="pSig" value="${esc(P.sigla)}" maxlength="20" placeholder="Ej.: UNLP"><div class="hint">Es una universidad nueva en Parcialito.</div></div>
      <div class="field full"><label for="pCar">Carrera</label><input id="pCar" list="dlCar" value="${esc(P.carrera)}" placeholder="Ej.: Licenciatura en Sistemas" autocomplete="off">
        <datalist id="dlCar">${carrerasDe(uniSel).map(c => `<option value="${esc(c.nombre)}">`).join("")}</datalist></div>
    </div><div class="row-end"><button class="btn" type="submit" id="pSave">Guardar</button></div></form>
    <h2 class="sec-title">Lo que seguís</h2>
    ${sb.materias.length || sb.tags.length ? `<div class="chips">${sb.materias.map(k => `<button class="chip" data-unsub-mat="${esc(k)}" aria-label="Dejar de seguir ${esc(matNombre(k) || "materia")}">${esc(matNombre(k) || "Materia borrada")} ✕</button>`).join("")}${sb.tags.map(g => `<button class="chip" data-unsub-tag="${esc(g)}" aria-label="Dejar de seguir #${esc(g)}">#${esc(g)} ✕</button>`).join("")}</div>`
      : `<p class="muted">Todavía no seguís nada. En el inicio, tocá <b>Seguir materia</b> o elegí una etiqueta y tocá <b>Seguir</b>.</p>`}
  </div>`;
  const upd = () => {
    P.uni = $("#pUni").value; P.sigla = $("#pSig").value; P.carrera = $("#pCar").value;
    const us = buscarUni(P.uni);
    $("#pSigWrap").hidden = !!us || !norm(P.uni);
    $("#dlCar").innerHTML = carrerasDe(us).map(c => `<option value="${esc(c.nombre)}">`).join("");
  };
  ["#pUni", "#pSig", "#pCar"].forEach(s => $(s).oninput = upd);
  $("#pForm").onsubmit = e => { e.preventDefault(); guardarPerfil(); };
  app.querySelectorAll("[data-unsub-mat]").forEach(b => b.onclick = () => toggleSub("materias", b.dataset.unsubMat, matNombre(b.dataset.unsubMat) || "esa materia"));
  app.querySelectorAll("[data-unsub-tag]").forEach(b => b.onclick = () => toggleSub("tags", b.dataset.unsubTag, "#" + b.dataset.unsubTag));
}
async function guardarPerfil() {
  const P = S.perfil, nombreU = norm(P.uni).slice(0, 120), car = norm(P.carrera).slice(0, 120), sigla = norm(P.sigla).toUpperCase().slice(0, 20);
  if (!nombreU || !car) { toast("Completá universidad y carrera"); return; }
  const us = buscarUni(nombreU), uniId = us ? us.id : uniIdOf(nombreU, sigla);
  if (!uniId || !slug(car)) { toast("Usá letras o números en los nombres"); return; }
  if (!us && S.unis[uniId]) { toast(`Ya existe ${S.unis[uniId].nombre} con esa sigla. Elegila de la lista o usá otra sigla.`); return; }
  const carreraId = carreraIdOf(uniId, car);
  $("#pSave").disabled = true;
  try {
    // Se consulta al servidor: crear un documento que ya existe cuenta como edición y las reglas lo rechazan.
    const [uSnap, cSnap] = await Promise.all([getDoc(doc(db, "universidades", uniId)), getDoc(doc(db, "carreras", carreraId))]);
    const b = writeBatch(db), now = Date.now();
    if (!uSnap.exists()) b.set(doc(db, "universidades", uniId), { nombre: nombreU, sigla, creadoPor: S.uid, createdAt: now });
    if (!cSnap.exists()) b.set(doc(db, "carreras", carreraId), { nombre: car, universidadId: uniId, creadoPor: S.uid, createdAt: now });
    b.set(doc(db, "users", S.uid), { name: (S.user.displayName || "Sin nombre").slice(0, 80), photo: (S.user.photoURL || "").slice(0, 600), universidadId: uniId, carreraId, updatedAt: now }, { merge: true });
    await b.commit();
    S.perfil = null; S.rankScope = "carrera"; S.f = null;
    toast("Perfil guardado"); go("#tests");
  } catch { toast("No se pudo guardar el perfil. Probá de nuevo."); $("#pSave").disabled = false; }
}

/* ================= Novedades ================= */
function renderNovedades() {
  if (NOVEDADES.length) store.set("novedadesVistas", NOVEDADES[0].v);
  $("#novDot").hidden = true;
  app.innerHTML = `<div class="wrap news">
    <h1 class="page-title">Novedades</h1>
    <p class="how">Lo que fue cambiando en Parcialito. ¿Se te ocurre algo más? <a href="#ideas">Proponelo en Ideas y bugs</a>.</p>
    ${NOVEDADES.map(n => `<article class="card"><p class="muted news-date">${fecha(new Date(n.v + "T12:00").getTime())}</p><h2>${esc(n.titulo)}</h2><ul>${n.items.map(i => `<li>${inline(i)}</li>`).join("")}</ul></article>`).join("")}
  </div>`;
}

/* ================= Sesión y datos ================= */
function stopListening() {
  S.unsub.forEach(u => u()); S.unsub = [];
  Object.assign(S, { tests: {}, scores: {}, users: {}, tickets: {}, unis: {}, carreras: {}, mats: {}, attempts: [], subs: null, perfil: null, f: null });
  S.got = { tests: false, scores: false, users: false };
}
function listen() {
  const after = () => {
    if (!ready()) return;
    // Mientras se hace un test, se sube uno o se escribe en un formulario, solo se actualiza la barra para no borrar lo escrito.
    const el = document.activeElement, typing = app.contains(el) && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && S.view !== "test";
    if ((S.view === "subir" && $("#publish")) || (S.view === "test" && $("#sheet")) || typing) { renderBar(); paintNames(); }
    else render();
  };
  const coll = (name, key, withId) => onSnapshot(collection(db, name),
    s => { const o = {}; s.forEach(d => o[d.id] = withId ? { id: d.id, ...d.data() } : d.data()); S[key] = o; if (key in S.got) S.got[key] = true; after(); },
    () => { if (key in S.got) S.got[key] = true; after(); });
  S.unsub.push(coll("tests", "tests"), coll("scores", "scores"), coll("users", "users"), coll("tickets", "tickets"),
    coll("universidades", "unis", true), coll("carreras", "carreras", true), coll("materias", "mats", true));
  S.unsub.push(onSnapshot(query(collection(db, "attempts"), where("uid", "==", S.uid)), s => { S.attempts = s.docs.map(d => d.data()); after(); }, () => {}));
  S.unsub.push(onSnapshot(doc(db, "subs", S.uid), d => { S.subs = d.exists() ? d.data() : null; after(); }, () => {}));
}
getRedirectResult(auth).catch(() => {});
onAuthStateChanged(auth, async user => {
  stopListening();
  S.user = user; S.uid = user?.uid || null; S.authReady = true; S.admin = null;
  if (user) {
    // merge: así no se pisan la universidad y la carrera que la persona eligió.
    setDoc(doc(db, "users", user.uid), { name: (user.displayName || "Sin nombre").slice(0, 80), photo: (user.photoURL || "").slice(0, 600), updatedAt: Date.now() }, { merge: true }).catch(() => {});
    getDoc(doc(db, "admins", user.uid)).then(d => {
      if (!d.exists()) return;
      const u = d.data().universidades;
      S.admin = { global: !Array.isArray(u) || u.includes("*"), unis: Array.isArray(u) ? u : [] };
      if (["tests", "ideas"].includes(S.view)) render();
    }).catch(() => {});
    listen();
    const r = parseHash(); S.view = r.view; if (r.view === "test") startTest(r.id);
    if (r.view === "tests" && r.qs) filtrosDesdeURL(r.qs);
  }
  render();
});
render();
