import { test } from "node:test";
import assert from "node:assert/strict";
import { PTS, streakOf, statsFor, ranking, points } from "../public/js/puntos.js";
import { ymd } from "../public/js/util.js";

const dayOffset = n => { const d = new Date(2026, 9, 29); d.setDate(d.getDate() - n); return ymd(d); };
const today = new Date(2026, 9, 29);

test("points: exactas, parciales y con error", () => {
  const q = { key: [0, 2] };
  assert.equal(points(q, new Set([0, 2])), 1);
  assert.equal(points(q, new Set([0])), 0.5);
  assert.equal(points(q, new Set([0, 1])), 0);
  assert.equal(points(q, new Set()), 0);
});

test("streakOf: cuenta días seguidos y tolera que hoy todavía no haya práctica", () => {
  assert.equal(streakOf([dayOffset(0), dayOffset(1), dayOffset(2)], today), 3);
  assert.equal(streakOf([dayOffset(1), dayOffset(2)], today), 2);
  assert.equal(streakOf([dayOffset(2), dayOffset(3)], today), 0);
});

const data = {
  tests: {
    t1: { materia: "Álgebra", materiaId: "unlp__sis__algebra", carreraId: "unlp__sis", universidadId: "unlp", autor: "ana", n: 10 },
    t2: { materia: "Física", autor: "beto", n: 5 }
  },
  scores: {
    ana: { tests: { t2: { best: 5, max: 5 } }, days: [] },
    beto: { tests: { t1: { best: 7.5, max: 10 } }, days: [] }
  }
};

test("statsFor: suma correctas, bonus de perfecto y tests subidos", () => {
  const ana = statsFor(data, "ana");
  assert.equal(ana.pts, 5 * PTS.perQ + PTS.perfect + PTS.upload);
  assert.equal(ana.perfect, 1);
  assert.equal(ana.uploads, 1);
  const beto = statsFor(data, "beto");
  assert.equal(beto.pts, Math.round(7.5 * PTS.perQ) + PTS.upload);
});

test("statsFor con filtro: solo cuenta los tests que pasan el filtro", () => {
  const soloCarrera = t => t.carreraId === "unlp__sis";
  assert.equal(statsFor(data, "ana", soloCarrera).pts, PTS.upload);
  assert.equal(statsFor(data, "beto", soloCarrera).pts, Math.round(7.5 * PTS.perQ));
});

test("ranking: ordena por puntos y deja afuera a quien no sumó", () => {
  const r = ranking(data);
  assert.deepEqual(r.map(x => x.id), ["ana", "beto"]);
  assert.deepEqual(ranking(data, t => t.materia === "Química"), []);
});
