// Emojis del selector del chat, por categoría. Cada uno lleva palabras para el buscador.
const lista = s => s.trim().split("\n").map(l => { const [e, ...k] = l.trim().split(" "); return [e, k.join(" ")]; });

export const EMOJI_CATS = [
  { id: "caras", icono: "😀", nombre: "Caras", emojis: lista(`
😀 sonrisa feliz contento
😃 sonrisa feliz alegre
😄 risa feliz
😁 sonrisa dientes
😆 risa carcajada
😅 risa nervios sudor
😂 risa llorar jaja
🤣 risa piso carcajada jaja
🙂 sonrisa leve
🙃 al reves ironia
😉 guiño
😊 sonrisa ruborizado
😇 angel inocente
🥰 amor corazones
😍 enamorado ojos corazon
🤩 estrellas wow
😘 beso
😋 rico delicioso
😛 lengua
😜 lengua guiño
🤪 loco
🤑 plata dinero
🤗 abrazo
🤭 risita tapada
🤫 silencio shh
🤔 pensar duda
🤐 callado boca cerrada
😐 neutral serio
😑 sin expresion
😶 sin palabras
😏 picaro
😒 aburrido molesto
🙄 ojos revoleados
😬 incomodo mueca
😮‍💨 suspiro alivio cansado
😌 aliviado tranquilo
😔 triste pensativo
😪 sueño
🤤 baba
😴 dormir sueño zzz
😷 barbijo enfermo
🤒 fiebre enfermo
🤯 cabeza explota mente volada
🥱 bostezo sueño aburrido
😎 lentes copado canchero
🤓 nerd estudio anteojos
🧐 monoculo analizar
😕 confundido
😟 preocupado
😮 sorpresa
😲 asombro
😳 sonrojado avergonzado
🥺 por favor ojitos
😢 llorar triste lagrima
😭 llanto llorar mucho
😱 grito miedo
😖 frustrado
😣 esfuerzo
😩 cansado agotado
😫 agotado
😤 enojo bronca resoplar
😡 enojado furioso
🤬 insultos furioso
😈 diablo travieso
💀 calavera muerto me mori
🤡 payaso
👻 fantasma
🤖 robot
🥳 fiesta festejo cumpleaños
🥲 sonrisa lagrima
`) },
  { id: "gestos", icono: "👋", nombre: "Gestos", emojis: lista(`
👋 hola chau saludo mano
👍 bien ok si pulgar arriba like
👎 mal no pulgar abajo
👏 aplausos bravo
🙌 celebrar manos arriba
🙏 por favor gracias rezar
🤝 trato acuerdo apreton manos
💪 fuerza musculo vamos
✌️ paz victoria
🤞 suerte dedos cruzados
🤟 te quiero rock
🤘 rock metal
👌 perfecto ok
🤌 que queres italiano
👈 izquierda señalar
👉 derecha señalar
👆 arriba señalar
👇 abajo señalar
☝️ uno atencion
✋ alto mano
🖐️ mano cinco
🫡 saludo militar entendido
🤙 llamame
✍️ escribir tomar notas
👀 ojos mirar chusmear
🧠 cerebro pensar estudiar
🫶 corazon manos amor
`) },
  { id: "corazones", icono: "❤️", nombre: "Corazones", emojis: lista(`
❤️ corazon rojo amor
🧡 corazon naranja
💛 corazon amarillo
💚 corazon verde
💙 corazon azul
💜 corazon violeta
🖤 corazon negro
🤍 corazon blanco
🤎 corazon marron
💔 corazon roto
❤️‍🔥 corazon fuego
💕 corazones
💖 corazon brillante
💯 cien perfecto
💥 explosion boom
💫 mareo estrella
💤 dormir zzz
`) },
  { id: "estudio", icono: "📚", nombre: "Estudio", emojis: lista(`
📚 libros estudiar
📖 libro abierto leer
📝 notas escribir apunte
✏️ lapiz
🖊️ lapicera
📒 cuaderno
📓 cuaderno
📎 clip
📌 chinche fijar
📅 calendario fecha
🗓️ calendario
⏰ alarma reloj despertador
⏳ reloj de arena tiempo
⌛ tiempo terminado
🕐 hora reloj
💻 compu notebook
🖥️ computadora
📱 celular
🎧 auriculares musica
🎓 graduacion recibido
🏫 escuela facultad
🧪 quimica laboratorio
🧮 abaco matematica
📐 regla escuadra geometria
📊 grafico estadistica
📈 grafico sube
🔬 microscopio biologia
💡 idea lampara
🔍 buscar lupa
✅ hecho listo check
☑️ tilde check
❌ mal error no
⚠️ atencion cuidado
❓ pregunta duda
❗ importante
`) },
  { id: "comida", icono: "☕", nombre: "Comida", emojis: lista(`
☕ cafe mate pausa
🧉 mate
🍵 te
🥤 gaseosa
🧃 jugo
🍺 cerveza
🍕 pizza
🍔 hamburguesa
🌭 pancho
🍟 papas fritas
🥪 sandwich
🌮 taco
🍝 fideos pasta
🍜 sopa ramen
🍣 sushi
🥐 medialuna
🍩 dona
🍪 galletita
🍫 chocolate
🍬 caramelo
🍎 manzana
🍌 banana
🍉 sandia
🍓 frutilla
🥑 palta
🍿 pochoclo
🎂 torta cumpleaños
`) },
  { id: "naturaleza", icono: "🌿", nombre: "Naturaleza", emojis: lista(`
🐦 pajaro cucu
🐥 pollito
🐱 gato
🐶 perro
🦊 zorro
🐼 panda
🐸 rana
🐢 tortuga lento
🦉 buho noche
🦋 mariposa
🐝 abeja trabajar
🌿 planta
🌱 brote crecer
🌵 cactus
🌸 flor
🌻 girasol
🍀 trebol suerte
🌞 sol dia
🌙 luna noche
⭐ estrella
🌟 estrella brillante
✨ brillos magia
⚡ rayo energia
🔥 fuego vamos
🌈 arcoiris
☁️ nube
🌧️ lluvia
❄️ nieve frio
`) },
  { id: "simbolos", icono: "🎉", nombre: "Fiesta y símbolos", emojis: lista(`
🎉 festejo fiesta
🎊 confeti
🥇 medalla oro primero
🏆 trofeo copa ganar
🎯 objetivo meta diana
🚀 cohete rapido
🎮 juego
🎵 musica nota
🎶 musica
🔔 campana aviso
💬 mensaje chat
🗨️ globo dialogo
➡️ flecha derecha
⬅️ flecha izquierda
⬆️ flecha arriba
⬇️ flecha abajo
🔁 repetir
🆗 ok
🆕 nuevo
🔝 top
`) }
];
