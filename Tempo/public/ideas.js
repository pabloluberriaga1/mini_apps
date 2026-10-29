// Ideas y bugs: cualquiera propone mejoras o avisa errores, y vota los que le importan.

import { crearTickets } from "./sync.js";

const TIPOS = { mejora: "Mejora", bug: "Bug", otro: "Otro" };
const ESTADOS = { nuevo: "Nuevo", revision: "En revisión", planificado: "Planificado", en_curso: "En curso", hecho: "Hecho", descartado: "Descartado" };
const ABIERTOS = ["nuevo", "revision", "planificado", "en_curso"];

// Un id por navegador (no por pestaña), para que cada uno vote una sola vez.
const votante = (() => {
  let id = null;
  try { id = localStorage.getItem("tempo:votante"); } catch {}
  if (!id) {
    id = Math.random().toString(36).slice(2, 12);
    try { localStorage.setItem("tempo:votante", id); } catch {}
  }
  return id;
})();

const v = { tipo: "", estado: "abiertos", abierto: false, ntipo: "mejora", titulo: "", desc: "", autor: "" };
let tickets = {};
let api = null;

const raiz = document.getElementById("v-ideas");
const $ = (s) => raiz.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fecha = (ms) => ms ? new Date(ms).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" }) : "";
const chip = (attr, val, actual, texto) => `<button type="button" class="chip" data-${attr}="${val}" aria-pressed="${val === actual}">${texto}</button>`;

function avisar(texto) {
  $("#tk-aviso").textContent = texto;
  clearTimeout(avisar.t);
  avisar.t = setTimeout(() => { $("#tk-aviso").textContent = ""; }, 4000);
}

// ---------- Formulario ----------

function pintarForm() {
  const boton = $("#tk-nuevo");
  boton.textContent = v.abierto ? "Cerrar" : "Nuevo ticket";
  boton.setAttribute("aria-expanded", String(v.abierto));
  const caja = $("#tk-form");
  if (!v.abierto) return caja.replaceChildren();

  const bug = v.ntipo === "bug";
  caja.innerHTML = `<form class="tarjeta tk-form" id="tk-enviar">
    <h2>Nuevo ticket</h2>
    <div class="chips" role="group" aria-label="Tipo de ticket">${Object.entries(TIPOS).map(([k, l]) => chip("ntipo", k, v.ntipo, l)).join("")}</div>
    <label for="tk-titulo">Título</label>
    <input class="campo" id="tk-titulo" maxlength="120" value="${esc(v.titulo)}" placeholder="${bug ? "Ej: El reloj se atrasa en el celular" : "Ej: Cuenta regresiva antes de arrancar"}">
    <label for="tk-desc">Descripción</label>
    <textarea class="campo" id="tk-desc" maxlength="2000" rows="4" placeholder="${bug ? "Qué hiciste, qué esperabas que pase y qué pasó." : "Qué te gustaría y para qué te serviría."}">${esc(v.desc)}</textarea>
    <label for="tk-autor">Tu nombre (opcional)</label>
    <input class="campo" id="tk-autor" maxlength="24" value="${esc(v.autor)}" autocomplete="nickname">
    <p class="pista">${bug ? "Se adjunta tu navegador para poder reproducir el error." : "Tu nombre se muestra junto al ticket."}</p>
    <p class="error" id="tk-error" role="alert"></p>
    <button class="principal-btn">Enviar</button>
  </form>`;

  caja.querySelectorAll("[data-ntipo]").forEach((b) => b.addEventListener("click", () => { v.ntipo = b.dataset.ntipo; pintarForm(); }));
  $("#tk-titulo").addEventListener("input", (e) => { v.titulo = e.target.value; });
  $("#tk-desc").addEventListener("input", (e) => { v.desc = e.target.value; });
  $("#tk-autor").addEventListener("input", (e) => { v.autor = e.target.value; });
  $("#tk-enviar").addEventListener("submit", (e) => { e.preventDefault(); enviar(); });
}

async function enviar() {
  const error = (texto) => { $("#tk-error").textContent = texto; };
  const titulo = v.titulo.trim().replace(/\s+/g, " ").slice(0, 120);
  if (titulo.length < 4) return error("Poné un título un poco más largo.");
  if (!api) return error("Todavía se están cargando los tickets. Probá en un segundo.");

  // Freno simple contra envíos repetidos; sin cuentas no hay un límite real del lado del servidor.
  let ultimo = 0;
  try { ultimo = Number(localStorage.getItem("tempo:ultimoTicket")) || 0; } catch {}
  if (Date.now() - ultimo < 60000) return error("Esperá un minuto antes de mandar otro ticket.");

  const autor = v.autor.trim().slice(0, 24);
  const t = { tipo: v.ntipo, titulo, descripcion: v.desc.trim().slice(0, 2000), autor, votos: { [votante]: true } };
  if (v.ntipo === "bug") t.contexto = navigator.userAgent.slice(0, 400);

  const boton = $("#tk-enviar button:not([type])");
  boton.disabled = true;
  try {
    await api.crear(t);
    try {
      localStorage.setItem("tempo:ultimoTicket", String(Date.now()));
      if (autor) localStorage.setItem("tempo:nombre", autor);
    } catch {}
    Object.assign(v, { abierto: false, titulo: "", desc: "", tipo: "", estado: "abiertos" });
    pintarForm();
    pintarFiltros();
    pintarLista();
    avisar("¡Gracias! Tu ticket quedó publicado.");
  } catch {
    boton.disabled = false;
    error("No se pudo enviar el ticket. Probá de nuevo.");
  }
}

// ---------- Lista ----------

function pintarFiltros() {
  const caja = $("#tk-filtros");
  caja.innerHTML = `
    <div class="chips" role="group" aria-label="Filtrar por tipo">${chip("ftipo", "", v.tipo, "Todos")}${Object.entries(TIPOS).map(([k, l]) => chip("ftipo", k, v.tipo, l + "s")).join("")}</div>
    <div class="chips" role="group" aria-label="Filtrar por estado">${chip("festado", "abiertos", v.estado, "Abiertos")}${chip("festado", "cerrados", v.estado, "Cerrados")}${chip("festado", "todos", v.estado, "Todos")}</div>`;
  caja.querySelectorAll("[data-ftipo]").forEach((b) => b.addEventListener("click", () => { v.tipo = b.dataset.ftipo; pintarFiltros(); pintarLista(); }));
  caja.querySelectorAll("[data-festado]").forEach((b) => b.addEventListener("click", () => { v.estado = b.dataset.festado; pintarFiltros(); pintarLista(); }));
}

function ticketHTML(t) {
  const votado = !!t.votos?.[votante];
  return `<li class="ticket">
    <button class="voto" data-voto="${esc(t.id)}" aria-pressed="${votado}" aria-label="${votado ? "Quitar mi voto" : "Votar"} (${t.n} ${t.n === 1 ? "voto" : "votos"})"><span aria-hidden="true">▲</span><b>${t.n}</b></button>
    <div class="tk-cuerpo">
      <div class="tk-cabeza"><span class="tk-tipo">${TIPOS[t.tipo] || "Otro"}</span><span class="tk-estado" data-estado="${esc(t.estado)}">${esc(ESTADOS[t.estado] || t.estado)}</span></div>
      <h3>${esc(t.titulo)}</h3>
      ${t.descripcion ? `<p class="tk-desc">${esc(t.descripcion)}</p>` : ""}
      ${t.respuesta ? `<p class="tk-resp"><b>Respuesta:</b> ${esc(t.respuesta)}</p>` : ""}
      <p class="tk-meta">${esc(t.autor || "Anónimo")} · ${fecha(t.createdAt)}</p>
    </div>
  </li>`;
}

function pintarLista() {
  let lista = Object.entries(tickets).map(([id, t]) => ({ id, ...t, n: Object.keys(t.votos || {}).length }));
  if (v.tipo) lista = lista.filter((t) => t.tipo === v.tipo);
  if (v.estado === "abiertos") lista = lista.filter((t) => ABIERTOS.includes(t.estado));
  if (v.estado === "cerrados") lista = lista.filter((t) => !ABIERTOS.includes(t.estado));
  lista.sort((a, b) => b.n - a.n || (b.createdAt || 0) - (a.createdAt || 0));

  const ul = $("#tk-lista");
  if (!lista.length) {
    ul.innerHTML = `<li class="vacio"><b>No hay tickets con estos filtros.</b> ¿Tenés una idea o encontraste un error? Contalo.</li>`;
    return;
  }
  ul.innerHTML = lista.map(ticketHTML).join("");
  ul.querySelectorAll("[data-voto]").forEach((b) => b.addEventListener("click", () => {
    const id = b.dataset.voto;
    api.votar(id, votante, !tickets[id]?.votos?.[votante]).catch(() => avisar("No se pudo registrar el voto."));
  }));
}

// ---------- Arranque ----------

export async function mostrarIdeas() {
  document.title = "Ideas y bugs · Tempo";
  try { v.autor = localStorage.getItem("tempo:nombre") || ""; } catch {}

  raiz.innerHTML = `
    <div class="ideas-top">
      <h1>Ideas y bugs</h1>
      <button class="secundario-btn" id="tk-nuevo" aria-expanded="false">Nuevo ticket</button>
    </div>
    <p class="bajada">Proponé mejoras, avisá si algo no anda y votá lo que te parece más importante. Lo más votado se revisa primero.</p>
    <p class="modo-local" id="tk-local" hidden>Modo local: los tickets se guardan solo en este navegador.</p>
    <div id="tk-form"></div>
    <p class="aviso" id="tk-aviso" role="status"></p>
    <div class="filtros" id="tk-filtros"></div>
    <ul class="tickets" id="tk-lista"><li class="vacio">Cargando…</li></ul>`;

  $("#tk-nuevo").addEventListener("click", () => {
    v.abierto = !v.abierto;
    pintarForm();
    if (v.abierto) $("#tk-titulo").focus();
  });
  pintarForm();
  pintarFiltros();

  try {
    api = await crearTickets();
  } catch {
    $("#tk-lista").innerHTML = `<li class="vacio">No se pudieron cargar los tickets. Revisá la conexión y recargá la página.</li>`;
    return;
  }
  $("#tk-local").hidden = api.modo !== "local";
  api.alCambiar((t) => { tickets = t; pintarLista(); });
}
