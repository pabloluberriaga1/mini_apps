# Tempo

Cronómetro compartido para ensayar en grupo. Se crea una sala, se comparte el link y todos ven el mismo tiempo corriendo, en cualquier dispositivo.

- Quien crea la sala queda como **host**.
- El host elige si **controlan todos** o **solo el host**.
- Si el host se va, cualquiera puede tomar el control.
- Atajos: espacio arranca o pausa, R reinicia.

## Probar sin configurar nada

Copiando `public/firebase-config.example.js` como `public/firebase-config.js` y dejando `databaseURL` vacío, la app funciona en modo local (sincroniza entre pestañas del mismo navegador). Hay que servirla por HTTP porque usa módulos ES:

```bash
cd public && python -m http.server 8000
# abrir http://localhost:8000/#ensayo en dos pestañas
```

## Usarlo entre dispositivos (Firebase)

1. Crear un proyecto en Firebase y activar **Realtime Database**.
2. Copiar `public/firebase-config.example.js` como `public/firebase-config.js` y pegar la config de la app web (incluido `databaseURL`). Ese archivo no se sube al repo.
3. Pegar `database.rules.json` en la pestaña *Reglas* de la base.
4. Publicar: `firebase deploy --only hosting,database` (ya está configurado para `tempo-740b2`). Queda en https://tempo-740b2.web.app

Las reglas son abiertas, como corresponde a un prototipo sin cuentas: cualquiera con el link de una sala puede usarla.

## Cómo está armado

| Archivo | Qué hace |
|---|---|
| `sync.js` | Única capa que habla con Firebase (o con el modo local). Expone `ahora()`, `alCambiarEstado`, `modificarEstado`, `alCambiarGente`, `entrar`. |
| `app.js` | Estado de la sala, acciones y UI. |
| `firebase-config.js` | Credenciales del proyecto. |

El tiempo no se transmite segundo a segundo: la sala guarda `{ corriendo, inicio, acumulado }` y cada dispositivo calcula el transcurrido con la hora del servidor (`.info/serverTimeOffset`), así todos ven lo mismo aunque tengan el reloj desfasado.

### Sumar funciones

1. Agregar el campo nuevo en `estadoInicial()`.
2. Escribir la acción en el objeto `acciones` (recibe el estado y devuelve el nuevo).
3. Mostrarlo en `pintar()` y conectar el botón con `hacer("nombreAccion")`.

Ideas que encajan así: tramos de la canción (intro, estrofa, estribillo) con aviso antes de cada cambio, cuenta regresiva antes de arrancar, marcas de tiempo durante el ensayo, varias canciones en una lista.
