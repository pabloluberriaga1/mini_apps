// Pruebas de firestore.rules contra el emulador. Se corren con: npm run test:reglas
// Usa un proyecto "demo-", que nunca toca el proyecto real.
import { test, before, after, beforeEach } from "node:test";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import firebase from "firebase/compat/app";
import "firebase/compat/firestore";

const { arrayUnion, arrayRemove } = firebase.firestore.FieldValue;
let env;
const as = uid => env.authenticatedContext(uid).firestore();
const seed = fn => env.withSecurityRulesDisabled(ctx => fn(ctx.firestore()));
const ticket = (over = {}) => ({ tipo: "mejora", titulo: "Filtrar por año", descripcion: "", autor: "ana", estado: "nuevo", votos: ["ana"], createdAt: 1, updatedAt: 1, ...over });

before(async () => {
  env = await initializeTestEnvironment({ projectId: "demo-parcialito", firestore: { rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8") } });
});
after(() => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await seed(async db => {
    await db.doc("admins/global").set({ rol: "admin" });
    await db.doc("admins/modunlp").set({ universidades: ["unlp"] });
    await db.doc("universidades/unlp").set({ nombre: "UNLP", sigla: "UNLP", creadoPor: "x", createdAt: 1 });
    await db.doc("carreras/unlp__sis").set({ nombre: "Sistemas", universidadId: "unlp", creadoPor: "x", createdAt: 1 });
    await db.doc("tests/tu").set({ materia: "Álgebra", materiaId: "unlp__sis__algebra", universidadId: "unlp", parcial: "1", titulo: "T", n: 1, autor: "beto" });
    await db.doc("bodies/tu").set({ autor: "beto", questions: [{}] });
    await db.doc("tests/tx").set({ materia: "Física", universidadId: "otra", parcial: "1", titulo: "T", n: 1, autor: "beto" });
    await db.doc("tickets/k1").set(ticket());
  });
});

/* ---------- ticketera ---------- */
test("ticket: se crea en estado nuevo con el voto propio", () => assertSucceeds(as("ana").collection("tickets").add(ticket())));
test("ticket: no se puede crear ya marcado como hecho", () => assertFails(as("ana").collection("tickets").add(ticket({ estado: "hecho" }))));
test("ticket: no se puede crear a nombre de otro", () => assertFails(as("ana").collection("tickets").add(ticket({ autor: "beto", votos: ["beto"] }))));
test("ticket: no se puede crear con respuesta de moderador", () => assertFails(as("ana").collection("tickets").add(ticket({ respuesta: "ok" }))));
test("voto: agregar el propio", () => assertSucceeds(as("beto").doc("tickets/k1").update({ votos: arrayUnion("beto") })));
test("voto: quitar el propio", () => assertSucceeds(as("ana").doc("tickets/k1").update({ votos: arrayRemove("ana") })));
test("voto: no se puede agregar el de otra persona", () => assertFails(as("beto").doc("tickets/k1").update({ votos: arrayUnion("caro") })));
test("voto: no se puede cambiar el título al votar", () => assertFails(as("beto").doc("tickets/k1").update({ votos: arrayUnion("beto"), titulo: "otro" })));
test("ticket: un admin cambia estado y respuesta", () => assertSucceeds(as("global").doc("tickets/k1").update({ estado: "planificado", respuesta: "Va", issueUrl: "", updatedAt: 2 })));
test("ticket: alguien sin permisos no cambia el estado", () => assertFails(as("ana").doc("tickets/k1").update({ estado: "hecho" })));
test("ticket: el autor lo borra mientras está nuevo", () => assertSucceeds(as("ana").doc("tickets/k1").delete()));
test("ticket: otra persona no lo puede borrar", () => assertFails(as("beto").doc("tickets/k1").delete()));

/* ---------- perfil y catálogo ---------- */
test("users: guardar universidad y carrera con merge", () =>
  assertSucceeds(as("ana").doc("users/ana").set({ name: "Ana", photo: "", universidadId: "unlp", carreraId: "unlp__sis", updatedAt: 1 }, { merge: true })));
test("users: no se aceptan campos extra", () => assertFails(as("ana").doc("users/ana").set({ name: "Ana", photo: "", rol: "admin" })));
test("users: el login de un cliente viejo (sin merge) sigue andando", () => assertSucceeds(as("ana").doc("users/ana").set({ name: "Ana", photo: "", updatedAt: 1 })));
test("catálogo: universidad, carrera y materia nuevas en un mismo lote", () => {
  const db = as("ana"), b = db.batch();
  b.set(db.doc("universidades/unc"), { nombre: "UNC", sigla: "UNC", creadoPor: "ana", createdAt: 1 });
  b.set(db.doc("carreras/unc__bio"), { nombre: "Biología", universidadId: "unc", creadoPor: "ana", createdAt: 1 });
  b.set(db.doc("materias/unc__bio__quimica"), { nombre: "Química", carreraId: "unc__bio", universidadId: "unc", creadoPor: "ana", createdAt: 1 });
  return assertSucceeds(b.commit());
});
test("catálogo: no se crea una carrera de una universidad que no existe", () =>
  assertFails(as("ana").doc("carreras/nada__x").set({ nombre: "X", universidadId: "nada", creadoPor: "ana", createdAt: 1 })));
test("catálogo: no se puede pisar una universidad existente", () =>
  assertFails(as("ana").doc("universidades/unlp").set({ nombre: "Otra", sigla: "", creadoPor: "ana", createdAt: 1 })));

/* ---------- tests y moderación ---------- */
test("tests: un cliente viejo, sin catálogo ni etiquetas, puede seguir publicando", () =>
  assertSucceeds(as("ana").collection("tests").add({ materia: "Física", parcial: "1er parcial", titulo: "Simulacro", n: 3, autor: "ana", orden: null, createdAt: 1 })));
test("tests: más de 8 etiquetas se rechaza", () =>
  assertFails(as("ana").collection("tests").add({ materia: "F", parcial: "1", titulo: "T", n: 3, autor: "ana", tags: Array.from({ length: 9 }, (_, i) => "t" + i) })));
test("moderación: el moderador de la UNLP borra un test de la UNLP con su cuerpo", () => {
  const db = as("modunlp"), b = db.batch();
  b.delete(db.doc("tests/tu")); b.delete(db.doc("bodies/tu"));
  return assertSucceeds(b.commit());
});
test("moderación: el moderador de la UNLP no borra tests de otra universidad", () => assertFails(as("modunlp").doc("tests/tx").delete()));
test("moderación: un admin viejo (sin lista de universidades) sigue siendo global", () => assertSucceeds(as("global").doc("tests/tx").delete()));
test("moderación: alguien sin permisos no borra tests ajenos", () => assertFails(as("ana").doc("tests/tu").delete()));

/* ---------- intentos y suscripciones ---------- */
const intento = (over = {}) => ({ uid: "ana", testId: "tu", materia: "Álgebra", materiaId: "unlp__sis__algebra", carreraId: "unlp__sis", universidadId: "unlp", score: 7.5, max: 10, at: 1730000000000, ...over });
test("attempts: se guarda un intento propio", () => assertSucceeds(as("ana").collection("attempts").add(intento())));
test("attempts: un intento de un test viejo, sin ids de catálogo", () => assertSucceeds(as("ana").collection("attempts").add(intento({ materiaId: null, carreraId: null, universidadId: null }))));
test("attempts: puntaje mayor al máximo se rechaza", () => assertFails(as("ana").collection("attempts").add(intento({ score: 11 }))));
test("attempts: no se guarda a nombre de otro", () => assertFails(as("ana").collection("attempts").add(intento({ uid: "beto" }))));
test("attempts: cada uno lee solo los suyos", async () => {
  await seed(db => db.doc("attempts/a1").set(intento()));
  await assertSucceeds(as("ana").collection("attempts").where("uid", "==", "ana").get());
  await assertFails(as("beto").doc("attempts/a1").get());
});
test("attempts: no se pueden editar", async () => {
  await seed(db => db.doc("attempts/a1").set(intento()));
  await assertFails(as("ana").doc("attempts/a1").update({ score: 10 }));
});
test("subs: cada uno guarda y lee lo suyo, y nadie más lo lee", async () => {
  await assertSucceeds(as("ana").doc("subs/ana").set({ materias: ["unlp__sis__algebra"], tags: ["parcial"], seenAt: 0 }));
  await assertFails(as("beto").doc("subs/ana").get());
});
