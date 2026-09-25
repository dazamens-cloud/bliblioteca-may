# Mi Biblioteca

PWA para llevar tu biblioteca personal desde el móvil: escanear libros, marcar lo que
lees y saber qué libros de cada saga te faltan.

Misma arquitectura que Control-cocina:

```
PWA (GitHub Pages) → Google Apps Script (Web App) → Google Sheets
```

Cada persona tiene su **perfil** con su propia biblioteca y entra con un **PIN**. Los
libros se guardan en la hoja, así que se ven desde cualquier dispositivo y no se pierden
al cambiar de móvil.

Funciona también **sin** perfil: entonces los datos se quedan solo en ese navegador
(localStorage) y se pierden si se borran sus datos o se cambia de móvil.

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

1. Crear el Apps Script: en [script.google.com](https://script.google.com) (suelto:
   `setup` crea la hoja *Mi Biblioteca* y guarda su id en `SHEET_ID`) o desde una hoja
   con **Extensiones → Apps Script**.
2. Pegar `apps-script/Code.gs` y guardar.
3. Crear los perfiles: ⚙️ **Configuración del proyecto → Propiedades del script** →
   añadir `PIN_ana` = `5678`, `PIN_luis` = `2468`… El nombre, en minúsculas y sin
   espacios ni tildes, es el que sale en la app (`ana` → "Ana").
4. Ejecutar **`setup`**. Genera el secreto con el que se firman las sesiones (`TOKEN`)
   y en el registro debe salir `Perfiles: ana, luis`.
5. **Implementar → Nueva implementación → Aplicación web**. Ejecutar como: yo. Acceso:
   cualquier usuario. Copiar la URL `/exec`.
6. Comprobar: abrir `…/exec?accion=perfiles` en el navegador. Debe responder
   `{"ok":true,"perfiles":["ana","luis"]}`. Si responde `"error":"token"`, esa URL es
   de una implementación antigua.
7. Pegar la URL al principio de `script.js`, en `URL_SCRIPT`, y hacer commit.
8. En cada móvil: **Ajustes** → elegir el perfil → PIN → Entrar. Solo la primera vez.

**No crear a mano las pestañas de un perfil.** Se crean solas, con la fila de títulos,
la primera vez que alguien entra. Una pestaña creada a mano sin esa fila hace que se
pierda el primer libro o saga que se guarde (la fila 1 se lee como títulos).

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

Opcional: propiedad del script `GOOGLE_BOOKS_KEY` con una clave de Google Books
(gratis). Sin ella, la búsqueda usa solo Open Library, que suele bastar.

### Pasar la hoja de antes de los perfiles

**Renombrar** (▾ → Cambiar nombre) las pestañas que ya existen, no crear otras:
`LIBROS` → `LIBROS_ana` y `SAGAS` → `SAGAS_ana`, con el nombre del perfil de quien
sean. Deben conservar su fila de títulos (`id`, `isbn`, `titulo`… y `id`, `nombre`,
`autor`…). Y crear la **implementación nueva**: la antigua sigue sirviendo el código
de antes.

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
