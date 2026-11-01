// Tareas: las tuyas (guardadas en este navegador, te siguen a cualquier sala) y las de la sala
// (en Firestore, solo si el anfitrión las activó). La misma lista se muestra en el inicio, en la
// columna izquierda de la sala (o la pestaña Tareas en pantallas angostas) y en el modo zen.
// "En la que estás" es la primera sin tachar, salvo que elijas otra con ▶. Se ordenan arrastrando el asa ⋮⋮
// (o con ↑ y ↓ desde el asa); las de la sala las ordenan el anfitrión y los moderadores.
const MAX_MIAS = 50, MAX_SALA = 30, LARGO = 120;

export function crearTareas({ store, toast, track = () => {}, sala, alCambiar = () => {} }) {
  let mias = leer(), actual = store.get("cucu.tareaActual") || "", deSala = [], off = null, codigo = null;
  let arrastrando = false, redibujar = false;   // mientras se arrastra no se redibuja (llegan cambios de la sala)
  const nuevoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  function leer() {
    try { const l = JSON.parse(store.get("cucu.tareas") || "[]"); return Array.isArray(l) ? l.filter(t => t && typeof t.t === "string" && t.id) : []; }
    catch (e) { return []; }
  }
  function guardar() { store.set("cucu.tareas", JSON.stringify(mias)); store.set("cucu.tareaActual", actual); }
  function cambio() { guardar(); render(); alCambiar(); }
  const ordenar = l => l.filter(t => !t.done).concat(l.filter(t => t.done).sort((a, b) => (a.doneAt || 0) - (b.doneAt || 0)));
  // La elegida con ▶ si sigue pendiente; si no, la primera sin tachar
  const actualTarea = () => mias.find(x => x.id === actual && !x.done) || mias.find(x => !x.done) || null;
  const actualTexto = () => { const t = actualTarea(); return t ? t.t : ""; };

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

  // ---------- arrastrar para ordenar ----------
  // El asa se arrastra con el mouse o el dedo; con el teclado, ↑ y ↓. Solo se mueven las pendientes.
  // alSoltar(ids, id): el orden nuevo de las pendientes y cuál se movió.
  function asa(ul, alSoltar) {
    const g = document.createElement("button"); g.type = "button"; g.className = "tgrip"; g.textContent = "⋮⋮";
    g.title = "Arrastrá para ordenar"; g.setAttribute("aria-label", "Mover tarea (flechas arriba y abajo)");
    const pendientes = () => [...ul.children].filter(x => x.dataset.id && !x.classList.contains("done"));
    g.onkeydown = e => {
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return; e.preventDefault();
      const li = g.closest("li"), l = pendientes(), i = l.indexOf(li), j = i + (e.key === "ArrowUp" ? -1 : 1);
      if (j < 0 || j >= l.length) return;
      ul.insertBefore(li, e.key === "ArrowUp" ? l[j] : l[j].nextSibling);
      const id = li.dataset.id; alSoltar(pendientes().map(x => x.dataset.id), id);
      requestAnimationFrame(() => { const n = ul.querySelector(`li[data-id="${CSS.escape(id)}"] .tgrip`); if (n) n.focus(); });
    };
    g.onpointerdown = e => {
      if (e.button !== 0) return; e.preventDefault();
      const li = g.closest("li"), antes = pendientes().map(x => x.dataset.id).join();
      // Se escucha en la ventana: al mover la tarea dentro de la lista el asa pierde el puntero
      li.classList.add("drag"); arrastrando = true;
      let auto = 0, lastY = e.clientY;
      const mover = y => {
        const otros = pendientes().filter(x => x !== li);
        const sig = otros.find(x => { const r = x.getBoundingClientRect(); return y < r.top + r.height / 2; });
        if (sig) { if (li.nextSibling !== sig) ul.insertBefore(li, sig); }
        else if (otros.length) { const ult = otros[otros.length - 1]; if (ult.nextSibling !== li) ul.insertBefore(li, ult.nextSibling); }
      };
      // si la lista tiene desplazamiento, se mueve sola al acercarse a los bordes
      const desplazar = () => {
        const r = ul.getBoundingClientRect(), d = lastY < r.top + 30 ? -8 : lastY > r.bottom - 30 ? 8 : 0;
        if (d) { ul.scrollTop += d; mover(lastY); }
        auto = requestAnimationFrame(desplazar);
      };
      auto = requestAnimationFrame(desplazar);
      const mov = ev => { if (ev.pointerId !== e.pointerId) return; ev.preventDefault(); lastY = ev.clientY; mover(ev.clientY); };
      const soltar = ev => {
        if (ev.pointerId !== e.pointerId) return;
        cancelAnimationFrame(auto); li.classList.remove("drag");
        removeEventListener("pointermove", mov); removeEventListener("pointerup", soltar); removeEventListener("pointercancel", soltar);
        arrastrando = false;
        const ids = pendientes().map(x => x.dataset.id);
        if (ids.join() !== antes) alSoltar(ids, li.dataset.id);
        else if (redibujar) render();
      };
      addEventListener("pointermove", mov, { passive: false }); addEventListener("pointerup", soltar); addEventListener("pointercancel", soltar);
    };
    return g;
  }

  // ---------- mis tareas ----------
  function agregarMia(v) {
    if (mias.length >= MAX_MIAS) { toast(`Tenés ${MAX_MIAS} tareas: borrá algunas para sumar más`); return false; }
    mias.push({ id: nuevoId(), t: v, done: false }); cambio(); track("tarea_agregada", { tipo: "mia" });
  }
  function reordenarMias(ids) {
    const pos = new Map(ids.map((id, i) => [id, i]));
    const pend = mias.filter(t => !t.done).sort((a, b) => (pos.get(a.id) ?? 1e9) - (pos.get(b.id) ?? 1e9));
    mias = pend.concat(mias.filter(t => t.done)); cambio();
  }
  function itemMio(t, arrastrable) {
    const cur = actualTarea(), es = !!cur && cur.id === t.id;
    const li = document.createElement("li"); li.dataset.id = t.id; if (t.done) li.classList.add("done"); if (es) li.classList.add("now");
    if (arrastrable && !t.done) li.appendChild(asa(ulMia, reordenarMias));
    const chk = boton("tchk", t.done ? "✓" : "", () => {
      t.done = !t.done; t.doneAt = t.done ? Date.now() : 0;
      if (t.done && actual === t.id) actual = "";   // pasa sola a la siguiente
      cambio();
    }, t.done ? "Destachar" : "Tachar");
    chk.setAttribute("aria-pressed", String(!!t.done));
    const tt = document.createElement("div"); tt.className = "tt"; const sp = document.createElement("span"); sp.textContent = t.t; tt.appendChild(sp);
    li.append(chk, tt);
    if (!t.done) {
      const b = boton("tbtn play1", "▶", () => { if (!es) { actual = t.id; cambio(); } }, es ? "En esta estás ahora (se ve en Gente)" : "Pasar a esta");
      b.setAttribute("aria-pressed", String(es)); li.appendChild(b);
    }
    li.appendChild(boton("tbtn x", "✕", () => { mias = mias.filter(x => x !== t); if (actual === t.id) actual = ""; cambio(); }, "Borrar tarea"));
    return li;
  }

  // ---------- tareas de la sala ----------
  const ordenSala = t => typeof t.orden === "number" ? t.orden : (t.at || 0);
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
    const at = s.db.now();
    s.db.collection(`rooms/${s.code}/tareas`).add({ text: v, by: s.uid, nick: s.nick(), at, orden: at, done: false })
      .then(() => track("tarea_agregada", { tipo: "sala" }))
      .catch(() => toast("No se pudo agregar la tarea"));
  }
  // Solo se escribe la tarea movida: su orden nuevo queda entre el de sus vecinas
  function reordenarSala(ids, id) {
    const s = sala(); if (!s || !s.modera) return;
    const by = new Map(deSala.map(t => [t.id, t])), j = ids.indexOf(id), movida = by.get(id);
    if (!movida || j < 0) return;
    const prev = by.get(ids[j - 1]), next = by.get(ids[j + 1]);
    const nuevo = prev && next ? (ordenSala(prev) + ordenSala(next)) / 2 : prev ? ordenSala(prev) + 1000 : next ? ordenSala(next) - 1000 : ordenSala(movida);
    movida.orden = nuevo; render();
    s.db.doc(`rooms/${s.code}/tareas/${id}`).update({ orden: nuevo }).catch(() => toast("No se pudo ordenar la tarea"));
  }
  function itemSala(t, s) {
    const li = document.createElement("li"); li.dataset.id = t.id; if (t.done) li.classList.add("done");
    if (s.modera && !t.done) li.appendChild(asa(ulSala, reordenarSala));
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
  // Redibuja una lista sin perder dónde estaba el desplazamiento
  function poner(ul, items) { const y = ul.scrollTop; ul.replaceChildren(...items); ul.scrollTop = y; }
  function render() {
    if (arrastrando) { redibujar = true; return; }
    redibujar = false;
    const ord = ordenar(mias);
    poner(ulMia, ord.length ? ord.map(t => itemMio(t, true)) : [vacio("Anotá lo que querés hacer hoy. La primera sin tachar es en la que estás; con ▶ elegís otra.")]);
    limpiar.classList.toggle("hidden", !mias.some(t => t.done));
    todo.classList.toggle("hidden", !mias.length);

    const s = sala(), conSala = !!(s && s.activas), v = conSala ? vista : "mia";
    titulo.classList.toggle("hidden", conSala); seg.classList.toggle("hidden", !conSala);
    verMia.setAttribute("aria-pressed", String(v === "mia")); verSala.setAttribute("aria-pressed", String(v === "sala"));
    secMia.classList.toggle("hidden", v !== "mia"); secSala.classList.toggle("hidden", v !== "sala");
    if (conSala) {
      const pend = deSala.filter(t => !t.done).length;
      verSala.textContent = pend ? `De la sala (${pend})` : "De la sala";
      const l = ordenar(deSala.slice().sort((a, b) => ordenSala(a) - ordenSala(b)));
      poner(ulSala, l.length ? l.map(t => itemSala(t, s)) : [vacio("Todavía no hay tareas de la sala.")]);
    }

    // modo zen: la lista al costado (se oculta con el ojo) y la tarea actual debajo del reloj
    const visible = store.get("cucu.zenTareas") !== "0";
    zen.classList.toggle("has", mias.length > 0); zen.classList.toggle("off", !visible);
    zenEye.innerHTML = visible ? OJO_NO : OJO;
    zenEye.title = visible ? "Ocultar tus tareas" : "Mostrar tus tareas"; zenEye.setAttribute("aria-label", zenEye.title);
    poner(zenList, ord.map(t => itemMio(t, false)));
    const now = document.getElementById("zenNow"), a = actualTexto();
    now.classList.toggle("hidden", !a); now.replaceChildren("Ahora: ", Object.assign(document.createElement("b"), { textContent: a }));
  }

  render();
  return {
    el, render, conectar, desconectar, actualTexto,
    hayPendientes: () => mias.some(t => !t.done),
    // pone la lista en el lugar que corresponde (inicio, columna o pestaña)
    ubicar(cont) { if (cont && el.parentNode !== cont) cont.appendChild(el); }
  };
}
