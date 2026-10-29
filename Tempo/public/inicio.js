// Pantalla de inicio: crear una sala, entrar a una existente y salas recientes.

import { limpiarId, nuevoId, claveNombreNuevo, recientes, olvidarSala } from "./salas.js";

const $ = (s) => document.querySelector(s);

function hace(ms) {
  const min = Math.round((Date.now() - ms) / 60000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "ayer" : `hace ${d} días`;
}

function pintarRecientes() {
  const ul = $("#recientes");
  const lista = recientes();
  if (!lista.length) {
    const li = document.createElement("li");
    li.className = "vacio";
    li.textContent = "Todavía no entraste a ninguna sala desde este navegador.";
    ul.replaceChildren(li);
    return;
  }
  ul.replaceChildren(...lista.map((s) => {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = "#" + s.id;
    const nombre = document.createElement("span");
    nombre.className = "rec-nombre";
    nombre.textContent = s.nombre || s.id;
    const detalle = document.createElement("span");
    detalle.className = "rec-detalle";
    detalle.textContent = (s.nombre ? s.id + " · " : "") + hace(s.visto);
    a.append(nombre, detalle);
    const quitar = document.createElement("button");
    quitar.className = "link";
    quitar.textContent = "Quitar";
    quitar.setAttribute("aria-label", `Quitar ${s.nombre || s.id} de recientes`);
    quitar.addEventListener("click", () => { olvidarSala(s.id); pintarRecientes(); });
    li.append(a, quitar);
    return li;
  }));
}

export function mostrarInicio() {
  document.title = "Tempo · cronómetro compartido para ensayar";

  $("#crear").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const nombre = $("#crear-nombre").value.trim().slice(0, 40);
    const id = nuevoId(nombre);
    if (nombre) {
      try { sessionStorage.setItem(claveNombreNuevo(id), nombre); } catch {}
    }
    location.hash = id;
  });

  $("#unirse").addEventListener("submit", (ev) => {
    ev.preventDefault();
    // Acepta el nombre solo, "#nombre" o el link entero.
    const texto = $("#unirse-codigo").value;
    const id = limpiarId(texto.includes("#") ? texto.split("#").pop() : texto);
    if (!id || id === "ideas") {
      $("#unirse-error").textContent = "Escribí el nombre de la sala o pegá el link que te pasaron.";
      return $("#unirse-codigo").focus();
    }
    location.hash = id;
  });
  $("#unirse-codigo").addEventListener("input", () => { $("#unirse-error").textContent = ""; });

  pintarRecientes();
}
