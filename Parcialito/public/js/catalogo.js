// Ids del catálogo académico. Son deterministas para que dos personas que cargan
// la misma materia terminen en el mismo documento. Los usa también scripts/migrar-academico.mjs.
export const slug = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
export const uniIdOf = (nombre, sigla) => slug(sigla || nombre);
export const carreraIdOf = (uniId, nombre) => `${uniId}__${slug(nombre)}`;
export const materiaIdOf = (carreraId, nombre) => `${carreraId}__${slug(nombre)}`;

// Clave de materia de un test: su id de catálogo o, en tests anteriores a la migración, el nombre.
export const matKey = t => t.materiaId || "txt:" + String(t.materia || "").trim().toLowerCase();

export function normTags(input) {
  const raw = Array.isArray(input) ? input : String(input || "").split(/[,;\n]/);
  const out = [];
  for (const r of raw) {
    const t = String(r).trim().replace(/^#+/, "").toLowerCase().replace(/\s+/g, " ").slice(0, 24);
    if (t && !out.includes(t)) out.push(t);
  }
  return out.slice(0, 8);
}
