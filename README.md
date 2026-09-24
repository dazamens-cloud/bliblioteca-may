# Mi Biblioteca

PWA para llevar tu biblioteca personal desde el móvil: escanear libros, marcar lo que
lees y saber qué libros de cada saga te faltan.

Misma arquitectura que Control-cocina:

```
PWA (GitHub Pages) → Google Apps Script (Web App) → Google Sheets
```

Funciona también **sin** la hoja: los datos se guardan en el móvil (localStorage).

## Ficheros

| Fichero | Qué es |
|---|---|
| `index.html` | Las cuatro pantallas: Biblioteca, Sagas, Añadir, Ajustes |
| `script.js` | Datos, sincronización, escáner e interfaz |
| `sagas.js` | Detección de sagas (Wikidata + Open Library) |
| `style.css` | Diseño (paleta de Stitch, modo claro y oscuro) |
| `sw.js` | Service worker: funciona sin conexión |
| `apps-script/Code.gs` | Backend. Se pega en el editor de Apps Script |

## Poner en marcha la hoja

1. Crear una hoja de cálculo → **Extensiones → Apps Script**.
2. Pegar `apps-script/Code.gs` y guardar.
3. Ejecutar **`setup`** una vez. Crea las pestañas `LIBROS` y `SAGAS` y escribe el
   **token** en el registro de ejecución.
4. **Implementar → Nueva implementación → Aplicación web**. Ejecutar como: yo. Acceso:
   cualquier usuario. Copiar la URL `/exec`.
5. Pegar la URL y el token al principio de `script.js`, en `URL_SCRIPT` y
   `WEB_APP_TOKEN`, y hacer commit. Igual que en Control-cocina: cualquier dispositivo
   que abra la app se conecta solo, sin tocar Ajustes.

La primera vez que un dispositivo se conecta, sus libros se **combinan** con los de la
hoja: no se pierde nada de ninguno de los dos.

Si `URL_SCRIPT` y `WEB_APP_TOKEN` se dejan vacías, la conexión se hace a mano desde
**Ajustes** y se guarda solo en ese móvil.

Ojo: el repositorio es público, así que el token queda a la vista de quien mire el
código (igual que en Control-cocina). Con él se pueden leer y cambiar los libros de la
hoja, nada más de tu cuenta de Google.

Opcional: propiedad del script `GOOGLE_BOOKS_KEY` con una clave de Google Books
(gratis). Sin ella, la búsqueda usa solo Open Library, que suele bastar.

## ⚠️ Al cambiar `Code.gs`

**Implementar → Nueva implementación.** Redesplegar la existente no sirve el código
nuevo (dos de dos veces en Control-cocina). La nueva implementación da otra URL, que hay
que cambiar en `URL_SCRIPT` de `script.js`.

Los campos nuevos de `CAMPOS_LIBRO` van siempre **al final**: las filas se leen por
posición.

## Cómo se detectan las sagas

1. **Wikidata**, con la API normal y **no SPARQL**: el servicio SPARQL llegó a tardar
   49 s en una consulta trivial. Resuelve bien las sagas catalogadas, como Harry Potter
   o Crónica del asesino de reyes.
2. **Open Library** cuando Wikidata conoce la saga pero no sus libros, como La Biblia de
   los Caídos. Solo si hay pruebas de que hay saga (Wikidata la confirma o hay títulos
   numerados). Sin esa condición, *Cien años de soledad* salía como una saga de 59
   ensayos.
3. El usuario **siempre revisa** la lista antes de guardarla.

Gotcha: Wikidata guarda muchos nombres propios solo con el idioma **`mul`** (la serie
"Harry Potter", "J. K. Rowling"), así que hay que pedir `languages=es|mul|en`.

## Probar en local

```
python -m http.server 8642
```

y abrir `http://localhost:8642`. El escáner necesita Chrome en Android. En el PC,
escribe el ISBN a mano.
