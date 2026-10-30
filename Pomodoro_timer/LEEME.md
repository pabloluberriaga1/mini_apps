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
- **Chat con respuestas y separado por día.** Mientras corre un bloque de estudio el chat queda en silencio; se abre en las pausas. Si alguien se cambia el nombre, se actualiza en sus mensajes viejos.
- **Siempre hay anfitrión:** si se va, la sala le ofrece el lugar a quien está hace más tiempo; si nadie acepta, queda asignado igual. El anfitrión también puede pasarlo desde Gente.
- **Ideas y bugs y Novedades** en el inicio, como en Parcialito.
- **Limpieza automática:** las salas sin uso hace 7 días y sin nadie conectado se borran solas.
- **Modo Zen:** Vista a pantalla completa para eliminar distracciones.
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
| `public/novedades.js` | Lista de novedades. Para anunciar un cambio, agregá una entrada arriba con una `v` nueva (a todos les aparece el punto). |
| `firestore.rules` | Reglas de seguridad para Firestore (salas, privadas, chat, estadísticas y tickets). |
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

## 🧪 Probar en local

```bash
npm install
npm run test:reglas   # pruebas de las reglas
npm run emuladores    # app en http://127.0.0.1:5055/?emu con base de datos de prueba
```

Con `?emu` (solo en localhost) la app usa los emuladores y nunca toca la base real.
