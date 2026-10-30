// Ideas y bugs: la ticketera de Cucú. Cualquiera propone mejoras, avisa errores y vota;
// el creador de la app (admins/{uid} en Firestore) cambia el estado y responde desde la misma lista.
const TIPOS = { mejora: "Mejora", bug: "Bug", otro: "Otro" };
const ESTADOS = { nuevo: "Nuevo", revision: "En revisión", planificado: "Planificado", en_curso: "En curso", hecho: "Hecho", descartado: "Descartado" };
const ABIERTOS = ["nuevo", "revision", "planificado", "en_curso"];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const multiline = s => esc(s).replace(/\n/g, "<br>");
const fecha = ms => new Date(ms).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" });

// el: contenedor; uid/nick/admin son funciones porque se conocen recién cuando conecta Firebase.
export function crearIdeas({ el, db, uid, nick, admin, toast, store }) {
  const T = { open: false, ntipo: "mejora", titulo: "", desc: "", tipo: "", estado: "abiertos", mios: false };
  let tickets = {}, off = null, error = "";

  function escuchar() {
    if (off || !db) return;
    off = db.collection("tickets").orderBy("createdAt", "desc").limit(300).onSnapshot(s => {
      tickets = Object.fromEntries(s.docs.map(d => [d.id, d.data()])); error = ""; renderLista();
    }, () => { error = "No se pudieron cargar los tickets. Revisá las reglas de Firestore."; renderLista(); });
  }

  function ticketHTML(t) {
    const votos = t.votos || [], voted = votos.includes(uid()), id = esc(t.id);
    const canDel = admin() || (t.autor === uid() && t.estado === "nuevo");
    return `<li class="ticket">
      <button class="vote" data-vote="${id}" aria-pressed="${voted}" aria-label="${voted ? "Quitar mi voto" : "Votar"} (${votos.length} ${votos.length === 1 ? "voto" : "votos"})"><span aria-hidden="true">▲</span><b>${votos.length}</b></button>
      <div class="tk-body">
        <div class="tk-head"><span class="tk-tipo">${TIPOS[t.tipo] || "Otro"}</span><span class="tk-estado e-${esc(t.estado)}">${ESTADOS[t.estado] || esc(t.estado)}</span></div>
        <h4>${esc(t.titulo)}</h4>
        ${t.descripcion ? `<p class="tk-desc">${multiline(t.descripcion)}</p>` : ""}
        ${t.respuesta ? `<div class="tk-resp"><b>Respuesta:</b> ${multiline(t.respuesta)}</div>` : ""}
        <p class="tk-meta">${esc(t.nick || "Alguien")} · ${fecha(t.createdAt)}${canDel ? ` · <button class="linkbtn" data-tkdel="${id}">Borrar</button>` : ""}</p>
        ${admin() ? `<details class="tk-mod"><summary>Moderar</summary>
          ${t.contexto ? `<p class="muted tk-ctx">Contexto: ${esc(t.contexto)}</p>` : ""}
          <label class="f" for="me-${id}">Estado</label>
          <select class="t" id="me-${id}">${Object.entries(ESTADOS).map(([k, l]) => `<option value="${k}" ${k === t.estado ? "selected" : ""}>${l}</option>`).join("")}</select>
          <label class="f" for="mr-${id}">Respuesta pública</label>
          <textarea class="t" id="mr-${id}" maxlength="1000" rows="3">${esc(t.respuesta || "")}</textarea>
          <div style="margin-top:10px"><button class="btn small" data-tksave="${id}">Guardar</button></div></details>` : ""}
      </div></li>`;
  }

  function render() {
    const chip = (attr, val, cur, label) => `<button class="chip" data-${attr}="${val}" aria-pressed="${val === cur}">${label}</button>`;
    el.innerHTML = `
      <div class="vhead"><h2>Ideas y bugs</h2><button class="btn" id="tkNew" aria-expanded="${T.open}">${T.open ? "Cerrar" : "Nuevo ticket"}</button></div>
      <p class="muted vlead">Proponé mejoras, avisá si algo no anda y votá lo que te parece más importante. Lo más votado se revisa primero.</p>
      ${T.open ? `<form class="card tk-form" id="tkForm">
        <h3>Nuevo ticket</h3>
        <div class="chips" role="group" aria-label="Tipo de ticket" style="margin-top:10px">${Object.entries(TIPOS).map(([k, l]) => `<button type="button" class="chip" data-ntipo="${k}" aria-pressed="${T.ntipo === k}">${l}</button>`).join("")}</div>
        <label class="f" for="tkTitulo">Título</label>
        <input class="t" id="tkTitulo" maxlength="120" value="${esc(T.titulo)}" placeholder="${T.ntipo === "bug" ? "Ej: El reloj se atrasa en el celular" : "Ej: Poder elegir el color de la sala"}">
        <label class="f" for="tkDesc">Descripción</label>
        <textarea class="t" id="tkDesc" maxlength="2000" rows="4" placeholder="${T.ntipo === "bug" ? "Qué hiciste, qué esperabas que pase y qué pasó." : "Qué te gustaría y para qué te serviría."}">${esc(T.desc)}</textarea>
        <p class="muted" style="font-size:13px;margin:6px 0 0">${T.ntipo === "bug" ? "Se adjunta solo tu navegador, para poder reproducirlo." : "Tu nombre de la sala se muestra junto al ticket."}</p>
        <div style="margin-top:12px"><button class="btn" type="submit">Enviar</button></div>
      </form>` : ""}
      <div class="chips" role="group" aria-label="Filtrar por tipo" style="margin-top:14px">${chip("ftipo", "", T.tipo, "Todos")}${Object.entries(TIPOS).map(([k, l]) => chip("ftipo", k, T.tipo, l + "s")).join("")}</div>
      <div class="chips" role="group" aria-label="Filtrar por estado" style="margin-top:8px">${chip("festado", "abiertos", T.estado, "Abiertos")}${chip("festado", "cerrados", T.estado, "Cerrados")}${chip("festado", "todos", T.estado, "Todos")}
        <button class="chip" id="tkMios" aria-pressed="${T.mios}">Mis tickets</button></div>
      <div id="tkLista"></div>`;
    el.querySelector("#tkNew").onclick = () => { T.open = !T.open; render(); if (T.open) el.querySelector("#tkTitulo").focus(); };
    el.querySelectorAll("[data-ntipo]").forEach(b => b.onclick = () => { T.ntipo = b.dataset.ntipo; render(); });
    el.querySelectorAll("[data-ftipo]").forEach(b => b.onclick = () => { T.tipo = b.dataset.ftipo; render(); });
    el.querySelectorAll("[data-festado]").forEach(b => b.onclick = () => { T.estado = b.dataset.festado; render(); });
    el.querySelector("#tkMios").onclick = () => { T.mios = !T.mios; render(); };
    const ti = el.querySelector("#tkTitulo"), de = el.querySelector("#tkDesc");
    if (ti) { ti.oninput = () => T.titulo = ti.value; de.oninput = () => T.desc = de.value; el.querySelector("#tkForm").onsubmit = e => { e.preventDefault(); enviar(); }; }
    renderLista();
  }

  // La lista se repinta sola con cada cambio; el formulario no, así no se pierde lo que se está escribiendo.
  function renderLista() {
    const box = el.querySelector("#tkLista"); if (!box) return;
    if (!db) { box.innerHTML = `<p class="empty">Las ideas necesitan conexión con Firebase.</p>`; return; }
    if (error) { box.innerHTML = `<p class="empty">${esc(error)}</p>`; return; }
    let list = Object.entries(tickets).map(([id, t]) => ({ id, ...t }));
    if (T.tipo) list = list.filter(t => t.tipo === T.tipo);
    if (T.estado === "abiertos") list = list.filter(t => ABIERTOS.includes(t.estado));
    else if (T.estado === "cerrados") list = list.filter(t => !ABIERTOS.includes(t.estado));
    if (T.mios) list = list.filter(t => t.autor === uid());
    list.sort((a, b) => (b.votos?.length || 0) - (a.votos?.length || 0) || (b.createdAt || 0) - (a.createdAt || 0));
    // Lo que se está escribiendo en "Moderar" no se pisa si llega un voto
    const abiertos = [...box.querySelectorAll("details.tk-mod[open] [data-tksave]")].map(b => b.dataset.tksave);
    box.innerHTML = list.length ? `<ul class="tickets">${list.map(ticketHTML).join("")}</ul>`
      : `<div class="empty"><p><b>No hay tickets ${T.mios ? "tuyos " : ""}con estos filtros.</b></p><p>¿Tenés una idea o encontraste un error? Contalo.</p></div>`;
    abiertos.forEach(id => { const b = box.querySelector(`[data-tksave="${CSS.escape(id)}"]`); if (b) b.closest("details").open = true; });
    box.querySelectorAll("[data-vote]").forEach(b => b.onclick = () => votar(b.dataset.vote));
    box.querySelectorAll("[data-tkdel]").forEach(b => b.onclick = () => borrar(b.dataset.tkdel));
    box.querySelectorAll("[data-tksave]").forEach(b => b.onclick = () => moderar(b.dataset.tksave));
  }

  async function enviar() {
    const titulo = T.titulo.trim().replace(/\s+/g, " ").slice(0, 120), descripcion = T.desc.trim().slice(0, 2000);
    if (!db || !uid()) { toast("Las ideas necesitan conexión con Firebase"); return; }
    if (titulo.length < 4) { toast("Poné un título un poco más largo"); return; }
    // Freno simple contra envíos repetidos; un límite real necesitaría App Check o una Cloud Function.
    const last = +(store.get("cucu.ultimoTicket") || 0);
    if (Date.now() - last < 60000) { toast("Esperá un minuto antes de mandar otro ticket"); return; }
    const now = db.now(), t = { tipo: T.ntipo, titulo, descripcion, autor: uid(), nick: nick().slice(0, 30), estado: "nuevo", votos: [uid()], createdAt: now, updatedAt: now };
    if (T.ntipo === "bug") t.contexto = navigator.userAgent.slice(0, 400);
    try {
      await db.collection("tickets").add(t);
      store.set("cucu.ultimoTicket", String(Date.now()));
      Object.assign(T, { open: false, titulo: "", desc: "", estado: "abiertos", tipo: "" });
      toast("¡Gracias! Tu ticket quedó publicado."); render();
    } catch (e) { toast("No se pudo enviar el ticket. Probá de nuevo."); }
  }
  async function votar(id) {
    const t = tickets[id]; if (!t) return;
    const voted = (t.votos || []).includes(uid());
    try { await db.doc("tickets/" + id).update({ votos: voted ? db.arrayRemove(uid()) : db.arrayUnion(uid()) }); }
    catch (e) { toast("No se pudo registrar el voto"); }
  }
  async function borrar(id) {
    const t = tickets[id]; if (!t || !confirm(`¿Borrar “${t.titulo}”?`)) return;
    try { await db.doc("tickets/" + id).delete(); toast("Ticket borrado"); } catch (e) { toast("No se pudo borrar el ticket"); }
  }
  async function moderar(id) {
    try {
      await db.doc("tickets/" + id).update({ estado: el.querySelector("#me-" + CSS.escape(id)).value, respuesta: el.querySelector("#mr-" + CSS.escape(id)).value.trim().slice(0, 1000), updatedAt: db.now() });
      toast("Ticket actualizado");
    } catch (e) { toast("No se pudo actualizar el ticket"); }
  }

  return {
    mostrar(conDb) { if (conDb) db = conDb; escuchar(); render(); },
    // Al saberse si quien mira es el creador, aparece o desaparece "Moderar"
    refrescar() { renderLista(); },
    abiertos: () => Object.values(tickets).filter(t => t.estado === "nuevo").length
  };
}
