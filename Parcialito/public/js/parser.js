import { textToHtml } from "./util.js";
import { normTags } from "./catalogo.js";

export const EXAMPLE = `### Caso A1: Ventas por región
La empresa tiene 4 regiones y quiere comparar ventas mensuales.

1. ¿Qué gráfico conviene para comparar las 4 regiones mes a mes? (Caso A1)
a) Torta
*b) Líneas, una por región
c) Mapa de calor sin etiquetas
> Las líneas muestran la evolución y permiten comparar.

2. ¿Cuáles son variables cuantitativas?
*a) Temperatura
b) Provincia
*c) Edad
> Provincia es categórica.`;

export function parseText(txt) {
  const lines = txt.replace(/\r/g, "").split("\n");
  const cases = [], questions = []; let cur = null, curCase = null;
  const qRe = /^\s*(\d+)\s*[.)-]\s+(.+)$/, oRe = /^\s*(\*?)\s*([a-hA-H])\s*[.)]\s*(\*?)\s*(.+)$/, cRe = /^\s*#{2,3}\s*Caso\s+([\w.-]+)\s*[:.-]?\s*(.*)$/i;
  const closeCase = () => { if (curCase) { cases.push({ id: curCase.id, title: curCase.title, html: textToHtml(curCase.text) }); curCase = null; } };
  for (const raw of lines) {
    const line = raw.trimEnd(); let m;
    if ((m = line.match(cRe))) { closeCase(); cur = null; curCase = { id: m[1], title: m[2] || "", text: "" }; continue; }
    if ((m = line.match(qRe))) {
      closeCase(); cur = { stem: m[2].trim(), opts: [], key: [], why: "" }; questions.push(cur);
      const cm = cur.stem.match(/\(\s*caso\s+([\w.-]+)\s*\)/i); if (cm) { cur.case = cm[1]; cur.stem = cur.stem.replace(cm[0], "").trim(); }
      continue;
    }
    if (curCase) { curCase.text += line + "\n"; continue; }
    if (!cur) continue;
    if ((m = line.match(oRe)) && (cur.opts.length ? true : m[2].toLowerCase() === "a")) { if (m[1] || m[3]) cur.key.push(cur.opts.length); cur.opts.push(m[4].trim()); continue; }
    if (/^\s*>/.test(line) || /^\s*explicaci[oó]n\s*:/i.test(line)) { cur.why += (cur.why ? " " : "") + line.replace(/^\s*>\s*/, "").replace(/^\s*explicaci[oó]n\s*:\s*/i, "").trim(); continue; }
    if (line.trim()) { if (cur.opts.length) cur.opts[cur.opts.length - 1] += " " + line.trim(); else cur.stem += " " + line.trim(); }
  }
  closeCase();
  return { tests: [{ titulo: "", cases, questions }] };
}

export function normalizeQuestions(qs) {
  return (qs || []).map(q => {
    const raw = q.opts || q.options || q.opciones || [];
    const opts = raw.map(o => typeof o === "string" ? o : (o.t ?? o.text ?? o.texto ?? ""));
    const letters = raw.map(o => typeof o === "object" ? o.l : null);
    let key = q.key ?? q.correctas ?? q.answer ?? []; if (!Array.isArray(key)) key = [key];
    key = key.map(k => typeof k === "number" ? k : (letters.includes(k) ? letters.indexOf(k) : String(k).toLowerCase().charCodeAt(0) - 97)).filter(k => k >= 0 && k < opts.length);
    const out = { stem: String(q.stem || q.pregunta || q.question || "").trim(), opts, key: [...new Set(key)].sort((a, b) => a - b), why: String(q.why || q.explicacion || q.explanation || "") };
    if (q.case) out.case = String(q.case);
    return out;
  });
}

export function parseJSONData(D) {
  if (D && Array.isArray(D.units)) return { tests: D.units.map(u => ({ titulo: `Unidad ${u.n}. ${u.title}`, intro: u.intro || "", cases: (u.cases || []).map(c => ({ id: c.id, title: c.title, html: c.html })), questions: normalizeQuestions(u.q), orden: u.n })) };
  if (Array.isArray(D) && D.length && !D[0].questions) return { tests: [{ titulo: "", questions: normalizeQuestions(D) }] };
  const arr = Array.isArray(D) ? D : [D];
  return { tests: arr.map(t => ({ titulo: t.titulo || t.title || "", intro: t.intro || "", materia: t.materia, parcial: t.parcial, tags: normTags(t.tags || []), cases: (t.cases || []).map(c => ({ id: String(c.id), title: c.title || "", html: c.html || textToHtml(c.text || "") })), questions: normalizeQuestions(t.questions || t.preguntas) })) };
}

export function parseHTMLFile(src) {
  const i = src.indexOf("const DATA"); if (i < 0) throw new Error("Ese HTML no trae un test que Parcialito reconozca.");
  const s = src.indexOf("{", i), e = src.indexOf("\n", s);
  return parseJSONData(JSON.parse(src.slice(s, e < 0 ? undefined : e).trim().replace(/;\s*$/, "")));
}

export function extractJSON(txt) {
  const t = txt.replace(/```(?:json)?/g, "").trim();
  const a = Math.min(...["{", "["].map(c => { const k = t.indexOf(c); return k < 0 ? Infinity : k; }));
  const b = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
  if (!isFinite(a) || b < a) throw new Error("No encontré JSON en la respuesta. Copiá la respuesta completa de la IA.");
  return JSON.parse(t.slice(a, b + 1));
}

export function validate(parsed) {
  const errors = [];
  parsed.tests.forEach((t, ti) => {
    const tag = parsed.tests.length > 1 ? `Test ${ti + 1}, ` : "";
    if (!t.questions.length) errors.push(`${tag}no se encontró ninguna pregunta. Revisá que estén numeradas (1., 2., …).`);
    if (t.questions.length > 300) errors.push(`${tag}tiene más de 300 preguntas. Dividilo en partes.`);
    t.questions.forEach((q, qi) => {
      if (!q.stem) errors.push(`${tag}pregunta ${qi + 1}: falta el enunciado.`);
      if (q.opts.length < 2) errors.push(`${tag}pregunta ${qi + 1}: necesita al menos dos opciones.`);
      if (!q.key.length) errors.push(`${tag}pregunta ${qi + 1}: marcá la correcta con un asterisco.`);
      if (q.case && !(t.cases || []).some(c => c.id === q.case)) errors.push(`${tag}pregunta ${qi + 1}: menciona el caso ${q.case}, que no está cargado.`);
    });
  });
  return errors;
}

export const AI_PROMPT = material => `Convertí el material de estudio de abajo en un test de opción múltiple para estudiantes universitarios argentinos.
Reglas:
- Si el material ya trae preguntas con respuestas, respetalas tal cual. Si trae preguntas sin respuestas, resolvelas. Si son apuntes, armá entre 8 y 20 preguntas sobre lo más importante.
- Cada pregunta tiene entre 3 y 5 opciones; puede haber una o varias correctas.
- "key" son los índices (desde 0) de las opciones correctas.
- "why" explica en una o dos oraciones por qué esas son las correctas.
- "tags" son entre 1 y 4 etiquetas cortas sobre los temas del test, en minúscula.
Respondé SOLO con JSON, sin texto antes ni después, con esta forma:
{"titulo": "título corto", "tags": ["tema"], "questions": [{"stem": "enunciado", "opts": ["opción", "opción", "opción"], "key": [0], "why": "explicación"}]}

MATERIAL:
${material}`;
