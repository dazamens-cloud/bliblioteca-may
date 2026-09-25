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

Una sola hoja y un solo Apps Script para todos. Cada persona tiene su **perfil**, con
sus propias pestañas (`LIBROS_ana`, `SAGAS_ana`), y entra con su **PIN**.

1. Crear una hoja de cálculo → **Extensiones → Apps Script**.
2. Pegar `apps-script/Code.gs` y guardar.
3. Ejecutar **`setup`** una vez (genera el secreto con el que se firman las sesiones).
4. Crear los perfiles: ⚙️ **Configuración del proyecto → Propiedades del script** →
   añadir `PIN_david` = `1234`, `PIN_ana` = `5678`… (el nombre en minúsculas, sin
   espacios ni tildes). Las pestañas se crean solas la primera vez que alguien entra.
5. **Implementar → Nueva implementación → Aplicación web**. Ejecutar como: yo. Acceso:
   cualquier usuario. Copiar la URL `/exec`.
6. Pegar la URL al principio de `script.js`, en `URL_SCRIPT`, y hacer commit.
7. En cada móvil: **Ajustes** → elegir el perfil → PIN → Entrar. Solo la primera vez.

**Añadir a alguien:** otra propiedad `PIN_nombre`. No hay que tocar el código ni
redesplegar. **Cambiar un PIN** cierra la sesión de ese perfil en todos los móviles.

Los PIN **no** están en el repositorio: viven en las propiedades del script, que solo
ve el dueño del Apps Script. Tras 5 PIN incorrectos seguidos, el perfil se bloquea
15 minutos. Todo se guarda en la hoja de quien creó el Apps Script; los demás no la
ven salvo que se la compartan.

Al entrar, los libros del móvil se **combinan** con los de la hoja: no se pierde nada.
Si el móvil tenía libros sin perfil (de antes o de usarla sin conectar), pregunta si se
pasan al perfil que entra.

Si `URL_SCRIPT` se deja vacía, la URL se pega en Ajustes.

### Pasar la hoja de antes de los perfiles

Renombrar las pestañas `LIBROS` → `LIBROS_david` y `SAGAS` → `SAGAS_david` (con el id
del perfil de quien sean). Y crear la **implementación nueva**: la antigua sigue
sirviendo el código de antes.

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
