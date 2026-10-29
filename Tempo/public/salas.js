// Nombres de sala y salas recientes de este navegador.

// Lo que va después del # en el link, limpio para usarlo como id.
export function limpiarId(texto) {
  let t = String(texto || "");
  try { t = decodeURIComponent(t); } catch {}
  return t.trim().toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 60);
}

// "Ensayo del jueves" → "ensayo-del-jueves-k3x9pq". El final al azar evita
// que dos grupos que eligen el mismo nombre terminen en la misma sala.
export function nuevoId(nombre) {
  const base = String(nombre || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-")
    .slice(0, 30).replace(/^-+|-+$/g, "");
  const azar = Math.random().toString(36).slice(2, 8).padEnd(6, "0");
  return `${base || "sala"}-${azar}`;
}

// El nombre que se eligió al crear la sala, hasta que la sala lo guarde.
export const claveNombreNuevo = (id) => `tempo:nombre-sala:${id}`;

const K_RECIENTES = "tempo:recientes";

export function recientes() {
  try {
    const lista = JSON.parse(localStorage.getItem(K_RECIENTES));
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
}

export function recordarSala(id, nombre) {
  const lista = [{ id, nombre: nombre || "", visto: Date.now() }, ...recientes().filter((s) => s.id !== id)];
  try { localStorage.setItem(K_RECIENTES, JSON.stringify(lista.slice(0, 8))); } catch {}
}

export function olvidarSala(id) {
  try { localStorage.setItem(K_RECIENTES, JSON.stringify(recientes().filter((s) => s.id !== id))); } catch {}
}
