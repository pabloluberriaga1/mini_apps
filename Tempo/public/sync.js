// Capa de sincronización. La app solo habla con esta interfaz:
//
//   sync.ahora()               → hora del servidor en ms (corrige el reloj local)
//   sync.alCambiarEstado(cb)   → cb(estado) cada vez que cambia el estado de la sala
//   sync.modificarEstado(fn)   → fn(estadoActual) devuelve el nuevo estado (atómico)
//   sync.alCambiarGente(cb)    → cb({ id: { nombre } }) con quién está conectado
//   sync.entrar(nombre)        → registra a este cliente (se borra al desconectarse)
//   sync.modo                  → "firebase" | "local"
//
// Para sumar funciones nuevas (tramos, marcas, etc.) alcanza con agregar
// campos al estado: no hace falta tocar este archivo.
//
// Ideas y bugs (crearTickets) tiene su propia interfaz, más abajo.

import { firebaseConfig } from "./firebase-config.js";

const FB = "https://www.gstatic.com/firebasejs/10.12.2";

export async function crearSync(salaId, clienteId) {
  if (firebaseConfig.databaseURL) {
    return crearSyncFirebase(salaId, clienteId);
  }
  return crearSyncLocal(salaId, clienteId);
}

// Una sola conexión por página, la pidan la sala o los tickets.
let conexion = null;
function conectar() {
  conexion ??= (async () => {
    const { initializeApp } = await import(`${FB}/firebase-app.js`);
    const fdb = await import(`${FB}/firebase-database.js`);
    return { fdb, db: fdb.getDatabase(initializeApp(firebaseConfig)) };
  })();
  return conexion;
}

// ---------- Firebase Realtime Database ----------

async function crearSyncFirebase(salaId, clienteId) {
  const { fdb, db } = await conectar();
  const { ref, onValue, set, runTransaction, onDisconnect, serverTimestamp } = fdb;

  const base = `salas/${salaId}`;
  const estadoRef = ref(db, `${base}/estado`);
  const yoRef = ref(db, `${base}/gente/${clienteId}`);

  // Firebase nos dice cuánto difiere nuestro reloj del suyo.
  let desfase = 0;
  onValue(ref(db, ".info/serverTimeOffset"), (s) => { desfase = s.val() || 0; });

  return {
    modo: "firebase",
    ahora: () => Date.now() + desfase,
    alCambiarEstado: (cb) => onValue(estadoRef, (s) => cb(s.val())),
    modificarEstado: (fn) => runTransaction(estadoRef, (actual) => fn(actual)),
    alCambiarGente: (cb) => onValue(ref(db, `${base}/gente`), (s) => cb(s.val() || {})),
    entrar: async (nombre) => {
      await set(yoRef, { nombre, desde: serverTimestamp() });
      onDisconnect(yoRef).remove();
    },
  };
}

// ---------- Modo local (pestañas del mismo navegador) ----------

function crearSyncLocal(salaId, clienteId) {
  const kEstado = `tempo:${salaId}:estado`;
  const kGente = `tempo:${salaId}:gente`;
  const canal = new BroadcastChannel(`tempo:${salaId}`);
  const subsEstado = [];
  const subsGente = [];

  const leer = (k, def) => {
    try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch { return def; }
  };
  const escribir = (k, v) => {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch {}
  };

  const emitirEstado = () => subsEstado.forEach((cb) => cb(leer(kEstado, null)));
  const genteViva = () => {
    const gente = leer(kGente, {});
    const limite = Date.now() - 6000;
    return Object.fromEntries(Object.entries(gente).filter(([, p]) => p.visto > limite));
  };
  const emitirGente = () => subsGente.forEach((cb) => cb(genteViva()));

  canal.onmessage = (e) => {
    if (e.data === "estado") emitirEstado();
    if (e.data === "gente") emitirGente();
  };

  let miNombre = null;
  const latido = () => {
    if (!miNombre) return;
    const gente = leer(kGente, {});
    gente[clienteId] = { nombre: miNombre, visto: Date.now() };
    escribir(kGente, gente);
    canal.postMessage("gente");
    emitirGente();
  };
  setInterval(latido, 2000);
  window.addEventListener("pagehide", () => {
    const gente = leer(kGente, {});
    delete gente[clienteId];
    escribir(kGente, gente);
    canal.postMessage("gente");
  });

  return {
    modo: "local",
    ahora: () => Date.now(),
    alCambiarEstado: (cb) => { subsEstado.push(cb); cb(leer(kEstado, null)); },
    modificarEstado: async (fn) => {
      const nuevo = fn(leer(kEstado, null));
      if (nuevo === undefined) return;
      escribir(kEstado, nuevo);
      canal.postMessage("estado");
      emitirEstado();
    },
    alCambiarGente: (cb) => { subsGente.push(cb); cb(genteViva()); },
    entrar: async (nombre) => { miNombre = nombre; latido(); },
  };
}

// ---------- Ideas y bugs ----------
//
//   tickets.alCambiar(cb)              → cb({ id: ticket }) con todos los tickets
//   tickets.crear(ticket)              → publica un ticket nuevo, con estado "nuevo"
//   tickets.votar(id, votante, si)     → suma (si = true) o saca el voto de ese navegador
//   tickets.modo                       → "firebase" | "local"
//
// El estado y la respuesta de cada ticket se cambian desde la consola de
// Firebase: las reglas no dejan que la app los toque.

export async function crearTickets() {
  return firebaseConfig.databaseURL ? crearTicketsFirebase() : crearTicketsLocal();
}

async function crearTicketsFirebase() {
  const { fdb, db } = await conectar();
  const { ref, onValue, push, set, serverTimestamp } = fdb;

  return {
    modo: "firebase",
    alCambiar: (cb) => onValue(ref(db, "tickets"), (s) => cb(s.val() || {})),
    crear: (t) => set(push(ref(db, "tickets")), { ...t, estado: "nuevo", createdAt: serverTimestamp() }),
    votar: (id, votante, si) => set(ref(db, `tickets/${id}/votos/${votante}`), si ? true : null),
  };
}

function crearTicketsLocal() {
  const k = "tempo:tickets";
  const canal = new BroadcastChannel(k);
  const subs = [];

  const leer = () => {
    try { return JSON.parse(localStorage.getItem(k)) || {}; } catch { return {}; }
  };
  const guardar = (todos) => {
    try { localStorage.setItem(k, JSON.stringify(todos)); } catch {}
    canal.postMessage("tickets");
    subs.forEach((cb) => cb(todos));
  };
  canal.onmessage = () => { const todos = leer(); subs.forEach((cb) => cb(todos)); };

  return {
    modo: "local",
    alCambiar: (cb) => { subs.push(cb); cb(leer()); },
    crear: async (t) => {
      const todos = leer();
      todos[Date.now().toString(36) + Math.random().toString(36).slice(2, 6)] = { ...t, estado: "nuevo", createdAt: Date.now() };
      guardar(todos);
    },
    votar: async (id, votante, si) => {
      const todos = leer();
      if (!todos[id]) return;
      const votos = { ...todos[id].votos };
      if (si) votos[votante] = true; else delete votos[votante];
      todos[id].votos = votos;
      guardar(todos);
    },
  };
}
