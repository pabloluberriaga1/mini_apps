// Copiá este archivo como firebase-config.js y pegá ahí la configuración de tu proyecto de Firebase (ese archivo no se sube al repo).
// La encontrás en: Consola de Firebase → ⚙️ Configuración del proyecto → Tus apps → (app web) → "Configuración del SDK" → Config.
// Estos datos NO son secretos: la seguridad la ponen las reglas (firestore.rules y database.rules.json).
export const firebaseConfig = {
  apiKey: "PEGÁ_ACÁ_TU_API_KEY",
  authDomain: "tu-proyecto.firebaseapp.com",
  databaseURL: "https://tu-proyecto-default-rtdb.firebaseio.com",
  projectId: "tu-proyecto",
  storageBucket: "tu-proyecto.appspot.com",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:0000000000000000"
};

// Opcional: clave de GIPHY (developers.giphy.com) para buscar GIFs en el chat.
// Sin clave, en el chat se puede pegar el link de un GIF de GIPHY o Tenor.
export const giphyKey = "";
