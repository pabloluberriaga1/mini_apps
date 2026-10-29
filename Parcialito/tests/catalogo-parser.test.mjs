import { test } from "node:test";
import assert from "node:assert/strict";
import { slug, uniIdOf, carreraIdOf, materiaIdOf, matKey, normTags } from "../public/js/catalogo.js";
import { parseText, parseJSONData, validate, EXAMPLE } from "../public/js/parser.js";

test("slug: sin tildes, en minúscula y con guiones", () => {
  assert.equal(slug("Minería de Datos"), "mineria-de-datos");
  assert.equal(slug("  ¡Álgebra II!  "), "algebra-ii");
  assert.equal(slug("???"), "");
});

test("ids del catálogo: la misma materia escrita distinto cae en el mismo id", () => {
  const u = uniIdOf("Universidad Nacional de La Plata", "UNLP");
  assert.equal(u, "unlp");
  const c = carreraIdOf(u, "Lic. en Sistemas");
  assert.equal(materiaIdOf(c, "Minería de Datos"), materiaIdOf(c, "mineria de datos"));
});

test("matKey: usa el id de catálogo o, en tests viejos, el nombre", () => {
  assert.equal(matKey({ materiaId: "x__y__z", materia: "Z" }), "x__y__z");
  assert.equal(matKey({ materia: " Física " }), "txt:física");
});

test("normTags: limpia, deduplica y corta en 8", () => {
  assert.deepEqual(normTags("#Parcial, parcial ,  Unidad   3,,"), ["parcial", "unidad 3"]);
  assert.equal(normTags(Array.from({ length: 12 }, (_, i) => "t" + i)).length, 8);
});

test("parseText: el ejemplo de la ayuda se lee sin errores", () => {
  const p = parseText(EXAMPLE);
  assert.equal(p.tests[0].questions.length, 2);
  assert.deepEqual(p.tests[0].questions[1].key, [0, 2]);
  assert.deepEqual(validate(p), []);
});

test("parseJSONData: lee las etiquetas que devuelve la IA", () => {
  const p = parseJSONData({ titulo: "T", tags: ["Unidad 1", "#unidad 1"], questions: [{ stem: "¿?", opts: ["a", "b"], key: [1] }] });
  assert.deepEqual(p.tests[0].tags, ["unidad 1"]);
});
