// Tareas: las tuyas (guardadas en este navegador, te siguen a cualquier sala) y las de la sala
// (en Firestore, solo si el anfitrión las activó). La misma lista se muestra en el inicio, en la
// columna izquierda de la sala (o la pestaña Tareas en pantallas angostas) y en el modo zen.
const MAX_MIAS = 50, MAX_SALA = 30, LARGO = 120;

export function crearTareas({ store, toast, track = () => {}, sala, alCambiar = () => {} }) {
  let mias = leer(), actual = store.get("cucu.tareaActual") || "", deSala = [], off = null, codigo = null;
  const nuevoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  // Lo que antes se escribía a mano en "¿En qué estás?" pasa a ser una tarea
  const vieja = (store.get("cucu.task") || "").trim();
  if (vieja && !mias.length) { const t = { id: nuevoId(), t: vieja.slice(0, LARGO), done: false }; mias.push(t); actual = t.id; guardar(); }
  if (vieja) store.set("cucu.task", "");

  function leer() {
    try { const l = JSON.parse(store.get("cucu.tareas") || "[]"); return Array.isArray(l) ? l.filter(t => t && typeof t.t === "string" && t.id) : []; }
    catch (e) { return []; }
  }
  function guardar() { store.set("cucu.tareas", JSON.stringify(mias)); store.set("cucu.tareaActual", actual); }
  function cambio() { guardar(); render(); alCambiar(); }
  const ordenar = l => l.filter(t => !t.done).concat(l.filter(t => t.done).sort((a, b) => (a.doneAt || 0) - (b.doneAt || 0)));
  const actualTexto = () => { const t = mias.find(x => x.id === actual && !x.done); return t ? t.t : ""; };

  // ---------- armado (una vez: así los campos no pierden el foco al redibujar) ----------
  const el = document.createElement("div"); el.className = "tasks";
  // Con tareas de la sala activas, un selector arriba elige cuál de las dos listas se ve
  const titulo = document.createElement("h3"); titulo.textContent = "Mis tareas";
  const seg = document.createElement("div"); seg.className = "tseg"; seg.setAttribute("role", "group"); seg.setAttribute("aria-label", "Qué tareas ver");
  const verMia = boton("", "Mis tareas", () => elegir("mia")), verSala = boton("", "De la sala", () => elegir("sala"));
  seg.append(verMia, verSala);
  let vista = store.get("cucu.tareasVista") === "sala" ? "sala" : "mia";
  function elegir(v) { vista = v; store.set("cucu.tareasVista", v); render(); }
  const secMia = document.createElement("div"); secMia.className = "tsec";
  const formMia = form("Agregar una tarea", agregarMia);
  const ulMia = document.createElement("ul"); ulMia.className = "tlist";
  const pie = document.createElement("div"); pie.className = "tfoot";
  const limpiar = boton("linkbtn", "Limpiar tachadas", () => { mias = mias.filter(t => !t.done); cambio(); });
  const todo = boton("linkbtn", "Borrar todo", () => { if (confirm("¿Borrar todas tus tareas?")) { mias = []; actual = ""; cambio(); } });
  pie.append(limpiar, todo);
  secMia.append(formMia, ulMia, pie);

  const secSala = document.createElement("div"); secSala.className = "tsec";
  secSala.innerHTML = '<p class="muted tnote">Compartidas: cualquiera de la sala agrega y tacha.</p>';
  const formSala = form("Agregar para la sala", agregarSala);
  const ulSala = document.createElement("ul"); ulSala.className = "tlist";
  secSala.append(formSala, ulSala);
  el.append(titulo, seg, secMia, secSala);

  const zen = document.getElementById("zenTasks"), zenList = document.getElementById("zenList"), zenEye = document.getElementById("zenEye");
  const OJO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  const OJO_NO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 3l18 18M10.6 5.1A10.8 10.8 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7c1.6 0 3-.4 4.2-1M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
  zenEye.onclick = () => { store.set("cucu.zenTareas", store.get("cucu.zenTareas") === "0" ? "1" : "0"); render(); };

  function form(ph, fn) {
    const f = document.createElement("form"); f.className = "tadd";
    const i = document.createElement("input"); i.className = "t"; i.maxLength = LARGO; i.placeholder = ph; i.setAttribute("aria-label", ph); i.autocomplete = "off";
    const b = document.createElement("button"); b.className = "btn small"; b.type = "submit"; b.textContent = "+"; b.setAttribute("aria-label", ph);
    f.append(i, b);
    f.onsubmit = e => { e.preventDefault(); const v = i.value.trim().slice(0, LARGO); if (v && fn(v) !== false) i.value = ""; };
    return f;
  }
  function boton(cls, txt, fn, label) {
    const b = document.createElement("button"); b.type = "button"; b.className = cls; b.textContent = txt; b.onclick = fn;
    if (label) { b.title = label; b.setAttribute("aria-label", label); }
    return b;
  }

  // ---------- mis tareas ----------
  function agregarMia(v) {
    if (mias.length >= MAX_MIAS) { toast(`Tenés ${MAX_MIAS} tareas: borrá algunas para sumar más`); return false; }
    mias.push({ id: nuevoId(), t: v, done: false }); cambio(); track("tarea_agregada", { tipo: "mia" });
  }
  function itemMio(t) {
    const li = document.createElement("li"); if (t.done) li.classList.add("done"); if (t.id === actual && !t.done) li.classList.add("now");
    const chk = boton("tchk", t.done ? "✓" : "", () => {
      t.done = !t.done; t.doneAt = t.done ? Date.now() : 0;
      if (t.done && actual === t.id) actual = "";
      cambio();
    }, t.done ? "Destachar" : "Tachar");
    chk.setAttribute("aria-pressed", String(!!t.done));
    const tt = document.createElement("div"); tt.className = "tt"; const sp = document.createElement("span"); sp.textContent = t.t; tt.appendChild(sp);
    li.append(chk, tt);
    if (!t.done) {
      const ya = actual === t.id;
      li.appendChild(boton("tbtn play1", ya ? "■" : "▶", () => { actual = ya ? "" : t.id; cambio(); }, ya ? "Ya no estoy en esta" : "Estoy en esta (se ve en Gente)"));
    }
    li.appendChild(boton("tbtn x", "✕", () => { mias = mias.filter(x => x !== t); if (actual === t.id) actual = ""; cambio(); }, "Borrar tarea"));
    return li;
  }

  // ---------- tareas de la sala ----------
  function conectar(db, code) {
    desconectar(); codigo = code;
    off = db.collection(`rooms/${code}/tareas`).orderBy("at", "asc").limit(60).onSnapshot(s => {
      if (codigo !== code) return;
      deSala = s.docs.map(x => Object.assign({ id: x.id }, x.data())).filter(t => typeof t.text === "string");
      render();
    }, () => { deSala = []; render(); });
  }
  function desconectar() { if (off) { try { off(); } catch (e) {} } off = null; codigo = null; deSala = []; }
  function agregarSala(v) {
    const s = sala(); if (!s || !s.activas) return false;
    if (deSala.length >= MAX_SALA) { toast(`La sala ya tiene ${MAX_SALA} tareas: borren las tachadas para sumar más`); return false; }
    s.db.collection(`rooms/${s.code}/tareas`).add({ text: v, by: s.uid, nick: s.nick(), at: s.db.now(), done: false })
      .then(() => track("tarea_agregada", { tipo: "sala" }))
      .catch(() => toast("No se pudo agregar la tarea"));
  }
  function itemSala(t, s) {
    const li = document.createElement("li"); if (t.done) li.classList.add("done");
    const chk = boton("tchk", t.done ? "✓" : "", () => {
      const patch = t.done ? { done: false, doneBy: "", doneNick: "" } : { done: true, doneBy: s.uid, doneNick: s.nick() };
      s.db.doc(`rooms/${s.code}/tareas/${t.id}`).update(patch).catch(() => toast("No se pudo cambiar la tarea"));
    }, t.done ? "Destachar" : "Tachar");
    chk.setAttribute("aria-pressed", String(!!t.done));
    const tt = document.createElement("div"); tt.className = "tt";
    const sp = document.createElement("span"); sp.textContent = t.text;
    const sm = document.createElement("small"); sm.textContent = t.done ? `✓ ${s.nombre(t.doneBy, t.doneNick)}` : `de ${s.nombre(t.by, t.nick)}`;
    tt.append(sp, sm); li.append(chk, tt);
    if (t.by === s.uid || s.modera) li.appendChild(boton("tbtn x", "✕", () => {
      s.db.doc(`rooms/${s.code}/tareas/${t.id}`).delete().catch(() => toast("No se pudo borrar la tarea"));
    }, "Borrar tarea"));
    return li;
  }

  // ---------- dibujo ----------
  function vacio(txt) { const li = document.createElement("li"); li.className = "empty"; li.style.fontSize = "14px"; li.textContent = txt; return li; }
  function render() {
    const ord = ordenar(mias);
    ulMia.replaceChildren(...(ord.length ? ord.map(itemMio) : [vacio("Anotá lo que querés hacer hoy. Con ▶ marcás en cuál estás.")]));
    limpiar.classList.toggle("hidden", !mias.some(t => t.done));
    todo.classList.toggle("hidden", !mias.length);

    const s = sala(), conSala = !!(s && s.activas), v = conSala ? vista : "mia";
    titulo.classList.toggle("hidden", conSala); seg.classList.toggle("hidden", !conSala);
    verMia.setAttribute("aria-pressed", String(v === "mia")); verSala.setAttribute("aria-pressed", String(v === "sala"));
    secMia.classList.toggle("hidden", v !== "mia"); secSala.classList.toggle("hidden", v !== "sala");
    if (conSala) {
      const pend = deSala.filter(t => !t.done).length;
      verSala.textContent = pend ? `De la sala (${pend})` : "De la sala";
      const l = ordenar(deSala);
      ulSala.replaceChildren(...(l.length ? l.map(t => itemSala(t, s)) : [vacio("Todavía no hay tareas de la sala.")]));
    }

    // modo zen: la lista al costado (se oculta con el ojo) y la tarea actual debajo del reloj
    const visible = store.get("cucu.zenTareas") !== "0";
    zen.classList.toggle("has", mias.length > 0); zen.classList.toggle("off", !visible);
    zenEye.innerHTML = visible ? OJO_NO : OJO;
    zenEye.title = visible ? "Ocultar tus tareas" : "Mostrar tus tareas"; zenEye.setAttribute("aria-label", zenEye.title);
    zenList.replaceChildren(...ord.map(itemMio));
    const now = document.getElementById("zenNow"), a = actualTexto();
    now.classList.toggle("hidden", !a); now.replaceChildren("Ahora: ", Object.assign(document.createElement("b"), { textContent: a }));
  }

  render();
  return {
    el, render, conectar, desconectar, actualTexto,
    // pone la lista en el lugar que corresponde (inicio, columna o pestaña)
    ubicar(cont) { if (cont && el.parentNode !== cont) cont.appendChild(el); }
  };
}
