import { ymd } from "./util.js";
import { matKey } from "./catalogo.js";

export const PTS = { perQ: 10, perfect: 50, upload: 30 };

export function streakOf(days, today = new Date()) {
  const set = new Set(days); const d = new Date(today); let n = 0;
  if (!set.has(ymd(d))) { d.setDate(d.getDate() - 1); if (!set.has(ymd(d))) return 0; }
  while (set.has(ymd(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

// data = { scores, tests }. pred(test, id) filtra qué tests cuentan; sin pred cuentan todos.
export function statsFor({ scores, tests }, uid, pred) {
  const sc = scores[uid] || {};
  let pts = 0, done = 0, perfect = 0, uploads = 0, sum = 0, max = 0; const mats = new Set();
  for (const [tid, r] of Object.entries(sc.tests || {})) {
    const t = tests[tid]; if (!t || (pred && !pred(t, tid))) continue;
    pts += Math.round(r.best * PTS.perQ); done++; sum += r.best; max += r.max; mats.add(matKey(t));
    if (r.max > 0 && r.best >= r.max) { pts += PTS.perfect; perfect++; }
  }
  for (const [id, t] of Object.entries(tests)) if (t.autor === uid && (!pred || pred(t, id))) { uploads++; pts += PTS.upload; }
  return { pts, done, perfect, uploads, avg: max ? sum / max : null, mats: mats.size, streak: streakOf(sc.days || []) };
}

export function participants({ scores, tests }) {
  const ids = new Set(Object.keys(scores));
  Object.values(tests).forEach(t => t.autor && ids.add(t.autor));
  return [...ids];
}

export function ranking(data, pred) {
  return participants(data).map(id => ({ id, ...statsFor(data, id, pred) })).filter(r => r.pts > 0)
    .sort((a, b) => b.pts - a.pts || b.perfect - a.perfect || (b.avg ?? 0) - (a.avg ?? 0));
}

export const badges = st => [
  ["Primer test", st.done >= 1], ["Puntaje perfecto", st.perfect >= 1], ["Tres perfectos", st.perfect >= 3],
  ["Primer aporte", st.uploads >= 1], ["Cinco aportes", st.uploads >= 5],
  ["Racha de 3 días", st.streak >= 3], ["Racha de 7 días", st.streak >= 7], ["Tres materias", st.mats >= 3]
];

// 1 si marcó exactamente las correctas, 0.5 si marcó solo correctas pero le faltaron, 0 si marcó alguna incorrecta o nada.
export function points(q, sel) {
  const key = new Set(q.key);
  if (sel.size === key.size && [...sel].every(x => key.has(x))) return 1;
  if (sel.size > 0 && [...sel].every(x => key.has(x))) return 0.5;
  return 0;
}
