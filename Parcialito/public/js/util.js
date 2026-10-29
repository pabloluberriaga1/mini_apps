export const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
export const fmt = v => (Math.round(v * 10) / 10).toString().replace(".", ",");
export const letter = i => String.fromCharCode(97 + i);
export const norm = s => String(s || "").trim().replace(/\s+/g, " ");
export const ymd = (d = new Date()) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
export const fecha = ts => new Date(ts).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" });
export const textToHtml = t => String(t || "").split(/\n\s*\n/).map(p => p.trim()).filter(Boolean).map(p => "<p>" + esc(p).replace(/\n/g, "<br>") + "</p>").join("");
