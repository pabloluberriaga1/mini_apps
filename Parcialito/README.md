# Parcialito

Tests colaborativos por universidad, carrera, materia y parcial, con ranking, historial de progreso y una ticketera para proponer mejoras. HTML, CSS y JS sin build, sobre Firebase Hosting, Authentication (Google) y Firestore.

```
parcialito/
├── public/
│   ├── index.html
│   ├── styles.css
│   ├── app.js                    ← vistas y conexión con Firebase
│   ├── js/                       ← lógica sin dependencias de Firebase (se testea con Node)
│   │   ├── puntos.js             ← puntaje, rachas y ranking
│   │   ├── parser.js             ← lectura de tests en texto, JSON y HTML
│   │   ├── catalogo.js           ← ids de universidades, carreras y materias; etiquetas
│   │   ├── novedades.js          ← lo que aparece en la sección Novedades
│   │   └── util.js
│   ├── firebase-config.example.js
│   └── firebase-config.js        ← NO está en el repo: lo creás a partir del ejemplo
├── scripts/migrar-academico.mjs  ← migración de los tests existentes al catálogo
├── tests/                        ← pruebas de lógica y de reglas de Firestore
├── firestore.rules               ← quién puede leer y escribir qué
├── firestore.indexes.json
├── firebase.json
├── .firebaserc                   ← el ID de tu proyecto
└── LICENSE
```

## Puesta en producción

1. **Crear el proyecto.** En https://console.firebase.google.com creá un proyecto (Analytics no hace falta).
2. **Registrar la app web.** Configuración del proyecto → Tus apps → ícono `</>`. Copiá `public/firebase-config.example.js` a `public/firebase-config.js` y reemplazá los valores por los del objeto `firebaseConfig` que te muestra Firebase. El archivo real no se sube a git (está en `.gitignore`). Esas claves son públicas por diseño; lo que protege los datos son las reglas.
3. **Activar el login.** Authentication → Comenzar → Método de acceso → Google → Habilitar.
4. **Crear la base.** Firestore Database → Crear base de datos → modo producción → región `southamerica-east1` (São Paulo), la más cercana a La Plata.
5. **Publicar.**
   ```bash
   npm install -g firebase-tools
   firebase login
   # en .firebaserc reemplazá el ID del proyecto por el tuyo
   firebase deploy
   ```
   Eso sube la web y las reglas de Firestore. Queda en `https://TU-PROYECTO-ID.web.app`.
6. **Completar tu perfil.** Entrá a la app → Mi perfil → elegí universidad y carrera. Si no existen, se crean.
7. **Cargar el primer material.** Subir un test → Desde un archivo → elegí `evaluaciones_visualizacion.html`. Se crea un test por unidad.
8. **Hacerte moderador (opcional).** Authentication → Usuarios → copiá tu UID. En Firestore creá la colección `admins` con un documento cuyo ID sea ese UID. Ver [Moderación](#moderación).

Para cambios posteriores: editás los archivos y volvés a correr `firebase deploy` (o `firebase deploy --only hosting` si no tocaste las reglas).

## Actualizar una instancia que ya tiene usuarios

Las versiones con catálogo académico, intentos y ticketera agregan colecciones y campos, pero no cambian ni borran los que ya existen. El orden importa:

1. **Probar en local** con los emuladores (ver abajo) y correr `npm test` y `npm run test:reglas`.
2. **Reglas primero:** `firebase deploy --only firestore:rules`. Son compatibles con la versión anterior de la app, así que nadie queda bloqueado mientras se actualiza.
3. **Después la web:** `firebase deploy --only hosting`.
4. **Migrar los tests existentes** al catálogo (una sola vez, ver abajo). Hasta que se corra, los tests viejos siguen apareciendo agrupados por el nombre de la materia, pero no cuentan en los rankings por carrera o universidad.
5. **Avisar** qué cambió editando `public/js/novedades.js`. Cambiar el `v` de la primera entrada hace que a todos les aparezca el punto de novedades.

### Migración al catálogo académico

`scripts/migrar-academico.mjs` asigna una universidad, una carrera y una materia a cada test que no las tiene, y crea esos documentos si faltan. Usa una cuenta de servicio, así que no pasa por las reglas.

```bash
cd scripts
npm install
# Firebase → Configuración del proyecto → Cuentas de servicio → Generar nueva clave privada.
# Guardá el JSON fuera del repo (o con "service-account" en el nombre, que está en .gitignore).
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\ruta\service-account.json"     # PowerShell
node migrar-academico.mjs --universidad "Universidad Nacional de La Plata" --sigla UNLP --carrera "Licenciatura en Sistemas"
```

Sin `--apply` solo muestra lo que haría. Revisá la lista y repetí el comando con `--apply`. Antes de escribir guarda un backup completo en `scripts/backups/` (está en `.gitignore`, porque contiene datos de usuarios). Se puede correr varias veces: solo toca lo que falta. Con `--asignar-usuarios`, además pone esa carrera a quienes todavía no eligieron una.

Usá exactamente los mismos nombres que la gente va a elegir en su perfil. Los ids salen del nombre (sin tildes ni mayúsculas), así que "Minería de Datos" y "mineria de datos" caen en la misma materia.

## Probar en tu compu

Con emuladores, para no tocar la base real:

```bash
npm install
npm run emuladores          # Auth en :9099, Firestore en :8080, consola en :4000
npx serve public            # en otra terminal
```

Abrí `http://localhost:3000/?emu`. El `?emu` hace que la app use los emuladores: el botón de Google abre una pantalla de cuentas falsas, y los datos se borran al cerrar los emuladores. Sin `?emu` usa la base real, así que cuidado con los datos de prueba.

Pruebas automáticas:

```bash
npm test                    # lógica de puntos, parser y catálogo
npm run test:reglas         # reglas de Firestore contra el emulador
```

## Dominio propio

Hosting → Agregar dominio personalizado. Después sumalo en Authentication → Configuración → Dominios autorizados, o el login con Google va a fallar.

## Datos

| Colección | Contenido | Quién escribe |
|---|---|---|
| `universidades/{id}`, `carreras/{id}`, `materias/{id}` | catálogo académico | cualquiera crea lo que falta; edita o borra un moderador |
| `tests/{id}` | materia (nombre e id), universidad, carrera, parcial, título, etiquetas, cantidad de preguntas, autor | quien lo sube; borra el autor o un moderador de esa universidad |
| `bodies/{id}` | preguntas, opciones, respuestas, explicaciones y casos | igual que `tests` |
| `scores/{uid}` | mejor puntaje por test y días estudiados | cada persona, solo el suyo |
| `attempts/{id}` | cada intento: test, materia, puntaje, fecha | cada persona agrega los suyos; son privados y no se editan |
| `users/{uid}` | nombre y foto de Google, universidad y carrera | cada persona, solo el suyo |
| `subs/{uid}` | materias y etiquetas que sigue | cada persona, solo el suyo; privado |
| `tickets/{id}` | ideas y bugs: tipo, título, descripción, estado, votos, respuesta | cualquiera crea y vota; estado y respuesta, un moderador |
| `admins/{uid}` | moderadores | solo desde la consola |

Puntos: 10 por respuesta correcta (5 si es parcialmente correcta), 50 por test perfecto, 30 por test subido. Se toma el mejor intento de cada test. Se calculan en el navegador; las constantes están en `PTS`, en `public/js/puntos.js`.

## Moderación

Un documento en `admins/{uid}` sin campos (o con cualquier campo menos `universidades`) es **moderador global**: así quedan los que ya existían. Para que alguien modere solo una universidad, agregale `universidades: ["unlp"]` (una lista con los ids de las universidades). `"*"` en la lista también lo vuelve global.

Los moderadores ven el botón **Moderar** en cada ticket de Ideas y bugs: cambian el estado (Nuevo, En revisión, Planificado, En curso, Hecho, Descartado), escriben una respuesta pública y pueden enlazar el issue de GitHub donde se trabaja. Los bugs traen la pantalla donde estaba la persona y su navegador.

## Límites conocidos

- **Los puntajes e intentos los escribe el navegador de cada participante.** Las reglas impiden tocar los de otros, pero alguien que sepa usar la consola del navegador podría inflar el propio. Para un curso alcanza; si hiciera falta blindarlo, el puntaje se calcula en una Cloud Function (requiere el plan Blaze).
- **El ranking lee todos los puntajes.** Con muchos participantes conviene un documento de ranking precalculado, que también requiere una Cloud Function.
- **Ticketera sin límite de envíos del lado del servidor.** La app frena un ticket por minuto por navegador; contra spam real conviene activar App Check.
- **Una pestaña abierta con la versión anterior** que vuelva a iniciar sesión puede borrar la universidad y la carrera del perfil (la versión vieja guardaba el usuario sin `merge`). Se arregla eligiéndolas de nuevo y desaparece cuando todos recargan.
- **Plan gratuito (Spark).** Alcanza para un curso o varios: 50.000 lecturas y 20.000 escrituras por día. La app escucha las colecciones completas, así que con miles de tests convendría paginar por materia.

## Licencia

[MIT](LICENSE). Podés usar, modificar y redistribuir el código; ver el archivo para los detalles.
