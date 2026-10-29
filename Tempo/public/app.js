// Elige la pantalla según el link:
//
//   tempo-740b2.web.app/          → inicio (crear o entrar a una sala)
//   tempo-740b2.web.app/#ideas    → ideas y bugs
//   tempo-740b2.web.app/#ensayo   → la sala "ensayo"

import { limpiarId } from "./salas.js";
import { mostrarInicio } from "./inicio.js";
import { mostrarIdeas } from "./ideas.js";
import { abrirSala } from "./sala.js";

const ruta = limpiarId(location.hash.slice(1));
const mostrar = (...ids) => ids.forEach((id) => { document.getElementById(id).hidden = false; });

if (!ruta) {
  mostrar("v-inicio");
  mostrarInicio();
} else if (ruta === "ideas") {
  mostrar("v-ideas");
  document.getElementById("ir-ideas").setAttribute("aria-current", "page");
  mostrarIdeas();
} else {
  mostrar("v-sala", "pie-sala", "copiar");
  abrirSala(ruta);
}

// Cada pantalla arranca limpia: cambiar de sala recarga la página.
window.addEventListener("hashchange", () => location.reload());
