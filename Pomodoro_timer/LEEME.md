# 🍅 Cucú · Salas para estudiar (Versión independiente)

> Un Timer Pomodoro compartido en tiempo real al estilo Cuckoo.team. Ideal para clases, grupos de estudio o maratones de parciales donde todos ven el mismo reloj, interactúan por chat y miden su constancia.

---

## 🌟 Características principales

- **Sincronización en vivo:** Reloj pomodoro perfectamente sincronizado sin *lag* entre participantes.
- **Interacción en tiempo real:** Chat integrado, reacciones flotantes y avisos rápidos.
- **Presencia activa:** Indicadores visuales para saber quién está concentrado, en descanso o ausente.
- **Estadísticas de sesión:** Minutos estudiados, rachas activas y ranking diario.
- **Audio y Ambientales:** Alertas sonoras (cucú, zen, gong, alarma) y sonidos de fondo (lluvia, café, naturaleza, lo-fi).
- **Salas públicas o privadas:** las privadas no aparecen en la lista y se entra con código y clave (el link copiado ya la lleva). El anfitrión puede cambiarla de una a otra.
- **Chat con respuestas y separado por día.** Mientras corre un bloque de estudio el chat queda en silencio y se abre en las pausas (el anfitrión lo puede apagar en la pestaña Sala). Si alguien se cambia el nombre, se actualiza en sus mensajes viejos.
- **Siempre hay anfitrión:** si se va, la sala le ofrece el lugar a quien está hace más tiempo; si nadie acepta, queda asignado igual. El anfitrión también puede pasarlo desde Gente.
- **Tareas:** tu lista personal (se guarda en el navegador y te sigue a cualquier sala, también desde el inicio), con ▶ para marcar en cuál estás (se ve en Gente). El anfitrión puede activar una lista **compartida de la sala** desde la pestaña Sala; un selector arriba elige cuál ver.
- **Emojis y GIFs en el chat.** Los GIFs solo pueden ser de GIPHY o Tenor. Con `giphyKey` en `firebase-config.js` hay buscador; sin clave, se pega el link.
- **El anfitrión** puede cambiar el nombre de la sala y, en las privadas, cambiar la clave (los conectados siguen adentro; el resto necesita la nueva).
- **Ideas y bugs y Novedades** en el inicio, como en Parcialito. Las novedades se publican, editan y borran desde el Panel del creador.
- **Limpieza automática:** las salas sin uso hace 7 días y sin nadie conectado se borran solas.
- **Modo Zen:** Vista a pantalla completa para eliminar distracciones, con tu lista de tareas al costado (se oculta con el ojo).
- **Serverless y Gratuito:** Funciona en el navegador sin instalaciones, montado sobre **Firebase (Plan Spark)** sin necesidad de tarjeta de crédito.

> **💡 El origen de Cucú:** Nació como una alternativa de rescate durante la época de finales y parciales, cuando las caídas de servidores en plataformas comerciales dejaban colgados a los grupos de estudio.

---

## 📂 Estructura del proyecto

| Archivo | Para qué sirve |
| :--- | :--- |
| `public/index.html` | La aplicación completa (interfaz, reloj, chat, estadísticas y sonidos). |
| `public/firebase-backend.js` | Lógica de conexión y comunicación con Firebase. *(No requiere modificaciones)*. |
| `public/firebase-config.example.js` | Plantilla de la configuración. Copiala como `public/firebase-config.js` (**único archivo editable**, no se sube al repo). |
| `public/ideas.js` | Ideas y bugs: tickets, votos y moderación. |
| `public/tareas.js` | Tareas personales y de la sala. |
| `public/novedades.js` | Novedades iniciales. La primera vez que el creador abre su panel pasan a Firestore; después se publican desde el panel. |
| `firestore.rules` | Reglas de seguridad para Firestore (salas, privadas, chat, tareas, estadísticas, tickets y novedades). |
| `firestore.indexes.json` | Índice para la lista de salas públicas. |
| `tests/reglas.emu.mjs` | Pruebas de las reglas contra el emulador (`npm install` y `npm run test:reglas`). |
| `database.rules.json` | Reglas de seguridad para Realtime Database (estados, reacciones y presencia). |
| `firebase.json` | Archivo de configuración global para el despliegue con CLI. |

---

## 🚀 Guía de instalación paso a paso

### 1. Crear el proyecto en Firebase
1. Entrá a la [Consola de Firebase](https://console.firebase.google.com/) con tu cuenta de Google.
2. Hacé clic en **Crear proyecto** y asignale un nombre (por ejemplo, `cucu-estudio`). *(Google Analytics no es necesario).*

### 2. Activar el inicio de sesión anónimo
Para que cada navegador tenga un identificador único sin pedir registros:
1. En el menú lateral izquierdo, andá a **Authentication** (o Authentication > Comenzar).
2. Entrá a la pestaña **Método de acceso** (*Sign-in method*).
3. Seleccioná **Anónimo** ➔ **Habilitar** ➔ **Guardar**.

### 3. Crear Cloud Firestore
1. En el menú izquierdo, seleccioná **Firestore Database** ➔ **Crear base de datos**.
2. Elegí la ubicación más cercana, por ejemplo: `southamerica-east1 (São Paulo)`. *(Nota: la ubicación no se puede cambiar después).*
3. Seleccioná el **Modo de producción**. *(Las reglas correctas se subirán automáticamente en el paso 7).*

### 4. Crear Realtime Database
1. En el menú izquierdo, seleccioná **Realtime Database** ➔ **Crear base de datos**.
2. Dejá la ubicación predeterminada (Estados Unidos) y seleccioná **Modo bloqueado**. *(Las reglas se sobrescribirán en el paso 7).*

### 5. Configurar las credenciales en la app
1. En la consola de Firebase, hacé clic en el ícono de engranaje ⚙️ (**Configuración del proyecto**).
2. En la sección **Tus apps**, hacé clic en el ícono Web `</>` y registrá la app con un apodo (ej. `CucuWeb`). *(No hace falta tildar Firebase Hosting).*
3. Copiá `public/firebase-config.example.js` como `public/firebase-config.js` y pegá ahí los valores del objeto `firebaseConfig`. Ese archivo está en `.gitignore`, así tus credenciales no se suben al repo.

> ⚠️ **Importante sobre `databaseURL`:** Asegurate de que el bloque copiado incluya la propiedad `databaseURL` (ej. `https://tu-proyecto-default-rtdb.firebaseio.com`). Si no aparece, copiala manualmente desde la parte superior de la pantalla de tu Realtime Database.

### 6. Instalar herramientas de Firebase CLI
Asegurate de tener instalado [Node.js](https://nodejs.org/) (versión 20 o superior). Abrí tu terminal y ejecutá:

```bash
npm install -g firebase-tools
firebase login
```

### Desplegar el proyecto
Ubicate en la carpeta raíz de tu proyecto (donde se encuentra firebase.json) y ejecutá:

```bash
firebase use --add
```
Seleccioná tu proyecto de la lista y escribí default como alias.

Luego, publicá todo con un solo comando:

```bash
firebase deploy
```

Esto publica la página, las reglas de Firestore y de Realtime Database y el índice de la lista de salas. El índice tarda unos minutos en construirse: mientras tanto la lista de salas públicas muestra un error.

> Las salas creadas antes de esta versión no tienen el campo `privada`, así que no aparecen en la lista pública hasta que alguien las use (cualquier cambio en el reloj se lo agrega). Se puede seguir entrando con su código.

---

## 👑 Panel del creador

Quien tenga un documento en la colección `admins` de Firestore ve todas las salas (también las privadas y su clave), puede entrar a cualquiera, borrarlas, borrar mensajes y moderar los tickets.

1. Abrí la app en tu navegador. Abajo de todo aparece **ID de este navegador**: copialo.
2. En la consola de Firebase: **Firestore Database → Iniciar colección** `admins` → ID del documento: ese ID → un campo cualquiera (por ejemplo `rol: "creador"`).
3. Recargá la app: aparece **Panel del creador** arriba.

El ID es por navegador (la sesión es anónima): si usás la app en otro dispositivo, o borrás los datos del navegador, repetí los pasos con el ID nuevo.

El panel muestra números del momento (conectados, estudiando, salas con gente) y del día (pomodoros completos, minutos estudiados entre todos, salas usadas y creadas, tickets nuevos), calculados con las 100 salas con actividad más reciente.

## 📊 Analítica (Google Analytics)

Si `firebase-config.js` tiene `measurementId`, la app manda eventos a Google Analytics. Se ven en la consola de Firebase → **Analytics** (tarda hasta 24 h; para verlos al momento, **DebugView**). Con los emuladores (`?emu`) no se manda nada, y si un bloqueador frena Analytics la app sigue igual.

| Evento | Cuándo | Datos |
|---|---|---|
| `sala_creada` | Se crea una sala | `privada`, `minutos_estudio` |
| `sala_entrar` | Alguien entra a una sala | `privada` |
| `sala_visibilidad` | El anfitrión la pasa a pública o privada | `privada` |
| `pomodoro_completo` | Alguien completa un bloque de estudio | `minutos`, `personas` |
| `mensaje_chat` | Se manda un mensaje | `respuesta` |
| `anfitrion_oferta` | Alguien acepta o rechaza ser anfitrión | `decision` |
| `ticket_creado` / `voto_ticket` | En Ideas y bugs | `tipo` |
| `novedades_vistas` | Alguien abre una novedad nueva | `version` |

Para usar los datos (`privada`, `minutos`, etc.) en los informes, registralos en **Analytics → Definiciones personalizadas** como dimensiones o métricas.

## 🧪 Probar en local

```bash
npm install
npm run test:reglas   # pruebas de las reglas
npm run emuladores    # app en http://127.0.0.1:5055/?emu con base de datos de prueba
```

Con `?emu` (solo en localhost) la app usa los emuladores y nunca toca la base real.
