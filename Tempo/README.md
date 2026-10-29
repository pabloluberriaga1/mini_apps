# Tempo

Cronómetro compartido para ensayar en grupo. Se crea una sala, se comparte el link y todos ven el mismo tiempo corriendo, en cualquier dispositivo.

- En el **inicio** se crea una sala (con nombre opcional), se entra a una con su nombre o pegando el link, y se ven las salas recientes de ese navegador.
- Se pueden tener todas las salas que se quiera al mismo tiempo: cada una vive en su link (`/#ensayo-del-jueves-k3x9pq`). Las salas creadas desde el inicio llevan un final al azar para que dos grupos no caigan en la misma.
- Quien crea la sala queda como **host**.
- El host elige si **controlan todos** o **solo el host**.
- Si el host se va, cualquiera puede tomar el control.
- Atajos: espacio arranca o pausa, R reinicia.
- **Ideas y bugs** (`/#ideas`): cualquiera propone mejoras o avisa errores y vota los que le importan.

## Probar sin configurar nada

Copiando `public/firebase-config.example.js` como `public/firebase-config.js` y dejando `databaseURL` vacío, la app funciona en modo local (sincroniza entre pestañas del mismo navegador). Hay que servirla por HTTP porque usa módulos ES:

```bash
cd public && python -m http.server 8000
# abrir http://localhost:8000 y crear una sala; abrir su link en otra pestaña
```

## Usarlo entre dispositivos (Firebase)

1. Crear un proyecto en Firebase y activar **Realtime Database**.
2. Copiar `public/firebase-config.example.js` como `public/firebase-config.js` y pegar la config de la app web (incluido `databaseURL`). Ese archivo no se sube al repo.
3. Pegar `database.rules.json` en la pestaña *Reglas* de la base.
4. Publicar: `firebase deploy --only hosting,database` (ya está configurado para `tempo-740b2`). Queda en https://tempo-740b2.web.app

Las reglas de las salas son abiertas, como corresponde a un prototipo sin cuentas: cualquiera con el link de una sala puede usarla. No se puede listar las salas: hay que saber el nombre.

### Moderar ideas y bugs

Sin cuentas no hay moderadores en la app, así que se modera desde la consola de Firebase (Realtime Database → Datos → `tickets/<id>`):

- `estado`: `nuevo`, `revision`, `planificado`, `en_curso`, `hecho` o `descartado`. Los dos últimos pasan a *Cerrados*.
- `respuesta`: texto que se muestra debajo del ticket.
- Para borrar un ticket, se borra el nodo entero.

Las reglas dejan crear tickets y votar, pero no editar ni borrar tickets ni tocar `estado` o `respuesta`. La app frena un ticket por minuto por navegador; los votos son uno por navegador, así que alguien decidido puede inflarlos borrando sus datos.

## Cómo está armado

| Archivo | Qué hace |
|---|---|
| `app.js` | Elige la pantalla según el link: inicio, `#ideas` o una sala. |
| `inicio.js` | Crear sala, entrar a una y salas recientes. |
| `sala.js` | Estado de la sala, acciones y UI del cronómetro. |
| `ideas.js` | Ideas y bugs: formulario, filtros, lista y votos. |
| `salas.js` | Ids de sala y salas recientes (guardadas en el navegador). |
| `sync.js` | Única capa que habla con Firebase (o con el modo local). Para la sala expone `ahora()`, `alCambiarEstado`, `modificarEstado`, `alCambiarGente`, `entrar`; para los tickets, `crearTickets()`. |
| `firebase-config.js` | Credenciales del proyecto. |

El tiempo no se transmite segundo a segundo: la sala guarda `{ nombre, corriendo, inicio, acumulado }` y cada dispositivo calcula el transcurrido con la hora del servidor (`.info/serverTimeOffset`), así todos ven lo mismo aunque tengan el reloj desfasado.

### Sumar funciones

1. Agregar el campo nuevo en `estadoInicial()`.
2. Escribir la acción en el objeto `acciones` (recibe el estado y devuelve el nuevo).
3. Mostrarlo en `pintar()` y conectar el botón con `hacer("nombreAccion")`.

Ideas que encajan así: tramos de la canción (intro, estrofa, estribillo) con aviso antes de cada cambio, cuenta regresiva antes de arrancar, marcas de tiempo durante el ensayo, varias canciones en una lista.
