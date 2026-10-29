// Migración al catálogo académico (sprint 3).
// Asigna universidad, carrera y materia a los tests que todavía no las tienen, y crea esos documentos si faltan.
// Es idempotente: se puede correr varias veces; solo toca lo que falta.
//
// Uso (desde la carpeta scripts/):
//   npm install
//   set GOOGLE_APPLICATION_CREDENTIALS=C:\ruta\a\service-account.json      (PowerShell: $env:GOOGLE_APPLICATION_CREDENTIALS="...")
//   node migrar-academico.mjs --universidad "Universidad Nacional de La Plata" --sigla UNLP --carrera "Licenciatura en Sistemas"
//   ...lo mismo con --apply para escribir. Opcional: --asignar-usuarios para poner esa carrera a quienes no eligieron una.
//
// Sin --apply solo muestra qué haría. Con --apply, antes de escribir guarda un backup en scripts/backups/.
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { slug, uniIdOf, carreraIdOf, materiaIdOf, normTags } from "../public/js/catalogo.js";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = name => { const i = args.indexOf("--" + name); return i >= 0 ? args[i + 1] : undefined; };
const flag = name => args.includes("--" + name);

const universidad = (opt("universidad") || "").trim(), sigla = (opt("sigla") || "").trim().toUpperCase(), carrera = (opt("carrera") || "").trim();
if (!universidad || !carrera || !slug(universidad) || !slug(carrera)) {
  console.error('Faltan datos. Ejemplo: node migrar-academico.mjs --universidad "Universidad Nacional de La Plata" --sigla UNLP --carrera "Licenciatura en Sistemas"');
  process.exit(1);
}
let projectId = opt("proyecto");
if (!projectId) { try { projectId = JSON.parse(readFileSync(join(here, "..", ".firebaserc"), "utf8")).projects.default; } catch {} }
if (!projectId) { console.error("No encontré el ID del proyecto. Pasalo con --proyecto."); process.exit(1); }

const apply = flag("apply");
const db = getFirestore(initializeApp({ credential: applicationDefault(), projectId }));
const uniId = uniIdOf(universidad, sigla), carreraId = carreraIdOf(uniId, carrera);

console.log(`Proyecto: ${projectId}${apply ? "" : "  (simulación: no se escribe nada)"}`);
console.log(`Universidad: ${universidad} [${uniId}]  ·  Carrera: ${carrera} [${carreraId}]\n`);

const all = async name => (await db.collection(name).get()).docs;
const [tests, users, unis, carreras, materias] = await Promise.all(["tests", "users", "universidades", "carreras", "materias"].map(all));
const has = (docs, id) => docs.some(d => d.id === id);

const pendientes = tests.filter(d => !d.data().materiaId);
const nuevasMaterias = new Map();
for (const d of pendientes) {
  const nombre = String(d.data().materia || "").trim();
  if (!slug(nombre)) continue;
  const id = materiaIdOf(carreraId, nombre);
  if (!has(materias, id) && !nuevasMaterias.has(id)) nuevasMaterias.set(id, nombre);
}
const sinCarrera = flag("asignar-usuarios") ? users.filter(d => !d.data().carreraId) : [];

console.log(`Tests sin materia asignada: ${pendientes.length} de ${tests.length}`);
console.log(`Universidad a crear: ${has(unis, uniId) ? "no (ya existe)" : "sí"}`);
console.log(`Carrera a crear: ${has(carreras, carreraId) ? "no (ya existe)" : "sí"}`);
console.log(`Materias a crear (${nuevasMaterias.size}):`); nuevasMaterias.forEach((n, id) => console.log(`  - ${n}  [${id}]`));
if (flag("asignar-usuarios")) console.log(`Usuarios a los que se asigna esta carrera: ${sinCarrera.length}`);
const sinNombre = pendientes.filter(d => !slug(d.data().materia));
if (sinNombre.length) console.log(`\nAtención: ${sinNombre.length} tests tienen una materia sin letras ni números y se saltean: ${sinNombre.map(d => d.id).join(", ")}`);

if (!apply) { console.log("\nRevisá la lista. Para escribir, repetí el comando con --apply."); process.exit(0); }

// Backup local antes de escribir. Contiene datos de usuarios: no se sube a git (ver .gitignore).
const dump = async name => Object.fromEntries((await all(name)).map(d => [d.id, d.data()]));
const backup = {};
for (const name of ["tests", "bodies", "scores", "users", "universidades", "carreras", "materias"]) backup[name] = await dump(name);
mkdirSync(join(here, "backups"), { recursive: true });
const file = join(here, "backups", `backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
writeFileSync(file, JSON.stringify(backup));
console.log(`\nBackup guardado en ${file}`);

const now = Date.now();
let batch = db.batch(), ops = 0, total = 0;
const put = async (ref, data, merge) => {
  merge ? batch.set(ref, data, { merge: true }) : batch.set(ref, data);
  ops++; total++;
  if (ops >= 400) { await batch.commit(); batch = db.batch(); ops = 0; }
};
if (!has(unis, uniId)) await put(db.doc(`universidades/${uniId}`), { nombre: universidad, sigla, creadoPor: "migracion", createdAt: now });
if (!has(carreras, carreraId)) await put(db.doc(`carreras/${carreraId}`), { nombre: carrera, universidadId: uniId, creadoPor: "migracion", createdAt: now });
for (const [id, nombre] of nuevasMaterias) await put(db.doc(`materias/${id}`), { nombre, carreraId, universidadId: uniId, creadoPor: "migracion", createdAt: now });
for (const d of pendientes) {
  const t = d.data(); if (!slug(t.materia)) continue;
  await put(d.ref, { materiaId: materiaIdOf(carreraId, String(t.materia).trim()), carreraId, universidadId: uniId, tags: normTags(t.tags || []) }, true);
}
for (const d of sinCarrera) await put(d.ref, { universidadId: uniId, carreraId }, true);
if (ops) await batch.commit();
console.log(`Listo: ${total} escrituras.`);
