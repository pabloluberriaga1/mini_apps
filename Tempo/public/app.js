import { crearSync } from "./sync.js";

// ---------- Identidad y sala ----------

const clienteId = (() => {
  // sessionStorage: un id por pestaña, que sobrevive a recargar la página
  let id = sessionStorage.getItem("tempo:id");
  if (!id) {
    id = Math.random().toString(36).slice(2, 10);
    sessionStorage.setItem("tempo:id", id);
  }
  return id;
})();

function salaDesdeUrl() {
  let sala = decodeURIComponent(location.hash.slice(1)).trim().toLowerCase();
  sala = sala.replace(/[^a-z0-9-]/g, "");
  if (!sala) {
    sala = "sala-" + Math.random().toString(36).slice(2, 6);
    history.replaceState(null, "", "#" + sala);
  }
  return sala;
}

// ---------- Estado de la sala ----------
// Todo lo compartido vive en este objeto. Para sumar funciones
// (tramos de la canción, marcas, cuenta regresiva...) agregá campos acá
// y una acción abajo.

function estadoInicial(hostId) {
  return {
    corriendo: false,
    inicio: null,      // hora del servidor (ms) en que arrancó el tramo actual
    acumulado: 0,      // ms acumulados antes de la última pausa
    hostId,
    control: "grupo",  // "grupo": controlan todos | "host": solo el host
  };
}

function transcurrido(estado, ahora) {
  if (!estado) return 0;
  return estado.acumulado + (estado.corriendo ? ahora - estado.inicio : 0);
}

function puedeControlar(estado, yo) {
  return !!estado && (estado.control === "grupo" || estado.hostId === yo);
}

// ---------- Acciones ----------
// Cada acción recibe el estado actual y devuelve el nuevo,
// o undefined para no cambiar nada.

const acciones = {
  alternar: (e, ahora) => e && puedeControlar(e, clienteId)
    ? e.corriendo
      ? { ...e, corriendo: false, inicio: null, acumulado: e.acumulado + (ahora - e.inicio) }
      : { ...e, corriendo: true, inicio: ahora }
    : undefined,

  reiniciar: (e) => e && puedeControlar(e, clienteId)
    ? { ...e, corriendo: false, inicio: null, acumulado: 0 }
    : undefined,

  cambiarControl: (e) => e && e.hostId === clienteId
    ? { ...e, control: e.control === "grupo" ? "host" : "grupo" }
    : undefined,

  tomarHost: (e) => e ? { ...e, hostId: clienteId } : undefined,
};

// ---------- UI ----------

const $ = (s) => document.querySelector(s);
const ui = {
  reloj: $("#reloj"),
  min: $("#reloj .principal"),
  dec: $("#reloj .decima"),
  estadoTxt: $("#estado-txt"),
  sala: $("#sala-nombre"),
  copiar: $("#copiar"),
  alternar: $("#alternar"),
  reiniciar: $("#reiniciar"),
  control: $("#control"),
  controlTxt: $("#control-txt"),
  tomar: $("#tomar"),
  gente: $("#gente"),
  aviso: $("#aviso"),
  entrada: $("#entrada"),
  nombreInput: $("#nombre"),
  modoLocal: $("#modo-local"),
};

function formatear(ms) {
  ms = Math.max(0, ms);
  const totalSeg = Math.floor(ms / 1000);
  const h = Math.floor(totalSeg / 3600);
  const m = Math.floor((totalSeg % 3600) / 60);
  const s = totalSeg % 60;
  const dd = (n) => String(n).padStart(2, "0");
  return {
    principal: h > 0 ? `${h}:${dd(m)}:${dd(s)}` : `${dd(m)}:${dd(s)}`,
    decima: Math.floor((ms % 1000) / 100),
  };
}

let estado = null;
let gente = {};
let sync = null;

function pintar() {
  const yoPuedo = puedeControlar(estado, clienteId);
  const soyHost = estado?.hostId === clienteId;
  const hostPresente = !!(estado && gente[estado.hostId]);

  ui.reloj.dataset.corriendo = estado?.corriendo ? "si" : "no";
  ui.estadoTxt.textContent = estado?.corriendo
    ? "Corriendo"
    : transcurrido(estado, sync.ahora()) > 0 ? "En pausa" : "Listo para arrancar";

  ui.alternar.textContent = estado?.corriendo ? "Pausar" : (transcurrido(estado, sync.ahora()) > 0 ? "Seguir" : "Arrancar");
  ui.alternar.disabled = !yoPuedo;
  ui.reiniciar.disabled = !yoPuedo;

  ui.control.hidden = !soyHost;
  ui.control.setAttribute("aria-pressed", estado?.control === "host" ? "true" : "false");
  ui.controlTxt.textContent = estado?.control === "host" ? "Controla solo el host" : "Controlan todos";

  ui.tomar.hidden = soyHost || hostPresente;

  if (!yoPuedo && estado) {
    const nombreHost = gente[estado.hostId]?.nombre || "el host";
    ui.aviso.textContent = `${nombreHost} maneja el cronómetro.`;
  } else {
    ui.aviso.textContent = "";
  }

  ui.gente.replaceChildren(
    ...Object.entries(gente)
      .sort(([, a], [, b]) => (a.desde || 0) - (b.desde || 0))
      .map(([id, p]) => {
        const li = document.createElement("li");
        li.textContent = p.nombre + (id === clienteId ? " (vos)" : "");
        if (id === estado?.hostId) li.classList.add("host");
        return li;
      })
  );
}

function tic() {
  if (sync) {
    const t = formatear(transcurrido(estado, sync.ahora()));
    if (ui.min.textContent !== t.principal) ui.min.textContent = t.principal;
    ui.dec.textContent = "." + t.decima;
  }
  requestAnimationFrame(tic);
}

function hacer(accion) {
  sync.modificarEstado((actual) => acciones[accion](actual, sync.ahora()));
}

// ---------- Arranque ----------

async function iniciar(nombre) {
  const salaId = salaDesdeUrl();
  ui.sala.textContent = salaId;
  document.title = `${salaId} · Tempo`;

  sync = await crearSync(salaId, clienteId);
  ui.modoLocal.hidden = sync.modo !== "local";

  sync.alCambiarEstado((e) => { estado = e; pintar(); });
  sync.alCambiarGente((g) => { gente = g; pintar(); });

  // Si la sala no existe, la crea y quien entra primero queda como host.
  await sync.modificarEstado((actual) => actual ? undefined : estadoInicial(clienteId));
  await sync.entrar(nombre);

  requestAnimationFrame(tic);
}

ui.alternar.addEventListener("click", () => hacer("alternar"));
ui.reiniciar.addEventListener("click", () => hacer("reiniciar"));
ui.control.addEventListener("click", () => hacer("cambiarControl"));
ui.tomar.addEventListener("click", () => hacer("tomarHost"));

ui.copiar.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(location.href);
    ui.copiar.textContent = "Link copiado";
  } catch {
    ui.copiar.textContent = "Copiá el link de la barra";
  }
  setTimeout(() => (ui.copiar.textContent = "Copiar link"), 2000);
});

document.addEventListener("keydown", (ev) => {
  if (!sync || ev.target.closest("input, textarea")) return;
  if (ev.code === "Space") { ev.preventDefault(); hacer("alternar"); }
  if (ev.key === "r" || ev.key === "R") hacer("reiniciar");
});

window.addEventListener("hashchange", () => location.reload());

ui.entrada.addEventListener("submit", (ev) => {
  ev.preventDefault();
  const nombre = ui.nombreInput.value.trim().slice(0, 24);
  if (!nombre) return ui.nombreInput.focus();
  try { localStorage.setItem("tempo:nombre", nombre); } catch {}
  ui.entrada.closest("dialog").close();
  iniciar(nombre);
});

// Precargar el nombre usado la última vez
try { ui.nombreInput.value = localStorage.getItem("tempo:nombre") || ""; } catch {}
$("#dialogo").addEventListener("cancel", (ev) => ev.preventDefault());
$("#dialogo").showModal();
ui.nombreInput.focus();
