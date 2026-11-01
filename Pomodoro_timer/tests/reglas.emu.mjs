// Pruebas de firestore.rules contra el emulador. Se corren con: npm run test:reglas
// Usa un proyecto "demo-", que nunca toca el proyecto real.
import { test, before, after, beforeEach } from "node:test";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import firebase from "firebase/compat/app";
import "firebase/compat/firestore";

const { arrayUnion } = firebase.firestore.FieldValue;
let env;
const as = uid => env.authenticatedContext(uid).firestore();
const seed = fn => env.withSecurityRulesDisabled(ctx => fn(ctx.firestore()));
const now = Date.now();
const sala = (over = {}) => ({ name: "Sala", goal: "", music: "", mods: [], log: [], focusMin: 25, breakMin: 5, longMin: 15,
  phase: "break", running: false, endsAt: 0, hostId: "host", hostSeen: now, privada: false, updatedAt: now, ...over });
const msg = (uid, over = {}) => ({ uid, nick: "x", text: "hola", ts: now, ...over });

before(async () => {
  env = await initializeTestEnvironment({ projectId: "demo-cucu", firestore: { rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8") } });
});
after(() => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await seed(async db => {
    await db.doc("admins/yo").set({ rol: "creador" });
    await db.doc("rooms/pub01").set(sala());
    await db.doc("rooms/priv1").set(sala({ privada: true }));
    await db.doc("rooms/priv1/secreto/clave").set({ clave: "abc123" });
    await db.doc("rooms/priv1/miembros/host").set({ clave: "abc123", at: 1 });
    await db.doc("rooms/pub01/chat/m1").set(msg("ana"));
    await db.doc("rooms/vieja").set(sala({ updatedAt: 1, hostSeen: 1 }));
  });
});

test("salas privadas: no se ven ni se listan sin clave", async () => {
  await assertFails(as("ana").doc("rooms/priv1").get());
  await assertFails(as("ana").collection("rooms/priv1/chat").get());
  await assertFails(as("ana").doc("rooms/priv1/secreto/clave").get());
  await assertSucceeds(as("ana").collection("rooms").where("privada", "==", false).get());
  await assertFails(as("ana").collection("rooms").get());
  await assertSucceeds(as("yo").collection("rooms").get());          // el creador ve todo
  await assertSucceeds(as("yo").doc("rooms/priv1/secreto/clave").get());
  await assertSucceeds(as("ana").doc("rooms/noexiste").get());       // para avisar "no existe"
});

test("salas privadas: se entra con la clave correcta", async () => {
  await assertFails(as("ana").doc("rooms/priv1/miembros/ana").set({ clave: "mal", at: 1 }));
  await assertFails(as("ana").doc("rooms/priv1/miembros/beto").set({ clave: "abc123", at: 1 }));
  await assertSucceeds(as("ana").doc("rooms/priv1/miembros/ana").set({ clave: "abc123", at: 1 }));
  await assertSucceeds(as("ana").doc("rooms/priv1").get());
  await assertSucceeds(as("ana").doc("rooms/priv1/secreto/clave").get());
});

test("pública ↔ privada: solo el anfitrión, y con clave creada", async () => {
  await assertFails(as("ana").doc("rooms/pub01").update({ privada: true }));
  await assertFails(as("host").doc("rooms/pub01").update({ privada: true }));   // todavía no hay clave
  await assertFails(as("ana").doc("rooms/pub01/secreto/clave").set({ clave: "zzzzzz" }));
  await assertSucceeds(as("host").doc("rooms/pub01/secreto/clave").set({ clave: "zzzzzz" }));
  await assertSucceeds(as("host").doc("rooms/pub01").update({ privada: true }));
  await assertSucceeds(as("host").doc("rooms/priv1").update({ privada: false }));
});

test("crear sala privada: solo a nombre propio", async () => {
  await assertSucceeds(as("ana").doc("rooms/nueva").set(sala({ hostId: "ana", privada: true })));
  await assertFails(as("ana").doc("rooms/otra1").set(sala({ hostId: "beto", privada: true })));
});

test("chat cerrado mientras se estudia", async () => {
  await seed(db => db.doc("rooms/pub01").update({ phase: "focus", running: true, endsAt: now + 600000 }));
  await assertFails(as("ana").collection("rooms/pub01/chat").add(msg("ana")));
  await seed(db => db.doc("rooms/pub01").update({ running: false }));
  await assertSucceeds(as("ana").collection("rooms/pub01/chat").add(msg("ana")));
  await seed(db => db.doc("rooms/pub01").update({ running: true, endsAt: now - 1000 }));   // el bloque ya terminó
  await assertSucceeds(as("ana").collection("rooms/pub01/chat").add(msg("ana")));
});

test("silencio del chat: lo decide el anfitrión", async () => {
  await seed(db => db.doc("rooms/pub01").update({ phase: "focus", running: true, endsAt: now + 600000 }));
  await assertFails(as("ana").doc("rooms/pub01").update({ chatSilencio: false }));
  await assertSucceeds(as("host").doc("rooms/pub01").update({ chatSilencio: false }));
  await assertSucceeds(as("ana").collection("rooms/pub01/chat").add(msg("ana")));    // con silencio apagado, se chatea estudiando
  await assertSucceeds(as("ana").doc("rooms/pub01").set({ running: false }, { merge: true })); // el resto sigue igual
});

test("chat: respuestas y campos válidos", async () => {
  const c = as("ana").collection("rooms/pub01/chat");
  await assertSucceeds(c.add(msg("ana", { re: { id: "m1", uid: "ana", nick: "Ana", text: "hola" } })));
  await assertFails(c.add(msg("ana", { re: { id: "m1", uid: "ana", text: "x".repeat(200) } })));
  await assertFails(c.add(msg("ana", { otro: 1 })));
  await assertFails(c.add(msg("beto")));
});

test("chat: cada uno borra lo suyo; anfitrión y creador, cualquiera", async () => {
  await assertFails(as("beto").doc("rooms/pub01/chat/m1").delete());
  await assertSucceeds(as("host").doc("rooms/pub01/chat/m1").delete());
  await seed(db => db.doc("rooms/pub01/chat/m2").set(msg("beto")));
  await assertSucceeds(as("yo").doc("rooms/pub01/chat/m2").delete());
  await seed(db => db.doc("rooms/pub01/chat/m3").set(msg("beto")));
  await assertSucceeds(as("beto").doc("rooms/pub01/chat/m3").delete());
});

test("anfitrión: no se toma mientras el actual da señal", async () => {
  await assertFails(as("ana").doc("rooms/pub01").update({ hostId: "ana", hostSeen: now }));
  await assertSucceeds(as("ana").doc("rooms/pub01").set({ running: true }, { merge: true })); // manejar el reloj sí
  await seed(db => db.doc("rooms/pub01").update({ hostSeen: now - 5 * 60000 }));
  await assertFails(as("ana").doc("rooms/pub01").update({ hostId: "beto", hostSeen: now }));   // solo para sí
  await assertFails(as("ana").doc("rooms/pub01").update({ hostId: "ana", hostSeen: now, lock: true }));
  await assertSucceeds(as("ana").doc("rooms/pub01").update({ hostId: "ana", hostSeen: now }));
});

test("anfitrión: lo pasa o lo deja libre; los demás no", async () => {
  await assertFails(as("ana").doc("rooms/pub01").update({ hostId: null }));
  await assertSucceeds(as("host").doc("rooms/pub01").update({ hostId: "ana" }));
  await assertSucceeds(as("ana").doc("rooms/pub01").update({ hostId: null }));
  await assertSucceeds(as("beto").doc("rooms/pub01").update({ hostId: "beto", hostSeen: now }));  // sin anfitrión, se toma
});

test("bloqueo: solo anfitrión y moderadores", async () => {
  await assertFails(as("ana").doc("rooms/pub01").update({ lock: true }));
  await assertSucceeds(as("host").doc("rooms/pub01").update({ lock: true, mods: ["beto"] }));
  await assertFails(as("ana").doc("rooms/pub01").set({ running: true }, { merge: true }));
  await assertSucceeds(as("beto").doc("rooms/pub01").set({ running: true }, { merge: true }));
});

test("borrar salas: anfitrión, creador o inactiva", async () => {
  await assertFails(as("ana").doc("rooms/pub01").delete());
  await assertSucceeds(as("ana").doc("rooms/vieja").delete());
  await assertSucceeds(as("yo").doc("rooms/priv1").delete());
  await assertSucceeds(as("host").doc("rooms/pub01").delete());
});

test("tickets: crear, votar y moderar", async () => {
  const t = { tipo: "bug", titulo: "No suena", descripcion: "", autor: "ana", nick: "Ana", estado: "nuevo", votos: ["ana"], createdAt: 1, updatedAt: 1 };
  await assertSucceeds(as("ana").doc("tickets/t1").set(t));
  await assertFails(as("ana").doc("tickets/t2").set({ ...t, estado: "hecho" }));
  await assertSucceeds(as("beto").doc("tickets/t1").update({ votos: arrayUnion("beto") }));
  await assertFails(as("beto").doc("tickets/t1").update({ estado: "hecho" }));
  await assertSucceeds(as("yo").doc("tickets/t1").update({ estado: "hecho", respuesta: "Listo", updatedAt: 2 }));
});

test("nombre de la sala y tareas de la sala: los cambia el anfitrión", async () => {
  await assertFails(as("ana").doc("rooms/pub01").update({ name: "Otra" }));
  await assertSucceeds(as("host").doc("rooms/pub01").update({ name: "Otra" }));
  await assertFails(as("ana").doc("rooms/pub01").update({ tareasSala: true }));
  await assertSucceeds(as("host").doc("rooms/pub01").update({ tareasSala: true }));
  await assertSucceeds(as("ana").doc("rooms/pub01").set({ running: true }, { merge: true }));   // el reloj sigue libre
});

test("cambiar la clave: el anfitrión la reemplaza y saca a los que no están", async () => {
  await seed(db => db.doc("rooms/priv1/miembros/ana").set({ clave: "abc123", at: 1 }));
  await assertFails(as("ana").doc("rooms/priv1/secreto/clave").delete());
  await assertSucceeds(as("host").doc("rooms/priv1/secreto/clave").delete());
  await assertSucceeds(as("host").doc("rooms/priv1/secreto/clave").set({ clave: "nueva1" }));
  await assertSucceeds(as("host").doc("rooms/priv1/miembros/ana").delete());
  await assertFails(as("ana").doc("rooms/priv1").get());
  await assertFails(as("ana").doc("rooms/priv1/miembros/ana").set({ clave: "abc123", at: 2 }));
  await assertSucceeds(as("ana").doc("rooms/priv1/miembros/ana").set({ clave: "nueva1", at: 2 }));
});

test("tareas de la sala: solo si están activas; tachar y borrar", async () => {
  const t = { text: "Guía 3", by: "ana", nick: "Ana", at: now, done: false };
  await assertFails(as("ana").doc("rooms/pub01/tareas/t1").set(t));                 // apagadas
  await seed(db => db.doc("rooms/pub01").update({ tareasSala: true, mods: ["mod"] }));
  await assertSucceeds(as("ana").doc("rooms/pub01/tareas/t1").set(t));
  await assertFails(as("ana").doc("rooms/pub01/tareas/t2").set({ ...t, by: "beto" }));
  await assertFails(as("beto").doc("rooms/pub01/tareas/t1").update({ text: "otra" }));
  await assertFails(as("beto").doc("rooms/pub01/tareas/t1").update({ done: true, doneBy: "ana" }));
  await assertSucceeds(as("beto").doc("rooms/pub01/tareas/t1").update({ done: true, doneBy: "beto", doneNick: "Beto" }));
  await assertSucceeds(as("ana").doc("rooms/pub01/tareas/t1").update({ done: false }));
  await assertFails(as("beto").doc("rooms/pub01/tareas/t1").delete());
  await assertSucceeds(as("mod").doc("rooms/pub01/tareas/t1").delete());
  await seed(db => db.doc("rooms/pub01/tareas/t3").set(t));
  await assertSucceeds(as("ana").doc("rooms/pub01/tareas/t3").delete());
  await assertFails(as("ana").doc("rooms/priv1/tareas/t4").set(t));                 // privada sin clave
});

test("chat: GIFs solo de GIPHY o Tenor", async () => {
  const c = as("ana").collection("rooms/pub01/chat");
  await assertSucceeds(c.add(msg("ana", { text: "", gif: "https://media2.giphy.com/media/abc123/200.gif" })));
  await assertSucceeds(c.add(msg("ana", { text: "jaja", gif: "https://media.tenor.com/xyz/tenor.gif" })));
  await assertFails(c.add(msg("ana", { text: "", gif: "https://malo.com/x.gif" })));
  await assertFails(c.add(msg("ana", { text: "" })));
});

test("novedades: las lee cualquiera, las publica el creador", async () => {
  const n = { v: "123", titulo: "Algo nuevo", items: ["uno"], createdAt: 1 };
  await assertSucceeds(env.unauthenticatedContext().firestore().collection("novedades").get());
  await assertFails(as("ana").doc("novedades/n1").set(n));
  await assertSucceeds(as("yo").doc("novedades/n1").set(n));
  await assertSucceeds(as("yo").doc("novedades/n1").update({ titulo: "Editada" }));
  await assertFails(as("yo").doc("novedades/n2").set({ ...n, extra: 1 }));
  await assertSucceeds(as("yo").doc("novedades/n1").delete());
});
