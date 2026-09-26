# Rediseño «Noche»: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplicar el rediseño descrito en `docs/superpowers/specs/2026-09-26-rediseno-noche-design.md`: temas noche/pergamino, fondo de constelaciones, pantallas con estructura de BiblioCasa, pantalla Actividad y reto anual por perfil.

**Architecture:** PWA sin build: HTML + CSS + JS clásico (sin módulos) en GitHub Pages, backend en Google Apps Script. Se añaden dos ficheros de JS (`cielo.js`, fondo; `actividad.js`, cálculos puros) cargados antes de `script.js`. Los cálculos y el backend se prueban con `node --test`; la interfaz, con Chromium (Playwright) desde el directorio de trabajo temporal.

**Tech Stack:** JavaScript del navegador, Canvas 2D, CSS con variables, Google Apps Script (V8), Node 22 (`node:test`), Playwright con Chromium en `/opt/pw-browsers/chromium`.

Convenciones del repo: textos y comentarios en español, funciones con nombres en español, `const`/`let`, plantillas con `esc()` para todo texto de usuario. Mensajes de commit en español, terminados con:

```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015vexN1WLU2RDQYVx6jK7Wn
```

Rama de trabajo: `claude/biblioteca-cocina-sync-e76l6l` (parte de `main`).

---

## Mapa de ficheros

| Fichero | Qué cambia |
|---|---|
| `actividad.js` | **Nuevo.** Cálculos de Actividad y del reto, puros. Exporta con `module.exports` para Node. |
| `cielo.js` | **Nuevo.** Fondo de constelaciones: `iniciarCielo`, `pausarCielo`, `recolorearCielo`. |
| `tests/actividad.test.js` | **Nuevo.** Pruebas de `actividad.js`. |
| `tests/gas-simulado.js` | **Nuevo.** Ejecuta `Code.gs` en Node con Google simulado. |
| `tests/code-gs.test.js` | **Nuevo.** Pruebas del reto en el backend. |
| `apps-script/Code.gs` | `reto` en `todo`, acción `guardarReto`. |
| `index.html` | Cabecera con avatar, pestañas en Añadir, pantalla Actividad, selector de tema, fuentes. |
| `style.css` | Reescrito: variables de los dos temas y todos los componentes. |
| `script.js` | Reto, tema, navegación, render de Biblioteca/Sagas/Añadir/Actividad. |
| `sw.js`, `manifest.json`, `README.md` | Ficheros nuevos en caché, colores, documentación. |

---

### Task 1: Cálculos de Actividad (`actividad.js`)

**Files:**
- Create: `actividad.js`
- Test: `tests/actividad.test.js`

- [ ] **Step 1: Escribir las pruebas**

`tests/actividad.test.js`:

```js
// Pruebas de actividad.js: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../actividad.js');

const L = (o) => ({ tengo: true, lectura: 'pendiente', fin: '', paginas: '', autor: '', ubicacion: '', prestado_a: '', ...o });
const libros = [
  L({ lectura: 'leido', fin: '2026-01-10', paginas: 300, autor: 'Rebecca Yarros', ubicacion: 'Salón · balda 2' }),
  L({ lectura: 'leido', fin: '2026-07-02', paginas: 500, autor: 'Rebecca Yarros', ubicacion: 'Salón · balda 2' }),
  L({ lectura: 'leido', fin: '2026-07-20', paginas: '', autor: 'Santiago Díaz', prestado_a: 'Laura' }),
  L({ lectura: 'leido', fin: '2025-12-30', paginas: 200, autor: 'Santiago Díaz', ubicacion: 'Dormitorio' }),
  L({ lectura: 'leido', fin: '', paginas: 100, autor: 'Patrick Rothfuss' }),
  L({ lectura: 'leyendo', autor: 'Rebecca Yarros', ubicacion: 'Salón · balda 2' }),
  L({ tengo: false, autor: 'Madeline Miller' })
];

test('leidosDelAnio: solo leídos con fecha de ese año', () => {
  assert.equal(A.leidosDelAnio(libros, 2026).length, 3);
  assert.equal(A.leidosDelAnio(libros, 2025).length, 1);
});

test('porMes: cuenta por el mes de fin', () => {
  assert.deepEqual(A.porMes(libros, 2026), [1, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0]);
});

test('paginasDelAnio: suma las páginas de los leídos del año, sin páginas cuenta 0', () => {
  assert.equal(A.paginasDelAnio(libros, 2026), 800);
});

test('autorMasLeido: el que más leídos tiene; empate por orden alfabético', () => {
  assert.deepEqual(A.autorMasLeido(libros), { autor: 'Rebecca Yarros', n: 2 });
  const empate = [L({ lectura: 'leido', autor: 'Zafón' }), L({ lectura: 'leido', autor: 'Allende' })];
  assert.deepEqual(A.autorMasLeido(empate), { autor: 'Allende', n: 1 });
  assert.equal(A.autorMasLeido([]), null);
});

test('reparto: libros en casa por balda, sin ubicación aparte y prestados fuera', () => {
  assert.deepEqual(A.reparto(libros), {
    ubicaciones: [
      { nombre: 'Salón · balda 2', n: 3 },
      { nombre: 'Dormitorio', n: 1 },
      { nombre: 'Sin ubicación', n: 1 }
    ],
    prestados: 1
  });
});

test('ritmo: por detrás, justo y cumplido (26 de septiembre de 2026)', () => {
  const hoy = new Date(2026, 8, 26);           // día 269 de 365
  const detras = A.ritmo(12, 20, hoy);          // tocaría llevar 15
  assert.deepEqual(detras, { esperado: 15, diferencia: -3, quedan: 8, sobran: 0, mesesQuedan: 3, cumplido: false });
  assert.equal(A.textoRitmo(detras), 'Vas 3 libros por detrás del ritmo. Te quedan 8 libros en 3 meses.');

  const justo = A.ritmo(12, 16, hoy);           // tocaría llevar 12
  assert.equal(A.textoRitmo(justo), 'Vas justo al ritmo. Te quedan 4 libros en 3 meses.');

  const delante = A.ritmo(12, 10, hoy);         // tocaría llevar 7; ya cumplido
  assert.equal(delante.cumplido, true);
  assert.equal(A.textoRitmo(delante), '¡Reto cumplido! Llevas 2 de propina.');
  assert.equal(A.textoRitmo(A.ritmo(10, 10, hoy)), '¡Reto cumplido!');
});

test('ritmo: en diciembre dice «este mes» y en singular «1 libro»', () => {
  const r = A.ritmo(9, 12, new Date(2026, 11, 1));   // tocaría llevar 11
  assert.equal(A.textoRitmo(r), 'Vas 2 libros por detrás del ritmo. Te quedan 3 libros este mes.');
  const uno = A.ritmo(1, 2, new Date(2026, 5, 30));  // tocaría llevar 1
  assert.equal(A.textoRitmo(uno), 'Vas justo al ritmo. Te queda 1 libro en 6 meses.');
});
```

- [ ] **Step 2: Ver que fallan**

Run: `cd /home/user/bliblioteca-may && node --test tests/`
Expected: FAIL con `Cannot find module '../actividad.js'`.

- [ ] **Step 3: Implementar `actividad.js`**

```js
// =============================================
// actividad.js - Mi Biblioteca
// Cálculos de la pantalla Actividad y del reto anual. Funciones puras:
// reciben los libros (y la fecha de hoy) y no tocan el DOM, así se
// prueban con Node (tests/actividad.test.js).
// =============================================

const MESES_CORTOS = ['E', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

// "2026-03-14" es del año 2026
function esDelAnio(fecha, anio) { return String(fecha || '').startsWith(String(anio)); }

// Un leído sin fecha de fin cuenta en el total, pero no en ningún año
function leidosDelAnio(libros, anio) {
  return libros.filter(l => l.lectura === 'leido' && esDelAnio(l.fin, anio));
}

function porMes(libros, anio) {
  const meses = new Array(12).fill(0);
  leidosDelAnio(libros, anio).forEach(l => {
    const m = Number(String(l.fin).slice(5, 7));
    if (m >= 1 && m <= 12) meses[m - 1]++;
  });
  return meses;
}

function paginasDelAnio(libros, anio) {
  return leidosDelAnio(libros, anio).reduce((n, l) => n + (Number(l.paginas) || 0), 0);
}

// Autor con más libros leídos. Empate: el primero por orden alfabético.
function autorMasLeido(libros) {
  const cuenta = {};
  libros.filter(l => l.lectura === 'leido' && String(l.autor || '').trim())
    .forEach(l => { const a = String(l.autor).trim(); cuenta[a] = (cuenta[a] || 0) + 1; });
  const orden = Object.keys(cuenta).sort((a, b) => cuenta[b] - cuenta[a] || a.localeCompare(b, 'es'));
  return orden.length ? { autor: orden[0], n: cuenta[orden[0]] } : null;
}

// Libros que tienes, por balda. Los prestados van aparte: no están en su balda.
function reparto(libros) {
  const cuenta = {};
  let prestados = 0;
  libros.filter(l => l.tengo).forEach(l => {
    if (l.prestado_a) { prestados++; return; }
    const u = String(l.ubicacion || '').trim() || 'Sin ubicación';
    cuenta[u] = (cuenta[u] || 0) + 1;
  });
  const ubicaciones = Object.keys(cuenta)
    .map(nombre => ({ nombre, n: cuenta[nombre] }))
    .sort((a, b) => b.n - a.n || (a.nombre === 'Sin ubicación') - (b.nombre === 'Sin ubicación') || a.nombre.localeCompare(b.nombre, 'es'));
  return { ubicaciones, prestados };
}

// Ritmo del reto: cuántos libros "tocaría" llevar hoy para llegar a la meta
function ritmo(leidos, meta, hoy) {
  const anio = hoy.getFullYear();
  const inicio = new Date(anio, 0, 1);
  const dias = Math.round((new Date(anio + 1, 0, 1) - inicio) / 864e5);
  const dia = Math.round((new Date(anio, hoy.getMonth(), hoy.getDate()) - inicio) / 864e5) + 1;
  const esperado = Math.round(meta * dia / dias);
  return {
    esperado,
    diferencia: leidos - esperado,
    quedan: Math.max(0, meta - leidos),
    sobran: Math.max(0, leidos - meta),
    mesesQuedan: 11 - hoy.getMonth(),
    cumplido: leidos >= meta
  };
}

function textoRitmo(r) {
  const libros = n => n === 1 ? '1 libro' : n + ' libros';
  if (r.cumplido) return r.sobran ? '¡Reto cumplido! Llevas ' + r.sobran + ' de propina.' : '¡Reto cumplido!';
  const plazo = r.mesesQuedan === 0 ? 'este mes' : r.mesesQuedan === 1 ? 'en 1 mes' : 'en ' + r.mesesQuedan + ' meses';
  const resto = (r.quedan === 1 ? 'Te queda ' : 'Te quedan ') + libros(r.quedan) + ' ' + plazo + '.';
  if (r.diferencia > 0) return 'Vas ' + libros(r.diferencia) + ' por delante del ritmo. ' + resto;
  if (r.diferencia < 0) return 'Vas ' + libros(-r.diferencia) + ' por detrás del ritmo. ' + resto;
  return 'Vas justo al ritmo. ' + resto;
}

if (typeof module !== 'undefined') {
  module.exports = { MESES_CORTOS, esDelAnio, leidosDelAnio, porMes, paginasDelAnio, autorMasLeido, reparto, ritmo, textoRitmo };
}
```

La ordenación de `reparto` deja «Sin ubicación» detrás de las baldas con el mismo número. En la prueba, «Dormitorio» y «Sin ubicación» tienen 1 cada una y «Dormitorio» va primero.

- [ ] **Step 4: Ver que pasan**

Run: `node --test tests/`
Expected: `# pass 7`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add actividad.js tests/actividad.test.js
git commit -m "actividad.js: cálculos de Actividad y del reto, con pruebas"
```

---

### Task 2: Reto en el backend (`Code.gs`)

**Files:**
- Create: `tests/gas-simulado.js`, `tests/code-gs.test.js`
- Modify: `apps-script/Code.gs` (`doGet` caso `todo`, `doPost`, sección nueva)

- [ ] **Step 1: Simulador de Apps Script**

`tests/gas-simulado.js`:

```js
// Ejecuta apps-script/Code.gs en Node con los servicios de Google simulados
// en memoria (hojas, propiedades, caché). Solo lo que usa Code.gs.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');

function crearHoja() {
  const filas = [];
  return {
    filas,
    getMaxRows: () => 1000,
    setFrozenRows() {},
    getLastRow: () => filas.length,
    deleteRow: n => { filas.splice(n - 1, 1); },
    getRange: (r, c, nr = 1, nc = 1) => ({
      setNumberFormat() { return this; },
      setFontWeight() { return this; },
      setValues(v) { v.forEach((fila, i) => { filas[r - 1 + i] = fila.slice(); }); return this; },
      getValues: () => filas.slice(r - 1, r - 1 + nr).map(f => f.slice(c - 1, c - 1 + nc)),
      createTextFinder: t => ({
        matchEntireCell() { return this; },
        findNext() {
          for (let i = r - 1; i < r - 1 + nr; i++) if (String(filas[i][c - 1]) === t) return { getRow: () => i + 1 };
          return null;
        }
      })
    })
  };
}

function crearBackend(props = {}) {
  const hojas = {};
  const libro = {
    getSheetByName: n => hojas[n] || null,
    insertSheet: n => (hojas[n] = crearHoja()),
    getUrl: () => 'https://docs.google.com/spreadsheets/d/simulada',
    getId: () => 'simulada'
  };
  const cache = {};
  const ctx = {
    PropertiesService: { getScriptProperties: () => ({
      getProperty: k => (k in props ? props[k] : null),
      setProperty: (k, v) => { props[k] = String(v); },
      getProperties: () => ({ ...props })
    }) },
    SpreadsheetApp: { getActiveSpreadsheet: () => libro, openById: () => libro, create: () => libro },
    CacheService: { getScriptCache: () => ({
      get: k => (k in cache ? cache[k] : null), put: (k, v) => { cache[k] = v; }, remove: k => { delete cache[k]; }
    }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      computeHmacSha256Signature: (v, k) => [...crypto.createHmac('sha256', k).update(v).digest()],
      base64EncodeWebSafe: b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_')
    },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => ({ t, setMimeType() { return this; } }) },
    Logger: { log() {} },
    UrlFetchApp: {}
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8'), ctx);
  ctx.setup();
  return {
    ctx, hojas, props,
    get: p => JSON.parse(ctx.doGet({ parameter: p }).t),
    post: d => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(d) } }).t)
  };
}

module.exports = { crearBackend };
```

- [ ] **Step 2: Escribir las pruebas del reto**

`tests/code-gs.test.js`:

```js
// Pruebas del backend (Code.gs) con Google simulado: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const { crearBackend } = require('./gas-simulado.js');

function preparar() {
  const b = crearBackend({ PIN_ana: '1234', PIN_luis: '9999' });
  b.ana = { perfil: 'ana', clave: b.get({ accion: 'entrar', perfil: 'ana', pin: '1234' }).clave };
  b.luis = { perfil: 'luis', clave: b.get({ accion: 'entrar', perfil: 'luis', pin: '9999' }).clave };
  return b;
}

test('todo devuelve reto vacío si no hay meta', () => {
  const b = preparar();
  const r = b.get({ accion: 'todo', ...b.ana });
  assert.equal(r.ok, true);
  assert.deepEqual(r.reto, {});
});

test('guardarReto guarda la meta del perfil y todo la devuelve', () => {
  const b = preparar();
  assert.deepEqual(b.post({ accion: 'guardarReto', anio: '2026', meta: 20, ...b.ana }), { ok: true });
  assert.deepEqual(b.post({ accion: 'guardarReto', anio: '2027', meta: 5, ...b.ana }), { ok: true });
  assert.deepEqual(b.get({ accion: 'todo', ...b.ana }).reto, { 2026: 20, 2027: 5 });
});

test('guardarReto rechaza metas fuera de 1-100, decimales y años raros', () => {
  const b = preparar();
  for (const [anio, meta] of [['2026', 0], ['2026', 101], ['2026', 7.5], ['26', 10], ['2026', 'diez']]) {
    assert.deepEqual(b.post({ accion: 'guardarReto', anio, meta, ...b.ana }), { ok: false, error: 'meta' }, `${anio}/${meta}`);
  }
  assert.deepEqual(b.get({ accion: 'todo', ...b.ana }).reto, {});
});

test('cada perfil tiene su propio reto', () => {
  const b = preparar();
  b.post({ accion: 'guardarReto', anio: '2026', meta: 20, ...b.ana });
  assert.deepEqual(b.get({ accion: 'todo', ...b.luis }).reto, {});
});

test('guardarReto sin clave válida se rechaza', () => {
  const b = preparar();
  assert.deepEqual(b.post({ accion: 'guardarReto', anio: '2026', meta: 20, perfil: 'ana', clave: 'falsa' }), { ok: false, error: 'clave' });
});

test('las propiedades RETO_ no aparecen como perfiles', () => {
  const b = preparar();
  b.post({ accion: 'guardarReto', anio: '2026', meta: 20, ...b.ana });
  assert.deepEqual(b.get({ accion: 'perfiles' }).perfiles, ['ana', 'luis']);
});
```

- [ ] **Step 3: Ver que fallan**

Run: `node --test tests/`
Expected: las pruebas de `code-gs.test.js` fallan (`r.reto` es `undefined`, `guardarReto` responde `accion desconocida`). Las de actividad siguen pasando.

- [ ] **Step 4: Implementar en `Code.gs`**

En `doGet`, sustituir la línea de `todo`:

```js
    case 'todo':        return json({ ok: true, libros: leer('LIBROS', p.perfil), sagas: leer('SAGAS', p.perfil), reto: leerReto(p.perfil) });
```

En `doPost`, dentro del `switch`, detrás de `case 'borrarSaga'`:

```js
      case 'guardarReto':
        if (!guardarReto(perfil, d.anio, d.meta)) return json({ ok: false, error: 'meta' });
        break;
```

Nueva sección, justo antes de `// ── GOOGLE BOOKS`:

```js
// ── RETO ANUAL ────────────────────────────────
// Una meta por año y perfil, en la propiedad del script RETO_ana = {"2026": 20}.
// No va en la hoja: es un dato por perfil, no una fila.

function leerReto(perfil) {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('RETO_' + perfil) || '{}'); }
  catch (err) { return {}; }
}

function guardarReto(perfil, anio, meta) {
  anio = String(anio);
  meta = Number(meta);
  if (!/^\d{4}$/.test(anio) || !Number.isInteger(meta) || meta < 1 || meta > 100) return false;
  const reto = leerReto(perfil);
  reto[anio] = meta;
  PropertiesService.getScriptProperties().setProperty('RETO_' + perfil, JSON.stringify(reto));
  return true;
}
```

Añadir al comentario de cabecera, tras el párrafo de PERFILES:

```js
// RETO: la meta de libros del año de cada perfil va en la propiedad
// RETO_ana (la escribe la app; no hace falta tocarla a mano).
```

- [ ] **Step 5: Ver que pasan**

Run: `node --test tests/`
Expected: `# pass 13`, `# fail 0`.

- [ ] **Step 6: Commit**

```bash
git add apps-script/Code.gs tests/gas-simulado.js tests/code-gs.test.js
git commit -m "Code.gs: meta del reto anual por perfil, con pruebas del backend simulado"
```

---

### Task 3: Reto en la app (datos y cola)

**Files:**
- Modify: `script.js` (estado global, `cargarDatos`, `vaciarCola`, `descargar`, `entrarPerfil`, sección nueva)

- [ ] **Step 1: Estado y carga**

Tras `let cola   = [];`:

```js
let reto   = {};          // meta del reto por año: { "2026": 20 }
```

En `cargarDatos`, tras la línea de `cola`:

```js
  reto   = leerLS(lsDatos('reto'), {});
```

- [ ] **Step 2: La cola no se atasca con un servidor antiguo**

En `vaciarCola`, sustituir:

```js
      const r = await apiPost(cola[0]);
      if (!r || !r.ok) throw new Error((r && r.error) || 'sin respuesta');
```

por:

```js
      const r = await apiPost(cola[0]);
      // Un Code.gs anterior al reto responde "accion desconocida", y una meta rechazada
      // no se arregla reintentando: se descarta ese envío para no atascar la cola
      if (cola[0].accion === 'guardarReto' && r && !r.ok && r.error !== 'clave') {
        cola.shift();
        guardarLS(lsDatos('cola'), cola);
        continue;
      }
      if (!r || !r.ok) throw new Error((r && r.error) || 'sin respuesta');
```

- [ ] **Step 3: Recibir el reto del servidor**

En `descargar`, tras `sagas  = r.sagas.map(normalizarSaga);`:

```js
    if (r.reto) { reto = r.reto; guardarLS(lsDatos('reto'), reto); }
```

En `entrarPerfil`, tras `sagas  = combinar(t.sagas.map(normalizarSaga), sagas);`:

```js
    if (t.reto) { reto = { ...reto, ...t.reto }; guardarLS(lsDatos('reto'), reto); }
```

- [ ] **Step 4: Guardar la meta**

Justo antes de `// ── SINCRONIZACIÓN CON GOOGLE SHEETS`:

```js
function guardarMeta(anio, meta) {
  reto[anio] = meta;
  guardarLS(lsDatos('reto'), reto);
  encolar({ accion: 'guardarReto', anio: String(anio), meta });
  renderTodo();
}
```

(`renderTodo` pinta Actividad desde la Task 11; hasta entonces no hace nada con el reto.)

- [ ] **Step 5: Comprobar sintaxis y pruebas**

Run: `node --check script.js && node --test tests/`
Expected: sin salida de `--check`; `# fail 0`.

- [ ] **Step 6: Commit**

```bash
git add script.js
git commit -m "Reto: la meta se guarda por perfil en el móvil y se envía a la hoja"
```

---

### Task 4: Fondo de constelaciones (`cielo.js`)

**Files:**
- Create: `cielo.js`

- [ ] **Step 1: Crear `cielo.js`**

```js
// =============================================
// cielo.js - Mi Biblioteca
// Fondo de constelaciones. Parte de network-background.js, adaptado a móvil:
// - canvas FIJO del tamaño de la pantalla (no del documento): el coste no
//   crece con la lista de libros; el scroll mueve las estrellas más despacio
//   que el contenido, como profundidad
// - brillo con una imagen precalculada en vez de shadowBlur
// - 42 estrellas en móvil, 75 en PC; con "reducir movimiento", quieto
// Los colores salen de las variables CSS del tema (--cielo-*).
// =============================================

const Cielo = (() => {
  const movil = matchMedia('(pointer: coarse)').matches || innerWidth < 600;
  const quieto = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const N = movil ? 42 : 75;
  const ENLACE = movil ? 105 : 130;
  const VELOCIDAD = 0.12, PROFUNDIDAD = 0.25;
  const RADIO_RATON = 160, FUERZA_RATON = 0.004;

  let canvas, ctx, w = 0, h = 0, estrellas = [], sprites = {}, tema = {};
  let raton = { x: -9999, y: -9999 }, ultimoScroll = 0, pausado = false;

  function sprite(rgb, brillo) {
    const s = document.createElement('canvas');
    s.width = s.height = 32;
    const g = s.getContext('2d');
    const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    if (brillo) {
      gr.addColorStop(0, `rgba(${rgb},.95)`);
      gr.addColorStop(.25, `rgba(${rgb},.45)`);
      gr.addColorStop(1, `rgba(${rgb},0)`);
    } else {                       // punto de tinta: borde nítido, sin halo
      gr.addColorStop(0, `rgba(${rgb},.9)`);
      gr.addColorStop(.3, `rgba(${rgb},.7)`);
      gr.addColorStop(.36, `rgba(${rgb},0)`);
    }
    g.fillStyle = gr;
    g.fillRect(0, 0, 32, 32);
    return s;
  }

  function leerTema() {
    const css = getComputedStyle(document.documentElement);
    const v = n => css.getPropertyValue(n).trim();
    tema = {
      a: v('--cielo-a') || '226,191,106',
      b: v('--cielo-b') || '180,150,230',
      brillo: v('--cielo-brillo') !== '0',
      linea: Number(v('--cielo-linea')) || .3,
      punto: Number(v('--cielo-punto')) || .95
    };
    sprites = { a: sprite(tema.a, tema.brillo), b: sprite(tema.b, tema.brillo) };
  }

  function medir() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const pw = w, ph = h;
    w = innerWidth; h = innerHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (pw && ph) estrellas.forEach(e => { e.x *= w / pw; e.y *= h / ph; });
  }

  function crear() {
    estrellas = Array.from({ length: N }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - .5) * VELOCIDAD, vy: (Math.random() - .5) * VELOCIDAD,
      r: Math.random() * 1.4 + .8,
      b: Math.random() < .3,              // 30 % en el segundo color
      fase: Math.random() * Math.PI * 2
    }));
  }

  function dibujar(t) {
    ctx.clearRect(0, 0, w, h);
    const dScroll = scrollY - ultimoScroll;
    ultimoScroll = scrollY;

    if (!quieto) estrellas.forEach(e => {
      e.x += e.vx;
      e.y += e.vy - dScroll * PROFUNDIDAD;
      if (e.x < -20) e.x = w + 20; else if (e.x > w + 20) e.x = -20;
      if (e.y < -20) e.y = h + 20; else if (e.y > h + 20) e.y = -20;
      const dx = raton.x - e.x, dy = raton.y - e.y;
      if (Math.hypot(dx, dy) < RADIO_RATON) { e.x -= dx * FUERZA_RATON; e.y -= dy * FUERZA_RATON; }
    });

    ctx.lineWidth = .8;
    for (let i = 0; i < estrellas.length; i++) {
      for (let j = i + 1; j < estrellas.length; j++) {
        const p = estrellas[i], q = estrellas[j];
        const dx = p.x - q.x, dy = p.y - q.y;
        if (Math.abs(dx) > ENLACE || Math.abs(dy) > ENLACE) continue;
        const d = Math.hypot(dx, dy);
        if (d < ENLACE) {
          ctx.strokeStyle = `rgba(${p.b && q.b ? tema.b : tema.a},${(1 - d / ENLACE) * tema.linea})`;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
        }
      }
    }

    estrellas.forEach(e => {
      const d = Math.hypot(raton.x - e.x, raton.y - e.y);
      if (d < RADIO_RATON) {
        ctx.strokeStyle = `rgba(${tema.a},${(1 - d / RADIO_RATON) * .5})`;
        ctx.beginPath(); ctx.moveTo(raton.x, raton.y); ctx.lineTo(e.x, e.y); ctx.stroke();
      }
    });

    estrellas.forEach(e => {
      const tin = quieto ? 1 : .75 + .25 * Math.sin(t / 900 + e.fase);
      const tam = e.r * (tema.brillo ? 7 : 5) * tin;
      ctx.globalAlpha = tema.punto * tin;
      ctx.drawImage(e.b ? sprites.b : sprites.a, e.x - tam / 2, e.y - tam / 2, tam, tam);
    });
    ctx.globalAlpha = 1;
  }

  function bucle(t) {
    if (!pausado) dibujar(t);
    requestAnimationFrame(bucle);
  }

  function iniciar(c) {
    canvas = c;
    ctx = c.getContext('2d');
    leerTema(); medir(); crear();
    ultimoScroll = scrollY;
    addEventListener('resize', medir);
    if (!movil) {
      addEventListener('mousemove', e => { raton.x = e.clientX; raton.y = e.clientY; });
      document.addEventListener('mouseleave', () => { raton.x = raton.y = -9999; });
    }
    if (quieto) dibujar(0); else requestAnimationFrame(bucle);
  }

  // Con una ficha abierta no se ve el fondo: no gastar batería en él
  function pausar(si) {
    pausado = si;
    if (!si) ultimoScroll = scrollY;     // sin salto al volver
  }

  function recolorear() {
    if (!canvas) return;
    leerTema();
    if (quieto || pausado) dibujar(0);
  }

  return { iniciar, pausar, recolorear };
})();

function iniciarCielo(canvas) { Cielo.iniciar(canvas); }
function pausarCielo(si) { Cielo.pausar(si); }
function recolorearCielo() { Cielo.recolorear(); }
```

- [ ] **Step 2: Comprobar sintaxis**

Run: `node --check cielo.js`
Expected: sin salida.

- [ ] **Step 3: Commit**

```bash
git add cielo.js
git commit -m "cielo.js: fondo de constelaciones adaptado a móvil"
```

---

### Task 5: Estructura HTML (`index.html`)

**Files:**
- Modify: `index.html` (entero)

- [ ] **Step 1: Sustituir `index.html` por completo**

```html
<!DOCTYPE html>
<html lang="es" data-tema="noche">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Mi Biblioteca</title>
  <meta name="description" content="Tu biblioteca personal: libros, lecturas y sagas">
  <meta name="theme-color" id="metaTema" content="#120f1c">
  <script>
    // Tema antes de pintar, para que no parpadee (lo mismo que aplicarTema en script.js)
    (function () {
      var t = 'noche';
      try { t = JSON.parse(localStorage.getItem('mb_tema')) || 'noche'; } catch (e) {}
      if (t === 'auto') t = matchMedia('(prefers-color-scheme: dark)').matches ? 'noche' : 'pergamino';
      document.documentElement.dataset.tema = t === 'pergamino' ? 'pergamino' : 'noche';
    })();
  </script>
  <link rel="manifest" href="manifest.json">
  <link rel="icon" href="icons/icon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="icons/icon-192.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cinzel:wght@500;700&family=EB+Garamond:ital,wght@0,500;0,600;1,400&family=Figtree:wght@400;500;600;700&display=swap">
  <!-- Solo los iconos que usa la app (~22 KB). Si se añade uno: mantener orden alfabético -->
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,300..600,0..1,0&icon_names=add,arrow_forward,auto_stories,barcode_scanner,bookmark_border,check,check_circle,close,cloud_done,cloud_off,collections_bookmark,delete,done_all,download,edit_note,favorite,help_outline,insights,library_add,local_library,menu_book,pause,person,schedule,search,settings,shelves,smartphone,star,sync,task_alt,travel_explore,upload,warning&display=block">
  <link rel="stylesheet" href="style.css">
</head>
<body>

  <canvas id="cielo" aria-hidden="true"></canvas>

  <header class="top">
    <div class="logo" aria-hidden="true"><span class="ic">menu_book</span></div>
    <div class="marca">
      <h1>Mi Biblioteca</h1>
      <div class="seccion" id="nombreSeccion">Biblioteca</div>
    </div>
    <button id="syncEstado" class="sync" data-ir="screenAjustes"></button>
    <button id="avatar" class="avatar" data-ir="screenAjustes" aria-label="Perfil y ajustes"></button>
  </header>

  <main>
    <!-- BIBLIOTECA -->
    <section id="screenBiblioteca" class="screen active">
      <div id="panelResumen"></div>
      <div id="chips" class="chips"></div>
      <div class="buscador">
        <span class="ic">search</span>
        <input id="buscador" type="search" placeholder="Buscar por título, autor, saga o balda" autocomplete="off">
      </div>
      <div id="tituloEstanteria" class="titulo-seccion"></div>
      <div id="listaLibros" class="lista"></div>
    </section>

    <!-- AÑADIR -->
    <section id="screenAnadir" class="screen">
      <div class="pestanas" id="pestanasAnadir">
        <button data-pestana="escanear" class="active" aria-pressed="true"><span class="ic">barcode_scanner</span>Escanear</button>
        <button data-pestana="buscar" aria-pressed="false"><span class="ic">search</span>Buscar</button>
        <button id="btnManual" type="button"><span class="ic">edit_note</span>A mano</button>
      </div>

      <div id="panelEscanear" class="panel-anadir">
        <button id="btnEscanear" class="btn grande"><span class="ic">barcode_scanner</span>Escanear código de barras</button>
        <div id="escaner" class="escaner" hidden>
          <video id="video" playsinline muted></video>
          <div class="marco"><i></i><i></i><i></i><i></i><div class="laser"></div></div>
          <div class="pista">Apunta al código de barras del libro</div>
          <button id="btnPararEscaner" class="btn">Cancelar</button>
        </div>
        <p class="sub">En el PC, o si no tienes cámara, usa «Buscar» y escribe el ISBN.</p>
      </div>

      <div id="panelBuscar" class="panel-anadir" hidden>
        <form id="formIsbn" class="buscar">
          <input id="inputIsbn" inputmode="numeric" placeholder="ISBN (ej. 97884…)" autocomplete="off" aria-label="ISBN">
          <button class="btn secundario">Buscar</button>
        </form>
        <form id="formTexto" class="buscar">
          <input id="inputTexto" type="search" placeholder="Título o autor" autocomplete="off" aria-label="Título o autor">
          <button class="btn secundario">Buscar</button>
        </form>
      </div>

      <div id="resultados" class="lista"></div>
    </section>

    <!-- SAGAS -->
    <section id="screenSagas" class="screen">
      <div id="resumenSagas"></div>
      <div id="chipsSagas" class="chips"></div>
      <div id="listaSagas" class="lista"></div>
    </section>

    <!-- ACTIVIDAD -->
    <section id="screenActividad" class="screen">
      <div id="panelActividad" class="actividad"></div>
    </section>

    <!-- PERFIL Y AJUSTES (se abre desde el avatar) -->
    <section id="screenAjustes" class="screen">
      <h2>Aspecto</h2>
      <div class="segmentado" id="selectorTema" role="group" aria-label="Tema">
        <button data-tema="noche">Noche</button>
        <button data-tema="pergamino">Pergamino</button>
        <button data-tema="auto">Automático</button>
      </div>
      <p class="sub">Automático usa noche o pergamino según tenga el móvil el modo oscuro.</p>

      <h2>Perfil</h2>
      <p class="sub">Cada persona tiene su propia biblioteca y entra con su PIN. Los libros se guardan en la hoja y los ves desde cualquier dispositivo. Sin perfil, se quedan solo en este móvil.</p>
      <p class="estado-sync" id="infoSync"></p>

      <form id="formPerfil" class="tarjeta">
        <label id="campoUrl">URL de la aplicación web (acaba en /exec)
          <input id="cfgUrl" type="url" placeholder="https://script.google.com/macros/s/…/exec" autocomplete="off">
        </label>
        <label>Perfil
          <select id="cfgPerfil"><option value="">Elige tu perfil</option></select>
        </label>
        <label>PIN
          <input id="cfgPin" type="password" inputmode="numeric" autocomplete="off">
        </label>
        <button class="btn">Entrar</button>
      </form>

      <div id="bloqueConectado" hidden>
        <p class="sub">Estás en la biblioteca de <strong id="perfilActual"></strong>.</p>
        <div class="fila-botones">
          <button id="btnSincronizar" class="btn secundario"><span class="ic">sync</span>Sincronizar</button>
          <button id="btnSalir" class="btn peligro">Cambiar de perfil</button>
        </div>
      </div>

      <h2>Copia de seguridad</h2>
      <p class="sub">Un fichero con todos tus libros y sagas.</p>
      <div class="fila-botones">
        <button id="btnExportar" class="btn secundario"><span class="ic">upload</span>Exportar</button>
        <label class="btn secundario"><span class="ic">download</span>Importar
          <input id="inputImportar" type="file" accept="application/json,.json" hidden>
        </label>
      </div>

      <p class="creditos">Datos de libros: Open Library y Wikidata.</p>
    </section>
  </main>

  <nav class="bottom">
    <button data-screen="screenBiblioteca" class="active"><span class="ic">auto_stories</span>Biblioteca</button>
    <button data-screen="screenSagas"><span class="ic">collections_bookmark</span>Sagas</button>
    <button data-screen="screenAnadir" class="central" aria-label="Añadir libro"><span class="circulo"><span class="ic">add</span></span></button>
    <button data-screen="screenActividad"><span class="ic">insights</span>Actividad</button>
  </nav>

  <div id="modal" class="modal" hidden>
    <div id="modalHoja" class="hoja"></div>
  </div>

  <div id="toast" class="toast" role="status"></div>

  <script src="cielo.js"></script>
  <script src="sagas.js"></script>
  <script src="actividad.js"></script>
  <script src="script.js"></script>
</body>
</html>
```

Sin commit aún: la Task 6 adapta `script.js` a los ids nuevos (quita `btnNuevaSaga`) y se hace commit de las dos juntas.

---

### Task 6: Navegación, tema, avatar, pestañas y cielo (`script.js`)

**Files:**
- Modify: `script.js` (`LS`, `NOMBRES_SECCION`, `abrirModal`, `popstate`, sección nueva de tema, `renderTodo`, `engancharEventos`, arranque)

- [ ] **Step 1: Claves y secciones**

Sustituir `const LS = { config: 'mb_config', filtro: 'mb_filtro' };` por:

```js
const LS = { config: 'mb_config', filtro: 'mb_filtro', tema: 'mb_tema' };
```

Sustituir `NOMBRES_SECCION`:

```js
const NOMBRES_SECCION = {
  screenBiblioteca: 'Biblioteca', screenAnadir: 'Añadir', screenSagas: 'Sagas',
  screenActividad: 'Actividad', screenAjustes: 'Perfil y ajustes'
};
```

- [ ] **Step 2: Pausar el cielo con una ficha abierta**

En `abrirModal`, tras `$('#modal').hidden = false;`:

```js
  pausarCielo(true);
```

En el `popstate`, sustituir el cuerpo del `if` por:

```js
  if (modalAbierto) { modalAbierto = false; $('#modal').hidden = true; $('#modalHoja').innerHTML = ''; pausarCielo(false); }
```

- [ ] **Step 3: Tema y avatar**

Justo antes de `// ── EVENTOS`:

```js
// ── TEMA Y AVATAR ───────────────────────────

const COLOR_TEMA = { noche: '#120f1c', pergamino: '#efe4cc' };

// 'noche' | 'pergamino' | 'auto' → el que se pinta
function temaResuelto(t) {
  if (t === 'auto') return matchMedia('(prefers-color-scheme: dark)').matches ? 'noche' : 'pergamino';
  return t === 'pergamino' ? 'pergamino' : 'noche';
}

function aplicarTema(t) {
  const real = temaResuelto(t);
  document.documentElement.dataset.tema = real;
  $('#metaTema').setAttribute('content', COLOR_TEMA[real]);
  document.querySelectorAll('#selectorTema button').forEach(b => b.classList.toggle('active', b.dataset.tema === t));
  recolorearCielo();
}

function pintarAvatar() {
  $('#avatar').innerHTML = config.perfil ? esc(nombrePerfil(config.perfil)[0]) : ic('person');
}
```

Sustituir `renderTodo`:

```js
function renderTodo() {
  renderBiblioteca();
  renderSagas();
  pintarSync();
  pintarAvatar();
}
```

En `renderAjustes`, tras `$('#perfilActual').textContent = …;`:

```js
  pintarAvatar();
```

- [ ] **Step 4: Eventos**

En `engancharEventos`, sustituir el manejador de `#chipsSagas`:

```js
  $('#chipsSagas').onclick = e => {
    const b = e.target.closest('[data-filtro-saga]');
    if (!b) return;
    filtroSagas = b.dataset.filtroSaga;
    renderSagas();
  };
```

Sustituir las dos líneas de `#btnManual` y `#btnNuevaSaga`:

```js
  $('#btnManual').onclick = () => abrirPreview({});
  $('#pestanasAnadir').onclick = e => {
    const b = e.target.closest('[data-pestana]');
    if (!b) return;
    document.querySelectorAll('#pestanasAnadir [data-pestana]').forEach(x => {
      x.classList.toggle('active', x === b);
      x.setAttribute('aria-pressed', String(x === b));
    });
    $('#panelEscanear').hidden = b.dataset.pestana !== 'escanear';
    $('#panelBuscar').hidden = b.dataset.pestana !== 'buscar';
    if (b.dataset.pestana !== 'escanear') pararEscaner();
  };
  $('#selectorTema').onclick = e => {
    const b = e.target.closest('[data-tema]');
    if (!b) return;
    guardarLS(LS.tema, b.dataset.tema);
    aplicarTema(b.dataset.tema);
  };
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (leerLS(LS.tema, 'noche') === 'auto') aplicarTema('auto');
  });
```

En la delegación de clics, añadir `[data-nueva-saga],[data-quiero-tomo]` a la lista del `closest(...)`:

```js
    const t = e.target.closest('[data-libro],[data-resultado],[data-cerrar],[data-ir],[data-manual],[data-abrir-saga],[data-buscar-saga],[data-borrar-libro],[data-borrar-saga],[data-editar-saga],[data-crear-de-saga],[data-sumar-paginas],[data-terminar],[data-poner-ubicacion],[data-nueva-saga],[data-quiero-tomo],.segmentado[data-campo] button,.estrellas button');
```

Sustituir la rama de `ds.ir`:

```js
    else if (ds.ir)                      { if (ds.filtroSagas) { filtroSagas = ds.filtroSagas; renderSagas(); } irA(ds.ir); }
```

Y detrás de la rama de `ds.terminar`:

```js
    else if (ds.nuevaSaga !== undefined) { abrirEditorSaga({ nombre: '', autor: '', fuente: 'manual', libros: [{ titulo: '', num: 1, incluir: true }] }); }
    else if (ds.quieroTomo)              { crearDesdeSaga(ds.quieroTomo, Number(ds.indice), false, false); }
```

- [ ] **Step 5: Arranque**

En el `DOMContentLoaded`, antes de `cargarLocal();`:

```js
  iniciarCielo($('#cielo'));
```

Y tras `engancharEventos();`:

```js
  aplicarTema(leerLS(LS.tema, 'noche'));
```

- [ ] **Step 6: `crearDesdeSaga` sin abrir la ficha desde la lista**

Sustituir la firma y el final de `crearDesdeSaga`:

```js
function crearDesdeSaga(sagaId, indice, tengo, abrir = true) {
```

```js
  toast(tengo ? '📗 Añadido a tu biblioteca' : '♡ Añadido a tus deseos');
  if (abrir) abrirSaga(sagaId);
}
```

- [ ] **Step 7: Comprobar y commit (Task 5 + 6)**

Run: `node --check script.js && node --test tests/`
Expected: sin errores; `# fail 0`.

```bash
git add index.html script.js
git commit -m "Estructura nueva: avatar, Actividad en la barra, pestañas de Añadir, tema y cielo"
```

---

### Task 7: Estilos de los dos temas (`style.css`)

**Files:**
- Modify: `style.css` (entero)

- [ ] **Step 1: Sustituir `style.css` por completo**

```css
/* =============================================
   style.css - Mi Biblioteca
   Temas: noche (por defecto) y pergamino. Todos los colores son variables
   en :root y el tema pergamino las redefine; los componentes solo usan
   variables. Fondo de constelaciones en cielo.js (--cielo-*).
   ============================================= */

:root {
  --bg:           #120f1c;
  --bg-luz:       #2c2245;
  --sup:          rgba(30, 25, 50, .35);    /* tarjetas translúcidas */
  --sup-fuerte:   rgba(38, 31, 62, .86);    /* hojas, avisos, leyendo */
  --campo:        rgba(239, 227, 196, .07);
  --borde:        rgba(226, 191, 106, .24);
  --borde-suave:  rgba(239, 227, 196, .10);
  --tx:           #efe3c4;
  --tx-2:         #b9a98a;
  --tx-3:         #857a92;
  --acento:       #e2bf6a;
  --acento-2:     #f3d98c;
  --sobre-acento: #1a1426;
  --leyendo:      #f3d98c;
  --leido:        #9fd6b5;
  --prestado:     #f0a98f;
  --deseo:        #d9a6e8;
  --peligro:      #ff9c8a;
  --barra:        rgba(239, 227, 196, .14);
  --sombra:       0 14px 34px rgba(0, 0, 0, .4);
  --brillo:       0 0 18px rgba(226, 191, 106, .35);
  --sombra-tx:    0 1px 3px rgba(18, 15, 28, .9);
  --velo:         rgba(8, 6, 14, .62);
  --toast-bg:     #efe3c4;
  --toast-tx:     #1a1426;
  --cielo-a:      226, 191, 106;
  --cielo-b:      180, 150, 230;
  --cielo-brillo: 1;
  --cielo-linea:  .3;
  --cielo-punto:  .95;
  --inscripcion:  'Cinzel', 'Trajan Pro', Georgia, serif;
  --serif:        'EB Garamond', Garamond, Georgia, serif;
  --sans:         'Figtree', system-ui, sans-serif;
  --r:            16px;
  color-scheme: dark;
}

:root[data-tema="pergamino"] {
  --bg:           #efe4cc;
  --bg-luz:       #f8f0dc;
  --sup:          rgba(250, 244, 230, .42);
  --sup-fuerte:   rgba(252, 247, 236, .94);
  --campo:        rgba(92, 64, 30, .07);
  --borde:        rgba(122, 88, 40, .28);
  --borde-suave:  rgba(92, 64, 30, .13);
  --tx:           #2e2213;
  --tx-2:         #6b5638;
  --tx-3:         #917b5a;
  --acento:       #8a5a17;
  --acento-2:     #6d440c;
  --sobre-acento: #fbf4e3;
  --leyendo:      #8a5a17;
  --leido:        #2f6b4b;
  --prestado:     #a3432a;
  --deseo:        #7a4a9a;
  --peligro:      #a3302a;
  --barra:        rgba(92, 64, 30, .14);
  --sombra:       0 10px 26px rgba(92, 64, 30, .18);
  --brillo:       0 3px 10px rgba(92, 64, 30, .28);
  --sombra-tx:    0 1px 2px rgba(239, 228, 204, .95);
  --velo:         rgba(60, 40, 15, .35);
  --toast-bg:     #2e2213;
  --toast-tx:     #fbf4e3;
  --cielo-a:      110, 72, 22;
  --cielo-b:      90, 60, 110;
  --cielo-brillo: 0;
  --cielo-linea:  .22;
  --cielo-punto:  .55;
  color-scheme: light;
}

* { box-sizing: border-box; }
html { background: var(--bg); }
body {
  margin: 0;
  min-height: 100vh;
  background: radial-gradient(120% 70% at 50% -10%, var(--bg-luz) 0%, var(--bg) 60%) fixed;
  font-family: var(--sans);
  font-size: 14px;
  line-height: 1.55;
  color: var(--tx);
  -webkit-tap-highlight-color: transparent;
  overscroll-behavior-y: none;
  padding-bottom: calc(84px + env(safe-area-inset-bottom));
}
button, input, textarea, select { font: inherit; color: inherit; }
button { cursor: pointer; border: 0; background: none; padding: 0; }
h1, h2, h3 { font-family: var(--serif); font-weight: 600; color: var(--tx); margin: 0; line-height: 1.15; text-wrap: balance; }
[hidden] { display: none !important; }
:focus-visible { outline: 2px solid var(--acento); outline-offset: 2px; }

#cielo { position: fixed; inset: 0; width: 100%; height: 100%; z-index: 0; pointer-events: none; }

.ic {
  font-family: 'Material Symbols Outlined';
  font-weight: 400;
  font-style: normal;
  font-size: 20px;
  line-height: 1;
  display: inline-block;
  vertical-align: middle;
  white-space: nowrap;
  direction: ltr;
  -webkit-font-smoothing: antialiased;
  font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
  flex-shrink: 0;
  /* Los iconos son ligaduras: en mayúsculas dejan de reconocerse ("MENU_BOOK") */
  text-transform: none;
  letter-spacing: normal;
}
.ic.relleno { font-variation-settings: 'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24; }

.ceja { font-family: var(--inscripcion); font-size: 10px; font-weight: 700; letter-spacing: .2em; text-transform: uppercase; color: var(--acento); }

/* ── Cabecera ─────────────────────────────── */
header.top {
  position: sticky; top: 0; z-index: 20;
  display: flex; align-items: center; gap: 10px;
  padding: calc(10px + env(safe-area-inset-top)) 16px 10px;
  background: linear-gradient(to bottom, var(--bg) 55%, transparent);
}
header.top .logo {
  width: 36px; height: 36px; border-radius: 11px; display: grid; place-items: center;
  background: linear-gradient(135deg, var(--acento-2), var(--acento)); color: var(--sobre-acento); box-shadow: var(--brillo);
}
header.top .marca { flex: 1; min-width: 0; }
header.top h1 { font-size: 21px; line-height: 1.05; }
header.top .seccion { font-family: var(--inscripcion); font-size: 9.5px; font-weight: 700; letter-spacing: .22em; text-transform: uppercase; color: var(--acento); }
.sync { display: flex; align-items: center; gap: 3px; font-size: 11px; font-weight: 600; color: var(--tx-3); padding: 6px 8px; border-radius: 99px; }
.sync.error { color: var(--peligro); }
.avatar {
  width: 36px; height: 36px; border-radius: 50%; flex-shrink: 0; display: grid; place-items: center;
  font-family: var(--inscripcion); font-weight: 700; font-size: 15px; color: var(--sobre-acento);
  background: linear-gradient(135deg, var(--acento-2), var(--acento));
  box-shadow: 0 0 0 2px var(--bg), 0 0 0 3px var(--borde);
}
.avatar .ic { font-size: 20px; }
.avatar.grande { width: 60px; height: 60px; font-size: 24px; }
.avatar.grande .ic { font-size: 30px; }

main { position: relative; z-index: 1; padding: 8px 16px 24px; max-width: 640px; margin: 0 auto; }
.screen { display: none; flex-direction: column; gap: 14px; }
.screen.active { display: flex; }

/* ── Botones ──────────────────────────────── */
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  min-height: 44px; padding: 10px 18px; border-radius: 12px;
  background: linear-gradient(135deg, var(--acento-2), var(--acento)); color: var(--sobre-acento);
  font-weight: 700; font-size: 13px; letter-spacing: .01em;
  box-shadow: var(--brillo);
  transition: transform .1s, opacity .15s;
}
.btn:active { transform: scale(.98); }
.btn.secundario { background: var(--campo); color: var(--tx); box-shadow: inset 0 0 0 1px var(--borde); }
.btn.peligro { background: none; color: var(--peligro); box-shadow: none; }
.btn.grande { min-height: 56px; font-size: 15px; border-radius: var(--r); width: 100%; }
.btn-link { color: var(--acento); font-weight: 600; font-size: 13px; padding: 8px 0; text-decoration: underline; text-underline-offset: 3px; }
.btn-borde { align-self: flex-start; padding: 6px 12px; border-radius: 99px; font-size: 12px; font-weight: 700; color: var(--acento); box-shadow: inset 0 0 0 1px var(--borde); }

/* ── Campos ───────────────────────────────── */
input, textarea, select {
  width: 100%; min-height: 44px; padding: 10px 12px;
  border: 0; border-radius: 12px;
  background: var(--campo); outline: none;
  box-shadow: inset 0 0 0 1px var(--borde-suave);
  transition: box-shadow .15s;
}
input:focus, textarea:focus, select:focus { box-shadow: inset 0 0 0 2px var(--acento); }
input::placeholder, textarea::placeholder { color: var(--tx-3); }
select option { background: var(--bg); color: var(--tx); }
textarea { resize: vertical; }
label { display: flex; flex-direction: column; gap: 4px; font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--tx-2); }
label input, label textarea, label select { text-transform: none; letter-spacing: 0; font-weight: 400; font-size: 14px; color: var(--tx); }

.buscador {
  display: flex; align-items: center; gap: 8px; padding: 0 12px;
  background: var(--sup); border-radius: 14px; box-shadow: inset 0 0 0 1px var(--borde-suave);
  backdrop-filter: blur(2px); -webkit-backdrop-filter: blur(2px);
}
.buscador input { background: none; box-shadow: none; padding-left: 0; }
.buscador input:focus { box-shadow: none; }
.buscador .ic { color: var(--tx-3); }

form.buscar { display: flex; gap: 8px; }
form.buscar input { flex: 1; }

/* ── Resumen (Biblioteca) ─────────────────── */
#panelResumen { display: flex; flex-direction: column; gap: 12px; }
.metricas { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.metrica {
  background: var(--sup); border-radius: 14px; padding: 10px 12px;
  box-shadow: inset 0 0 0 1px var(--borde-suave);
  backdrop-filter: blur(2px); -webkit-backdrop-filter: blur(2px);
}
.metrica .et { font-size: 9.5px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: var(--tx-3); }
.metrica .num { font-family: var(--serif); font-size: 28px; font-weight: 600; line-height: 1.15; font-variant-numeric: tabular-nums; text-shadow: var(--sombra-tx); }
.metrica .sub { font-size: 11.5px; color: var(--tx-2); }
.metrica.activa .et { color: var(--acento); }

.alerta-sagas {
  display: flex; align-items: center; gap: 12px; width: 100%; text-align: left;
  padding: 12px 14px; border-radius: var(--r);
  background: var(--sup-fuerte); box-shadow: inset 0 0 0 1px var(--borde);
}
.alerta-sagas .cuadro, .resumen-sagas .cuadro {
  width: 36px; height: 36px; border-radius: 10px; flex-shrink: 0; display: grid; place-items: center;
  background: linear-gradient(135deg, var(--acento-2), var(--acento)); color: var(--sobre-acento);
}
.alerta-sagas .txt { flex: 1; min-width: 0; }
.alerta-sagas strong { display: block; font-size: 13.5px; }
.alerta-sagas .detalle-alerta { display: block; font-size: 12px; color: var(--tx-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.alerta-sagas > .ic { color: var(--acento); }

.titulo-seccion { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.titulo-seccion h2 { font-size: 22px; text-shadow: var(--sombra-tx); }
.titulo-seccion span { font-size: 11px; font-weight: 600; color: var(--tx-3); }

/* ── Leyendo ahora ────────────────────────── */
.leyendo-card {
  position: relative; overflow: hidden;
  display: flex; gap: 14px; padding: 14px;
  background: var(--sup-fuerte); border-radius: 20px;
  box-shadow: inset 0 0 0 1px var(--borde), var(--sombra);
}
.leyendo-card::before {
  content: ''; position: absolute; width: 160px; height: 160px; right: -50px; top: -70px; border-radius: 50%;
  background: var(--acento); opacity: .16; filter: blur(30px); pointer-events: none;
}
.leyendo-card .portada { width: 78px; box-shadow: var(--brillo); }
.leyendo-card .cuerpo { position: relative; flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.leyendo-card h3 { font-size: 21px; }
.leyendo-card .autor { font-size: 12px; color: var(--tx-2); }
.leyendo-card .pags { display: flex; justify-content: space-between; font-size: 11.5px; color: var(--tx-2); font-variant-numeric: tabular-nums; }
.leyendo-card .fila { display: flex; gap: 6px; flex-wrap: wrap; margin-top: auto; }
.leyendo-card .fila .btn { min-height: 34px; padding: 6px 10px; font-size: 12px; border-radius: 99px; }
.leyendo-card .fila .btn:last-child { margin-left: auto; }

/* ── Chips ────────────────────────────────── */
.chips { display: flex; gap: 6px; overflow-x: auto; margin: 0 -16px; padding: 2px 16px; scrollbar-width: none; }
.chips::-webkit-scrollbar { display: none; }
.chips button {
  flex-shrink: 0; display: flex; align-items: center; gap: 6px;
  padding: 7px 13px; border-radius: 99px;
  background: var(--sup); color: var(--tx-2); box-shadow: inset 0 0 0 1px var(--borde-suave);
  backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px);
  font-size: 12px; font-weight: 600; white-space: nowrap;
}
.chips button .n { font-weight: 500; opacity: .7; font-size: 11px; font-variant-numeric: tabular-nums; }
.chips button .ic { font-size: 16px; }
.chips button.active { background: var(--acento); color: var(--sobre-acento); box-shadow: var(--brillo); }

/* ── Lista de libros ──────────────────────── */
.lista { display: flex; flex-direction: column; gap: 8px; }
.libro {
  display: flex; gap: 12px; padding: 11px;
  background: var(--sup); border-radius: 14px; box-shadow: inset 0 0 0 1px var(--borde-suave);
  backdrop-filter: blur(2px); -webkit-backdrop-filter: blur(2px);
  cursor: pointer; transition: transform .1s;
}
.libro:active { transform: scale(.99); }
.libro .portada { width: 52px; }
.libro .info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; text-shadow: var(--sombra-tx); }
.libro .arriba { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.libro .saga-tag { font-size: 10.5px; font-weight: 700; color: var(--acento); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.libro h3 { font-size: 17.5px; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.libro p { margin: 0; font-size: 12px; color: var(--tx-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.libro .pie { margin-top: auto; padding-top: 5px; display: flex; align-items: center; justify-content: space-between; gap: 6px; font-size: 11px; color: var(--tx-3); }
.libro .pie span { display: flex; align-items: center; gap: 3px; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.libro .pie .ic { font-size: 14px; }
.estrellitas { color: var(--acento); letter-spacing: .05em; }

.estado { flex-shrink: 0; font-size: 9.5px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
.e-leyendo { color: var(--leyendo); }
.e-leido { color: var(--leido); }
.e-prestado { color: var(--prestado); }
.e-deseo { color: var(--deseo); }
.e-pendiente, .e-abandonado { color: var(--tx-3); }

/* Portada con lomo */
.portada {
  position: relative; flex-shrink: 0; aspect-ratio: 2 / 3;
  border-radius: 5px; overflow: hidden;
  background: linear-gradient(160deg, hsl(var(--h) 30% 38%), hsl(var(--h) 36% 20%));
  display: grid; place-items: center; box-shadow: 0 3px 10px rgba(0, 0, 0, .35);
}
.portada span { font-family: var(--serif); font-weight: 600; font-size: 18px; color: rgba(255, 255, 255, .85); }
.portada img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.portada::after {
  content: ''; position: absolute; inset: 0 auto 0 0; width: 5px;
  background: linear-gradient(90deg, rgba(0, 0, 0, .35), transparent);
}
.portada.grande { width: 116px; border-radius: 8px; box-shadow: var(--brillo), 0 8px 20px rgba(0, 0, 0, .3); }
.portada.grande span { font-size: 30px; }
.portada.mini { width: 62px; }
.portada.mini span { font-size: 14px; }

.vacio, .cargando { text-align: center; color: var(--tx-2); padding: 24px 8px; }
.bienvenida {
  text-align: center; padding: 36px 16px; border-radius: var(--r);
  background: var(--sup-fuerte); box-shadow: inset 0 0 0 1px var(--borde);
  display: flex; flex-direction: column; align-items: center; gap: 8px;
}
.bienvenida .ic { font-size: 44px; color: var(--acento); }
.bienvenida h2 { font-size: 24px; }
.bienvenida p { margin: 0 0 8px; color: var(--tx-2); }

/* ── Barra de progreso ────────────────────── */
.barra { height: 6px; border-radius: 99px; background: var(--barra); overflow: hidden; }
.barra > div { height: 100%; border-radius: 99px; background: linear-gradient(90deg, var(--acento), var(--acento-2)); transition: width .4s; }
.barra.completa > div { background: var(--leido); }

/* ── Sagas ────────────────────────────────── */
.resumen-sagas {
  display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: var(--r);
  background: var(--sup-fuerte); box-shadow: inset 0 0 0 1px var(--borde);
}
.resumen-sagas strong { display: block; font-family: var(--serif); font-size: 20px; font-weight: 600; line-height: 1.1; }
.resumen-sagas span { font-size: 12px; color: var(--tx-2); }
.saga {
  padding: 13px; border-radius: var(--r); cursor: pointer; display: flex; flex-direction: column; gap: 8px;
  background: var(--sup); box-shadow: inset 0 0 0 1px var(--borde-suave);
  backdrop-filter: blur(2px); -webkit-backdrop-filter: blur(2px);
}
.saga .cab { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; text-shadow: var(--sombra-tx); }
.saga h3 { font-size: 22px; }
.saga .autor { margin: 0; font-size: 12px; color: var(--tx-2); }
.etiqueta-saga { flex-shrink: 0; display: inline-flex; align-items: center; gap: 3px; font-size: 10px; font-weight: 700; padding: 4px 9px; border-radius: 99px; box-shadow: inset 0 0 0 1px currentColor; }
.etiqueta-saga .ic { font-size: 14px; }
.etiqueta-saga.falta { color: var(--prestado); }
.etiqueta-saga.completa { color: var(--leido); }
.saga .cifras { display: flex; justify-content: space-between; font-size: 11px; font-weight: 600; color: var(--tx-2); font-variant-numeric: tabular-nums; }
.saga .cifras .pct { color: var(--acento); font-weight: 700; }
.tomos { display: flex; gap: 10px; overflow-x: auto; margin: 0 -13px; padding: 2px 13px 4px; scrollbar-width: none; }
.tomos::-webkit-scrollbar { display: none; }
.tomo { width: 62px; flex-shrink: 0; display: flex; flex-direction: column; gap: 3px; }
.tomo small { font-size: 8.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--tx-3); line-height: 1.2; }
.tomo > span { font-size: 10.5px; line-height: 1.2; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.tomo.leido small { color: var(--leido); }
.tomo.leyendo small { color: var(--leyendo); }
.tomo .hueco {
  width: 62px; aspect-ratio: 2 / 3; border-radius: 5px; display: grid; place-items: center;
  box-shadow: inset 0 0 0 1.5px var(--borde); border: 1.5px dashed var(--borde);
  font-family: var(--inscripcion); font-size: 16px; font-weight: 700; color: var(--acento);
}
.tomo .quiero { align-self: flex-start; font-size: 10px; font-weight: 700; color: var(--acento); padding: 2px 0; }

/* ── Hojas (modal inferior) ───────────────── */
.modal {
  position: fixed; inset: 0; z-index: 50;
  background: var(--velo);
  backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px);
  display: flex; align-items: flex-end; justify-content: center;
}
.hoja {
  width: 100%; max-width: 560px; max-height: 92vh; overflow-y: auto;
  background: var(--bg); background-image: radial-gradient(120% 40% at 50% 0%, var(--bg-luz), var(--bg) 70%);
  border-radius: 22px 22px 0 0; box-shadow: inset 0 1px 0 var(--borde), var(--sombra);
  padding: 10px 16px calc(20px + env(safe-area-inset-bottom));
  animation: subir .22s ease-out;
}
.hoja::before { content: ''; display: block; width: 44px; height: 4px; border-radius: 99px; background: var(--borde); margin: 0 auto 12px; }
@keyframes subir { from { transform: translateY(40px); opacity: .4; } }
.hoja > div { display: flex; flex-direction: column; gap: 12px; }
.hoja h2 { font-size: 24px; }
.hoja p { margin: 0; }
.sub { color: var(--tx-2); font-size: 13px; margin: 0; }
.meta { font-size: 12px; color: var(--tx-2); margin: 0; }
.autor { color: var(--acento); font-weight: 600; font-size: 13px; }
.aviso { background: var(--sup-fuerte); box-shadow: inset 0 0 0 1px var(--prestado); color: var(--tx); padding: 10px 12px; border-radius: 12px; font-size: 13px; }

.bloque, .paso {
  background: var(--sup-fuerte); border-radius: var(--r); padding: 12px;
  box-shadow: inset 0 0 0 1px var(--borde-suave);
  display: flex; flex-direction: column; gap: 10px;
}
.bloque .cab-bloque { display: flex; justify-content: space-between; align-items: center; font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--tx-2); }
.bloque .cab-bloque .ic { color: var(--acento); }
.bloque .cab-bloque > span { display: flex; align-items: center; gap: 6px; }

.cabecera { display: flex; gap: 14px; align-items: flex-start; }
.cabecera > div:last-child { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.cabecera .campos { gap: 8px !important; }
.verificado { align-self: flex-start; display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 700; color: var(--leido); padding: 2px 9px; border-radius: 99px; box-shadow: inset 0 0 0 1px currentColor; }
.verificado .ic { font-size: 14px; }

.segmentado { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 3px; padding: 3px; background: var(--campo); border-radius: 12px; box-shadow: inset 0 0 0 1px var(--borde-suave); }
.segmentado button { padding: 9px 4px; border-radius: 9px; font-size: 12px; font-weight: 600; color: var(--tx-2); display: flex; align-items: center; justify-content: center; gap: 4px; }
.segmentado button .ic { font-size: 16px; }
.segmentado button.active { background: var(--acento); color: var(--sobre-acento); box-shadow: var(--brillo); }

/* Añadir: pasos de la ficha */
.paso-t { display: flex; justify-content: space-between; align-items: baseline; font-weight: 700; font-size: 13px; }
.paso-t small { font-weight: 600; font-size: 11px; color: var(--tx-3); }
.opciones { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.opciones.dos { grid-template-columns: 1fr 1fr; }
.opciones button {
  display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 10px 4px; border-radius: 12px;
  font-size: 12.5px; font-weight: 700; color: var(--tx); box-shadow: inset 0 0 0 1px var(--borde-suave);
}
.opciones button .ic { font-size: 18px; color: var(--tx-2); }
.opciones button small { font-weight: 500; font-size: 10px; color: var(--tx-3); }
.opciones button.active { color: var(--acento); box-shadow: inset 0 0 0 1.5px var(--acento); background: var(--campo); }
.opciones button.active .ic { color: var(--acento); }
.campo-saga { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 9px 12px; border-radius: 12px; box-shadow: inset 0 0 0 1px var(--borde); font-weight: 600; }
.campo-saga em { font-style: normal; font-size: 10px; font-weight: 700; color: var(--acento); text-transform: uppercase; letter-spacing: .08em; margin-left: 4px; }
.campo-saga button { font-size: 12px; font-weight: 700; color: var(--acento); }
.contador { display: flex; justify-content: space-between; align-items: center; font-size: 12.5px; color: var(--tx-2); }
.botones-num { display: inline-flex; align-items: center; gap: 12px; }
.botones-num button { width: 32px; height: 32px; border-radius: 50%; box-shadow: inset 0 0 0 1px var(--borde); color: var(--acento); font-size: 18px; line-height: 1; }
.botones-num b { min-width: 28px; text-align: center; font-family: var(--serif); font-size: 20px; color: var(--tx); font-variant-numeric: tabular-nums; }
.cargando-saga { display: flex; align-items: center; gap: 6px; margin: 0; font-size: 13px; color: var(--tx-2); }
.cargando-saga .ic { color: var(--acento); animation: latir 1.2s ease-in-out infinite; }
@keyframes latir { 50% { opacity: .35; } }

.progreso-lectura { display: flex; flex-direction: column; gap: 6px; }
.progreso-lectura .fila { display: flex; justify-content: space-between; font-size: 12px; color: var(--tx-2); }
.progreso-lectura .fila strong { color: var(--tx); }
.pasos { display: flex; gap: 6px; }
.pasos button { flex: 1; padding: 8px; border-radius: 10px; font-size: 12px; font-weight: 700; color: var(--acento); box-shadow: inset 0 0 0 1px var(--borde); }
.pasos input { flex: 1.2; min-height: 36px; padding: 6px 10px; text-align: center; }

.estrellas { display: flex; gap: 2px; }
.estrellas button { font-size: 28px; line-height: 1; color: var(--barra); padding: 2px; }
.estrellas button.on { color: var(--acento); }
.estrellas button .ic { font-size: 28px; }

.caja-saga { cursor: pointer; }
.caja-saga h3 { font-size: 20px; }
.estantes { display: grid; grid-template-columns: repeat(auto-fill, minmax(76px, 1fr)); gap: 6px; }
.estante { padding: 8px 4px; border-radius: 10px; background: var(--campo); text-align: center; display: flex; flex-direction: column; align-items: center; gap: 2px; min-width: 0; }
.estante .ic { font-size: 20px; }
.estante .t { font-size: 11px; font-weight: 600; width: 100%; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.estante .e { font-size: 9px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; }
.estante.leido .ic, .estante.leido .e { color: var(--leido); }
.estante.leyendo .ic, .estante.leyendo .e, .estante.actual .e { color: var(--leyendo); }
.estante.actual { box-shadow: inset 0 0 0 1.5px var(--acento); }
.estante.falta { box-shadow: inset 0 0 0 1px var(--borde); border: 1px dashed var(--borde); }
.estante.falta .ic, .estante.falta .e { color: var(--acento); }
.estante.tengo .ic, .estante.tengo .e, .estante.deseado .ic, .estante.deseado .e { color: var(--tx-2); }

.chips-ubicacion { display: flex; flex-wrap: wrap; gap: 6px; }
.chips-ubicacion button { padding: 6px 12px; border-radius: 99px; font-size: 12px; font-weight: 600; color: var(--tx-2); box-shadow: inset 0 0 0 1px var(--borde-suave); }
.chips-ubicacion button.active { background: var(--acento); color: var(--sobre-acento); box-shadow: none; }

details summary { cursor: pointer; font-weight: 600; font-size: 13px; color: var(--acento); padding: 4px 0; }
details[open] summary { margin-bottom: 8px; }
details > label { margin-bottom: 8px; }

.acciones { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; margin-top: 4px; }
.acciones .btn:last-child { flex: 1; max-width: 260px; }

/* Ficha de saga */
.filas-saga { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px; }
.filas-saga li { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 12px; background: var(--campo); }
.filas-saga li.falta { box-shadow: inset 0 0 0 1px var(--borde); }
.filas-saga .icono .ic { font-size: 22px; }
.filas-saga li.leido .icono { color: var(--leido); }
.filas-saga li.leyendo .icono, .filas-saga li.falta .icono { color: var(--acento); }
.filas-saga li.tengo .icono, .filas-saga li.deseado .icono { color: var(--tx-2); }
.filas-saga .n { font-family: var(--serif); font-weight: 600; font-size: 17px; min-width: 22px; text-align: center; color: var(--tx-2); }
.filas-saga .t { flex: 1; min-width: 0; font-weight: 600; font-size: 14px; }
.filas-saga .t[data-libro] { cursor: pointer; }
.filas-saga .t small { display: block; font-weight: 500; font-size: 11px; color: var(--tx-2); }
.filas-saga li.falta .t small { color: var(--acento); font-weight: 700; text-transform: uppercase; letter-spacing: .06em; font-size: 10px; }
.filas-saga .botones { display: flex; gap: 4px; }
.filas-saga .botones button { display: flex; align-items: center; gap: 2px; padding: 6px 8px; border-radius: 10px; background: var(--acento); color: var(--sobre-acento); font-size: 11px; font-weight: 700; }
.filas-saga .botones button.suave { background: var(--campo); color: var(--tx); box-shadow: inset 0 0 0 1px var(--borde); }
.filas-saga .botones .ic { font-size: 16px; }

/* Editor de saga */
.fila-ed { display: grid; grid-template-columns: 26px 56px 1fr; gap: 6px; align-items: center; }
.fila-ed:has(.este) { grid-template-columns: 26px 56px 1fr auto; }
.fila-ed input[type=checkbox], .fila-ed input[type=radio] { width: 20px; height: 20px; min-height: 0; accent-color: var(--acento); box-shadow: none; }
.fila-ed .num { padding: 8px 6px; text-align: center; }
.fila-ed .este { flex-direction: row; align-items: center; gap: 4px; font-size: 10px; white-space: nowrap; }
#edFilas { display: flex; flex-direction: column; gap: 6px; }

/* ── Añadir ───────────────────────────────── */
.pestanas {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; padding: 4px; border-radius: 14px;
  background: var(--sup); box-shadow: inset 0 0 0 1px var(--borde-suave);
  backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px);
}
.pestanas button { display: flex; align-items: center; justify-content: center; gap: 5px; padding: 9px 4px; border-radius: 10px; font-size: 12.5px; font-weight: 700; color: var(--tx-2); }
.pestanas button .ic { font-size: 18px; }
.pestanas button.active { background: var(--acento); color: var(--sobre-acento); box-shadow: var(--brillo); }
.panel-anadir { display: flex; flex-direction: column; gap: 10px; }

.escaner { position: relative; border-radius: var(--r); overflow: hidden; background: #0c0a12; aspect-ratio: 4 / 3; box-shadow: inset 0 0 0 1px var(--borde); }
.escaner video { width: 100%; height: 100%; object-fit: cover; display: block; }
.escaner .marco { position: absolute; left: 12%; right: 12%; top: 34%; height: 32%; pointer-events: none; }
.escaner .marco i { position: absolute; width: 22px; height: 22px; border: 3px solid var(--acento); }
.escaner .marco i:nth-child(1) { top: 0; left: 0; border-right: 0; border-bottom: 0; border-top-left-radius: 6px; }
.escaner .marco i:nth-child(2) { top: 0; right: 0; border-left: 0; border-bottom: 0; border-top-right-radius: 6px; }
.escaner .marco i:nth-child(3) { bottom: 0; left: 0; border-right: 0; border-top: 0; border-bottom-left-radius: 6px; }
.escaner .marco i:nth-child(4) { bottom: 0; right: 0; border-left: 0; border-top: 0; border-bottom-right-radius: 6px; }
.escaner .laser { position: absolute; left: 6%; right: 6%; top: 50%; height: 2px; background: linear-gradient(90deg, transparent, var(--acento), transparent); box-shadow: 0 0 12px var(--acento); animation: laser 1.6s ease-in-out infinite; }
@keyframes laser { 50% { opacity: .3; } }
.escaner .pista { position: absolute; top: 12px; left: 50%; transform: translateX(-50%); background: rgba(8, 6, 14, .72); color: #efe3c4; font-size: 11px; font-weight: 600; padding: 5px 12px; border-radius: 99px; white-space: nowrap; }
.escaner .btn { position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%); }

/* ── Actividad ────────────────────────────── */
.actividad { display: flex; flex-direction: column; gap: 14px; }
.perfil-act { display: flex; align-items: center; gap: 14px; }
.perfil-act h2 { font-size: 26px; text-shadow: var(--sombra-tx); }
.reto {
  display: flex; flex-direction: column; gap: 8px; padding: 14px; border-radius: var(--r);
  background: var(--sup-fuerte); box-shadow: inset 0 0 0 1px var(--borde), var(--sombra);
}
.reto-cab { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.reto-cab h3 { font-size: 20px; }
.reto-cab span { font-weight: 700; font-size: 13px; color: var(--acento); font-variant-numeric: tabular-nums; }
.selector-meta { display: flex; flex-direction: column; gap: 10px; padding-top: 4px; }
.selector-meta .grande { display: flex; align-items: center; justify-content: center; gap: 22px; }
.selector-meta .grande button { width: 38px; height: 38px; border-radius: 50%; box-shadow: inset 0 0 0 1px var(--borde); color: var(--acento); font-size: 22px; line-height: 1; }
.selector-meta output { font-family: var(--serif); font-weight: 600; font-size: 44px; min-width: 76px; text-align: center; color: var(--acento); font-variant-numeric: tabular-nums; text-shadow: var(--brillo); }
.selector-meta input[type=range] { padding: 0; min-height: 28px; background: none; box-shadow: none; accent-color: var(--acento); }
.selector-meta .marcas { display: flex; justify-content: space-between; font-size: 10px; color: var(--tx-3); font-variant-numeric: tabular-nums; }
.cifras-act { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.cifra-act {
  padding: 11px 12px; border-radius: 14px; min-width: 0;
  background: var(--sup); box-shadow: inset 0 0 0 1px var(--borde-suave);
  backdrop-filter: blur(2px); -webkit-backdrop-filter: blur(2px);
}
.cifra-act small { display: block; font-size: 9.5px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: var(--tx-3); }
.cifra-act b { display: block; margin-top: 2px; font-family: var(--serif); font-weight: 600; font-size: 21px; line-height: 1.15; font-variant-numeric: tabular-nums; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; text-shadow: var(--sombra-tx); }
.cifra-act span { font-size: 11px; color: var(--tx-2); }
.bloque-act {
  display: flex; flex-direction: column; gap: 10px; padding: 14px; border-radius: var(--r);
  background: var(--sup); box-shadow: inset 0 0 0 1px var(--borde-suave);
  backdrop-filter: blur(2px); -webkit-backdrop-filter: blur(2px);
}
.grafico { display: grid; grid-template-columns: repeat(12, 1fr); gap: 5px; height: 120px; }
.mes { display: flex; flex-direction: column; justify-content: flex-end; align-items: center; gap: 3px; min-width: 0; }
.mes i { display: block; width: 100%; min-height: 3px; border-radius: 4px 4px 2px 2px; background: linear-gradient(to top, var(--acento), var(--acento-2)); }
.mes.futuro i { background: var(--barra); }
.mes .n { font-size: 10px; font-weight: 700; color: var(--tx-2); font-variant-numeric: tabular-nums; min-height: 14px; }
.mes .m { font-size: 10px; color: var(--tx-3); }
.mes.actual .m { color: var(--acento); font-weight: 700; }
.reparto { display: flex; flex-direction: column; gap: 10px; }
.fila-reparto { display: grid; grid-template-columns: 1fr auto; gap: 4px 10px; font-size: 13px; }
.fila-reparto b { font-variant-numeric: tabular-nums; color: var(--tx-2); font-weight: 600; }
.fila-reparto .barra { grid-column: 1 / -1; height: 5px; }

/* ── Perfil y ajustes ─────────────────────── */
#screenAjustes h2 { font-size: 22px; margin-top: 6px; }
.tarjeta { background: var(--sup-fuerte); border-radius: var(--r); padding: 14px; box-shadow: inset 0 0 0 1px var(--borde-suave); display: flex; flex-direction: column; gap: 12px; }
.estado-sync { display: flex; align-items: center; gap: 6px; font-size: 13px; margin: 0; }
.fila-botones { display: flex; gap: 8px; }
#bloqueConectado { display: flex; flex-direction: column; gap: 10px; }
.fila-botones > * { flex: 1; }
label.btn { flex-direction: row; text-transform: none; letter-spacing: .01em; font-size: 13px; }
.creditos { font-size: 11px; color: var(--tx-3); text-align: center; margin-top: 12px; }

/* ── Navegación inferior ──────────────────── */
nav.bottom {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 30;
  display: flex; justify-content: space-around; align-items: center;
  height: calc(70px + env(safe-area-inset-bottom)); padding-bottom: env(safe-area-inset-bottom);
  background: linear-gradient(to top, var(--bg) 62%, transparent);
}
nav.bottom button { display: flex; flex-direction: column; align-items: center; gap: 2px; min-width: 64px; font-size: 11px; font-weight: 600; color: var(--tx-3); }
nav.bottom button .ic { font-size: 24px; }
nav.bottom button.active { color: var(--acento); }
nav.bottom button.active .ic { font-variation-settings: 'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24; filter: drop-shadow(0 0 6px rgba(var(--cielo-a), .6)); }
nav.bottom button.central .circulo {
  width: 52px; height: 52px; border-radius: 50%; display: grid; place-items: center; margin-top: -18px;
  background: linear-gradient(135deg, var(--acento-2), var(--acento)); color: var(--sobre-acento);
  box-shadow: 0 0 0 4px var(--bg), var(--brillo);
}
nav.bottom button.central .circulo .ic { font-size: 28px; }

/* ── Aviso flotante ───────────────────────── */
.toast {
  position: fixed; left: 16px; right: 16px; bottom: calc(86px + env(safe-area-inset-bottom)); z-index: 60;
  max-width: 480px; margin: 0 auto;
  background: var(--toast-bg); color: var(--toast-tx);
  padding: 12px 16px; border-radius: 14px; box-shadow: var(--sombra);
  font-size: 13px; line-height: 1.45;
  transform: translateY(20px); opacity: 0; pointer-events: none;
  transition: transform .25s, opacity .25s;
}
.toast.show { transform: none; opacity: 1; pointer-events: auto; }
.toast.pulsable { cursor: pointer; }
.toast b { font-weight: 700; }
.toast small { display: block; margin-top: 3px; opacity: .7; font-size: 11px; }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
}
```

- [ ] **Step 2: Commit**

```bash
git add style.css
git commit -m "style.css: temas noche y pergamino con tarjetas translúcidas"
```

---

### Task 8: Pantalla Biblioteca (`script.js`)

**Files:**
- Modify: `script.js` (`badgesLibro` y `tarjetaLibro` → nuevas; `tarjetaLeyendo`; resumen de `renderBiblioteca`)

- [ ] **Step 1: Ayudas y fila de libro**

Sustituir `badgesLibro` y `tarjetaLibro` enteras por:

```js
// 3 → "III". Los números con decimales (2.5) o grandes se dejan como están.
function romano(n) {
  n = Number(n);
  if (!Number.isInteger(n) || n < 1 || n > 39) return String(n);
  return 'X'.repeat(Math.floor(n / 10)) + ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'][n % 10];
}

const estrellasTexto = v => '★'.repeat(v) + '☆'.repeat(5 - v);

function estadoLibro(l) {
  if (!l.tengo)     return { clase: 'deseo', texto: 'Lo quiero' };
  if (l.prestado_a) return { clase: 'prestado', texto: 'Prestado' };
  return { clase: l.lectura, texto: ESTADOS[l.lectura] };
}

function tarjetaLibro(l) {
  const s = sagaDe(l);
  const e = estadoLibro(l);
  const saga = s ? esc(s.nombre) + (l.saga_num !== '' ? ' · ' + esc(romano(l.saga_num)) : '') : '';
  const izq = l.prestado_a ? `${ic('local_library')}A ${esc(l.prestado_a)}`
            : !l.tengo      ? 'Aún no está en casa'
            : l.ubicacion   ? `${ic('shelves')}${esc(l.ubicacion)}` : '';
  const der = l.valoracion ? `<span class="estrellitas" aria-label="${l.valoracion} de 5 estrellas">${estrellasTexto(l.valoracion)}</span>`
            : l.lectura === 'leyendo' && l.pagina ? `Pág. ${esc(l.pagina)}`
            : l.paginas ? `${esc(l.paginas)} págs.` : esc(l.anio);
  return `<article class="libro" data-libro="${esc(l.id)}">
    ${portadaHTML(l)}
    <div class="info">
      <div class="arriba"><span class="saga-tag">${saga}</span><span class="estado e-${e.clase}">${e.texto}</span></div>
      <h3>${esc(l.titulo)}</h3>
      <p>${esc(l.autor)}</p>
      ${izq || der ? `<div class="pie"><span>${izq}</span><span>${der}</span></div>` : ''}
    </div>
  </article>`;
}
```

- [ ] **Step 2: Tarjeta de «Leyendo ahora»**

Sustituir `tarjetaLeyendo` entera:

```js
function tarjetaLeyendo(l) {
  const pct = porcentaje(l);
  const s = sagaDe(l);
  const ceja = s ? esc(s.nombre) + (l.saga_num !== '' ? ' · libro ' + esc(romano(l.saga_num)) : '') : 'Leyendo';
  return `<div class="leyendo-card">
    <div data-libro="${esc(l.id)}">${portadaHTML(l)}</div>
    <div class="cuerpo">
      <div data-libro="${esc(l.id)}">
        <div class="ceja">${ceja}</div>
        <h3>${esc(l.titulo)}</h3>
        <div class="autor">${esc(l.autor)}</div>
      </div>
      ${l.paginas ? `<div class="pags"><span>Pág. ${esc(l.pagina || 0)} de ${esc(l.paginas)}</span><span>${pct}%</span></div>
      <div class="barra"><div style="width:${pct}%"></div></div>` : ''}
      <div class="fila">
        <button class="btn secundario" data-sumar-paginas="${esc(l.id)}" data-n="10">+10 págs.</button>
        <button class="btn secundario" data-sumar-paginas="${esc(l.id)}" data-n="25">+25</button>
        <button class="btn" data-terminar="${esc(l.id)}">${ic('done_all')}Terminado</button>
      </div>
    </div>
  </div>`;
}
```

- [ ] **Step 3: Resumen y título de la estantería**

En `renderBiblioteca`, sustituir desde `// Resumen: métricas…` hasta `$('#panelResumen').hidden = !panel;` por:

```js
  // Resumen: cifras, sagas con huecos y lo que estoy leyendo
  let panel = '';
  if (libros.length) {
    const tengo = libros.filter(l => l.tengo).length;
    const leyendo = libros.filter(l => l.lectura === 'leyendo');
    const leidos = libros.filter(l => l.lectura === 'leido').length;
    const esteAnio = leidosDelAnio(libros, new Date().getFullYear()).length;
    panel += `<div class="metricas">
      <div class="metrica"><div class="et">En casa</div><div class="num">${tengo}</div><div class="sub">${tengo === 1 ? 'libro' : 'libros'}</div></div>
      <div class="metrica activa"><div class="et">● Leyendo</div><div class="num">${leyendo.length}</div><div class="sub">ahora</div></div>
      <div class="metrica"><div class="et">Leídos</div><div class="num">${leidos}</div><div class="sub">${esteAnio} este año</div></div>
    </div>`;

    const conHuecos = sagas.map(s => ({ s, p: progresoSaga(s) })).filter(x => x.p.faltanTener > 0);
    if (conHuecos.length) {
      const total = conHuecos.reduce((n, x) => n + x.p.faltanTener, 0);
      const nombresSagas = conHuecos.map(x => x.s.nombre);
      panel += `<button class="alerta-sagas" data-ir="screenSagas" data-filtro-sagas="faltan">
        <span class="cuadro">${ic('bookmark_border')}</span>
        <span class="txt">
          <strong>${total === 1 ? 'Te falta 1 libro' : 'Te faltan ' + total + ' libros'}</strong>
          <span class="detalle-alerta">Sagas a medias: ${esc(nombresSagas.slice(0, 2).join(', '))}${nombresSagas.length > 2 ? ' y ' + (nombresSagas.length - 2) + ' más' : ''}</span>
        </span>
        ${ic('arrow_forward')}
      </button>`;
    }

    if (leyendo.length && filtro === 'todos' && !q) {
      panel += `<div class="titulo-seccion"><h2>Leyendo ahora</h2>${leyendo.length > 1 ? `<span>${leyendo.length} libros</span>` : ''}</div>`;
      panel += leyendo.map(tarjetaLeyendo).join('');
    }
  }
  $('#panelResumen').innerHTML = panel;
  $('#panelResumen').hidden = !panel;
  $('#tituloEstanteria').innerHTML = libros.length ? `<h2>Mi estantería</h2><span>${lista.length} de ${libros.length}</span>` : '';
  $('#tituloEstanteria').hidden = !libros.length;
```

- [ ] **Step 4: Comprobar y commit**

Run: `node --check script.js && grep -n "badgesLibro" script.js`
Expected: sin errores; `grep` sin resultados.

```bash
git add script.js
git commit -m "Biblioteca: cifras, aviso de sagas, leyendo ahora y filas con saga, estado y balda"
```

---

### Task 9: Pantalla Sagas (`script.js`)

**Files:**
- Modify: `script.js` (`FILTROS_SAGA`, `renderSagas`, función nueva `tomoHTML`)

- [ ] **Step 1: Filtros**

Sustituir `FILTROS_SAGA`:

```js
const FILTROS_SAGA = {
  todas:     { nombre: 'Todas',     f: () => true },
  faltan:    { nombre: 'Te faltan', f: p => p.faltanTener > 0 },
  completas: { nombre: 'Completas', f: p => p.faltanTener === 0 }
};
```

- [ ] **Step 2: Tomos y lista**

Sustituir `renderSagas` entera por:

```js
// Un tomo en la fila de la saga: su portada, o un hueco si te falta
function tomoHTML(s, f, i) {
  const n = f.num !== '' ? 'Tomo ' + esc(romano(f.num)) : 'Tomo';
  const titulo = esc(tituloCorto(f.titulo, s.nombre));
  if (!f.libro) {
    return `<div class="tomo falta">
      <div class="hueco" aria-hidden="true">${f.num !== '' ? esc(romano(f.num)) : '?'}</div>
      <small>${n}</small><span>${titulo}</span>
      <button class="quiero" data-quiero-tomo="${esc(s.id)}" data-indice="${i}" aria-label="Añadir «${esc(f.titulo)}» a Lo quiero">+ Lo quiero</button>
    </div>`;
  }
  return `<div class="tomo ${f.estado}" data-libro="${esc(f.libro.id)}">
    ${portadaHTML(f.libro, 'mini')}
    <small>${n} · ${TEXTOS[f.estado]}</small><span>${titulo}</span>
  </div>`;
}

function renderSagas() {
  const cont = $('#listaSagas');
  const todas = sagas.map(s => ({ s, p: progresoSaga(s) }));
  const completas = todas.filter(x => x.p.faltanTener === 0).length;

  $('#resumenSagas').innerHTML = sagas.length ? `<div class="resumen-sagas">
      <span class="cuadro">${ic('collections_bookmark')}</span>
      <div>
        <strong>${sagas.length === 1 ? '1 saga en marcha' : sagas.length + ' sagas en marcha'}</strong>
        <span>${completas} ${completas === 1 ? 'completa' : 'completas'} · ${sagas.length - completas} con tomos por reunir</span>
      </div>
    </div>` : '';

  $('#chipsSagas').innerHTML = sagas.length ? Object.entries(FILTROS_SAGA).map(([k, v]) =>
    `<button data-filtro-saga="${k}" class="${k === filtroSagas ? 'active' : ''}">${v.nombre}<span class="n">${todas.filter(x => v.f(x.p)).length}</span></button>`).join('')
    + `<button data-nueva-saga>${ic('add')}Nueva</button>` : '';

  if (!sagas.length) {
    cont.innerHTML = `<div class="bienvenida">
      ${ic('collections_bookmark')}
      <h2>Aún no hay sagas</h2>
      <p>Se crean solas cuando añades un libro que forma parte de una. También puedes crear una a mano.</p>
      <button class="btn" data-nueva-saga>${ic('add')}Crear una saga a mano</button>
    </div>`;
    return;
  }
  const lista = todas.filter(x => FILTROS_SAGA[filtroSagas].f(x.p))
    .sort((a, b) => (a.p.faltanTener === 0) - (b.p.faltanTener === 0) || a.s.nombre.localeCompare(b.s.nombre));
  cont.innerHTML = lista.length ? lista.map(({ s, p }) => {
    const pct = p.total ? Math.round(p.tienes / p.total * 100) : 0;
    return `<article class="saga" data-abrir-saga="${esc(s.id)}">
      <div class="cab">
        <div>
          <div class="ceja">Saga · ${p.total === 1 ? '1 tomo' : p.total + ' tomos'}</div>
          <h3>${esc(s.nombre)}</h3>
          <p class="autor">${esc(s.autor)}</p>
        </div>
        ${p.faltanTener ? `<span class="etiqueta-saga falta">${p.faltanTener === 1 ? 'Falta 1' : 'Faltan ' + p.faltanTener}</span>`
                        : `<span class="etiqueta-saga completa">${ic('task_alt')}Completa</span>`}
      </div>
      <div class="barra${pct === 100 ? ' completa' : ''}"><div style="width:${pct}%"></div></div>
      <div class="cifras"><span>${p.tienes} de ${p.total} en casa · ${p.leidos} ${p.leidos === 1 ? 'leído' : 'leídos'}</span><span class="pct">${pct}%</span></div>
      <div class="tomos">${p.filas.map((f, i) => tomoHTML(s, f, i)).join('')}</div>
    </article>`;
  }).join('') : '<p class="vacio">Ninguna saga con ese filtro.</p>';
}
```

- [ ] **Step 3: Comprobar y commit**

Run: `node --check script.js && grep -n "porleer\|terminadas" script.js`
Expected: sin errores; `grep` sin resultados.

```bash
git add script.js
git commit -m "Sagas: resumen, progreso en casa y fila de tomos con huecos y Lo quiero"
```

---

### Task 10: Añadir en tres pasos (`script.js`)

**Files:**
- Modify: `script.js` (`abrirPreview` entera, variable nueva `previewActual`)

- [ ] **Step 1: Sustituir `abrirPreview` entera**

```js
let previewActual = null;   // la ficha abierta; una búsqueda de saga de otra ya cerrada se ignora

function abrirPreview(d, aviso) {
  const duplicado = libros.find(l => (d.isbn && l.isbn === d.isbn) || (d.titulo && mismoTitulo(l.titulo, d.titulo) && mismoAutor(l.autor, d.autor)));
  const sel = { estado: 'buscando', sagaId: null, num: '', propuesta: null };
  const token = {};
  previewActual = token;

  abrirModal(`
    <div class="preview">
      ${aviso ? `<p class="aviso">${esc(aviso)}</p>` : ''}
      ${duplicado ? `<p class="aviso">Ya tienes «${esc(duplicado.titulo)}» en tu biblioteca.</p>` : ''}
      <div class="cabecera">
        ${portadaHTML(d, 'grande')}
        <div class="campos">
          <div class="ceja">${d.titulo ? 'Libro encontrado' : 'Libro nuevo'}</div>
          <label>Título <input id="pvTitulo" value="${esc(d.titulo)}"></label>
          <label>Autor <input id="pvAutor" value="${esc(d.autor)}"></label>
          <p class="meta">${[d.editorial, d.anio, d.paginas ? d.paginas + ' págs.' : ''].filter(Boolean).map(esc).join(' · ')}</p>
          ${isbnValido(limpiarIsbn(d.isbn)) ? `<span class="verificado">${ic('check_circle')}ISBN verificado</span>` : ''}
        </div>
      </div>
      <label>ISBN <input id="pvIsbn" inputmode="numeric" autocomplete="off" value="${esc(d.isbn)}" placeholder="Opcional"></label>

      <section class="paso">
        <div class="paso-t"><span>1 · Saga</span><small id="pvSagaNota"></small></div>
        <div id="pvSaga"></div>
      </section>

      <section class="paso">
        <div class="paso-t"><span>2 · ¿Cómo lo tienes?</span></div>
        <div class="opciones" id="pvLectura">
          <button data-valor="pendiente" class="active">Por leer<small>en la estantería</small></button>
          <button data-valor="leyendo">Leyendo<small>ya empezado</small></button>
          <button data-valor="leido">Ya leído<small>terminado</small></button>
        </div>
        <div class="opciones dos" id="pvTengo">
          <button data-valor="true" class="active">${ic('menu_book')}Lo tengo<small>está en casa</small></button>
          <button data-valor="false">${ic('favorite')}Lo quiero<small>lista de deseos</small></button>
        </div>
      </section>

      <section class="paso">
        <div class="paso-t"><span>3 · ¿Dónde lo guardas?</span><small>opcional</small></div>
        <div class="chips-ubicacion" id="pvChipsUbicacion">${chipsUbicacion('', 'data-ubicacion-preview')}</div>
        <input id="pvUbicacion" placeholder="Otra balda, por ejemplo «Salón, balda 3»" aria-label="Ubicación en casa">
      </section>

      <div class="acciones">
        <button class="btn secundario" data-cerrar>Cancelar</button>
        <button class="btn" id="pvAnadir">${ic('library_add')}Guardar en mi biblioteca</button>
      </div>
    </div>`);

  // Paso 1: la saga se busca al abrir la ficha, con la misma lógica que comprobarSaga
  function pintarSaga() {
    const s = sel.sagaId ? sagaPorId(sel.sagaId) : null;
    let html, nota = '';
    if (sel.estado === 'buscando') {
      html = `<p class="cargando-saga">${ic('travel_explore')}Buscando saga…</p>`;
      nota = 'puedes guardar sin esperar';
    } else if (s) {
      html = `<div class="campo-saga"><span>${esc(s.nombre)}</span><button type="button" id="pvQuitarSaga">Quitar</button></div>
        <div class="contador"><span>Número de tomo</span><span class="botones-num">
          <button type="button" id="pvMenos" aria-label="Tomo anterior">−</button><b>${sel.num === '' ? '–' : esc(sel.num)}</b><button type="button" id="pvMas" aria-label="Tomo siguiente">+</button>
        </span></div>`;
      nota = 'detectada sola';
    } else if (sel.propuesta) {
      const n = sel.propuesta.libros.filter(e => e.incluir !== false).length;
      html = `<div class="campo-saga"><span>${esc(sel.propuesta.nombre)} · ${n} tomos<em>nueva</em></span><button type="button" id="pvQuitarSaga">Quitar</button></div>
        <p class="sub">Al guardar podrás revisar la lista de tomos.</p>`;
      nota = 'encontrada';
    } else if (sagas.length) {
      html = `<select id="pvElegirSaga" aria-label="Elegir una saga guardada"><option value="">Sin saga</option>${
        [...sagas].sort((a, b) => a.nombre.localeCompare(b.nombre)).map(x => `<option value="${esc(x.id)}">${esc(x.nombre)}</option>`).join('')}</select>`;
    } else {
      html = '<p class="sub">Sin saga.</p>';
    }
    $('#pvSaga').innerHTML = html;
    $('#pvSagaNota').textContent = nota;
    const quitar = $('#pvQuitarSaga');
    if (quitar) quitar.onclick = () => { Object.assign(sel, { estado: 'hecho', sagaId: null, propuesta: null, num: '' }); pintarSaga(); };
    const menos = $('#pvMenos');
    if (menos) menos.onclick = () => { sel.num = Math.max(1, (Number(sel.num) || 1) - 1); pintarSaga(); };
    const mas = $('#pvMas');
    if (mas) mas.onclick = () => { sel.num = (Number(sel.num) || 0) + 1; pintarSaga(); };
    const elegir = $('#pvElegirSaga');
    if (elegir) elegir.onchange = () => { if (elegir.value) { Object.assign(sel, { sagaId: elegir.value, num: '' }); pintarSaga(); } };
  }

  async function buscarSaga() {
    if (!d.titulo) { sel.estado = 'hecho'; pintarSaga(); return; }
    for (const s of sagas) {
      const e = s.libros.find(e => mismoTitulo(e.titulo, d.titulo));
      if (e) { Object.assign(sel, { estado: 'hecho', sagaId: s.id, num: e.num }); pintarSaga(); return; }
    }
    let propuesta = null;
    try { propuesta = await descubrirSaga({ titulo: d.titulo, autor: d.autor || '' }); } catch (err) { console.warn(err); }
    if (previewActual !== token || sel.estado !== 'buscando') return;
    Object.assign(sel, { estado: 'hecho', propuesta });
    pintarSaga();
  }

  document.querySelectorAll('#pvTengo button, #pvLectura button').forEach(b => b.onclick = () => {
    b.parentElement.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
  });
  document.querySelectorAll('#pvChipsUbicacion button').forEach(b => b.onclick = () => {
    $('#pvUbicacion').value = b.dataset.ubicacionPreview;
    document.querySelectorAll('#pvChipsUbicacion button').forEach(x => x.classList.toggle('active', x === b));
  });

  $('#pvAnadir').onclick = () => {
    const titulo = $('#pvTitulo').value.trim();
    if (!titulo) { toast('Falta el título'); return; }
    const isbn = limpiarIsbn($('#pvIsbn').value);
    if (isbn && !isbnValido(isbn)) { toast('Ese ISBN no parece válido: revisa los números'); return; }
    const lectura = $('#pvLectura .active').dataset.valor;
    const l = normalizarLibro({
      ...d, id: uid(), isbn, titulo, autor: $('#pvAutor').value.trim(),
      tengo: $('#pvTengo .active').dataset.valor === 'true', lectura,
      ubicacion: $('#pvUbicacion').value.trim(),
      alta: ahora(), fin: lectura === 'leido' ? ahora().slice(0, 10) : ''
    });

    let revisar = null;
    const s = sel.sagaId ? sagaPorId(sel.sagaId) : null;
    if (s) { vincular(l, s, sel.num); l.saga_buscada = true; }
    else if (sel.propuesta) { l.saga_buscada = true; revisar = sel.propuesta; }
    else if (sel.estado === 'hecho') l.saga_buscada = true;
    const seguiaBuscando = sel.estado === 'buscando';
    previewActual = null;

    guardarLibro(l);
    cerrarModal();
    $('#resultados').innerHTML = '';
    $('#inputIsbn').value = '';
    if (navigator.vibrate) navigator.vibrate([20, 40, 20]);
    toast('✅ «' + esc(l.titulo) + '» guardado');
    // Una saga descubierta fuera siempre la revisa el usuario antes de guardarla
    if (revisar) setTimeout(() => abrirEditorSaga(revisar, l), 400);
    else if (l.saga_id) setTimeout(() => avisarSaga(l, false), 400);
    else if (seguiaBuscando) setTimeout(() => comprobarSaga(l, false), 400);
  };

  pintarSaga();
  buscarSaga();
}
```

- [ ] **Step 2: Comprobar y commit**

Run: `node --check script.js`
Expected: sin salida.

```bash
git add script.js
git commit -m "Añadir: ficha en tres pasos con la saga detectada antes de guardar"
```

---

### Task 11: Pantalla Actividad (`script.js`)

**Files:**
- Modify: `script.js` (funciones nuevas antes de `// ── AJUSTES`; `renderTodo`)

- [ ] **Step 1: Render de Actividad**

Justo antes de `// ── AJUSTES`:

```js
// ── ACTIVIDAD ───────────────────────────────

function filaReparto(nombre, n, max) {
  return `<div class="fila-reparto"><span>${esc(nombre)}</span><b>${n}</b>
    <div class="barra"><div style="width:${Math.round(n / max * 100)}%"></div></div></div>`;
}

function renderActividad() {
  const hoy = new Date();
  const anio = hoy.getFullYear();
  const leidosTotal = libros.filter(l => l.lectura === 'leido').length;
  const enCasa = libros.filter(l => l.tengo).length;
  const delAnio = leidosDelAnio(libros, anio).length;
  const meta = Number(reto[anio]) || 0;
  const autor = autorMasLeido(libros);
  const completas = sagas.filter(s => progresoSaga(s).faltanTener === 0).length;
  const meses = porMes(libros, anio);
  const maxMes = Math.max(1, ...meses);
  const rep = reparto(libros);
  const maxRep = Math.max(1, rep.prestados, ...rep.ubicaciones.map(u => u.n));
  const nombre = config.perfil ? nombrePerfil(config.perfil) : 'Tu biblioteca';

  let cuerpoReto;
  if (meta) {
    const r = ritmo(delAnio, meta, hoy);
    cuerpoReto = `<div class="reto-cab"><h3>Mi reto de ${anio}</h3><span>${delAnio} de ${meta} libros</span></div>
      <div class="barra${r.cumplido ? ' completa' : ''}"><div style="width:${Math.min(100, Math.round(delAnio / meta * 100))}%"></div></div>
      <p class="sub">${esc(textoRitmo(r))}</p>`;
  } else {
    cuerpoReto = `<div class="reto-cab"><h3>Mi reto de ${anio}</h3></div>
      <p class="sub">¿Cuántos libros quieres leer este año? Llevas ${delAnio}.</p>`;
  }

  $('#panelActividad').innerHTML = `
    <div class="perfil-act">
      <div class="avatar grande">${config.perfil ? esc(nombre[0]) : ic('person')}</div>
      <div>
        <h2>${esc(nombre)}</h2>
        <p class="sub">${leidosTotal === 1 ? '1 libro leído' : leidosTotal + ' libros leídos'} · ${enCasa} en casa</p>
      </div>
    </div>

    <section class="reto">
      ${cuerpoReto}
      <button class="btn-borde" id="retoBoton" aria-expanded="false">${meta ? 'Cambiar meta' : 'Elegir meta'}</button>
      <div class="selector-meta" id="retoSelector" hidden>
        <div class="grande">
          <button id="retoMenos" aria-label="Un libro menos">−</button>
          <output id="retoValor">${meta || 12}</output>
          <button id="retoMas" aria-label="Un libro más">+</button>
        </div>
        <input type="range" id="retoRango" min="1" max="100" value="${meta || 12}" aria-label="Libros que quieres leer en ${anio}">
        <div class="marcas"><span>1</span><span>25</span><span>50</span><span>75</span><span>100</span></div>
        <button class="btn" id="retoGuardar">Guardar meta</button>
      </div>
    </section>

    <div class="cifras-act">
      <div class="cifra-act"><small>Páginas leídas</small><b>${paginasDelAnio(libros, anio).toLocaleString('es-ES')}</b><span>en ${anio}</span></div>
      <div class="cifra-act"><small>Este año</small><b>${delAnio}</b><span>${delAnio === 1 ? 'libro leído' : 'libros leídos'}</span></div>
      <div class="cifra-act"><small>Autor más leído</small><b>${autor ? esc(autor.autor) : '—'}</b><span>${autor ? (autor.n === 1 ? '1 libro' : autor.n + ' libros') : 'aún ninguno'}</span></div>
      <div class="cifra-act"><small>Sagas completas</small><b>${completas} de ${sagas.length}</b><span>con todos los tomos</span></div>
    </div>

    <section class="bloque-act">
      <div class="titulo-seccion"><h2>Libros por mes</h2><span>${anio}</span></div>
      <div class="grafico" role="img" aria-label="Libros terminados cada mes de ${anio}: ${meses.join(', ')}">
        ${meses.map((n, i) => `<div class="mes${i > hoy.getMonth() ? ' futuro' : ''}${i === hoy.getMonth() ? ' actual' : ''}">
          <span class="n">${n || ''}</span><i style="height:${Math.round(n / maxMes * 100)}%"></i><span class="m">${MESES_CORTOS[i]}</span>
        </div>`).join('')}
      </div>
    </section>

    <section class="bloque-act">
      <div class="titulo-seccion"><h2>Dónde están tus libros</h2><span>${enCasa} en casa</span></div>
      ${rep.ubicaciones.length || rep.prestados ? `<div class="reparto">
        ${rep.ubicaciones.map(u => filaReparto(u.nombre, u.n, maxRep)).join('')}
        ${rep.prestados ? filaReparto('Prestados', rep.prestados, maxRep) : ''}
      </div>` : '<p class="sub">Cuando añadas libros con su balda, aquí verás cómo se reparten.</p>'}
    </section>`;

  const boton = $('#retoBoton'), selector = $('#retoSelector'), rango = $('#retoRango'), valor = $('#retoValor');
  const poner = v => { v = Math.min(100, Math.max(1, v)); rango.value = v; valor.textContent = v; };
  boton.onclick = () => { selector.hidden = !selector.hidden; boton.setAttribute('aria-expanded', String(!selector.hidden)); };
  rango.oninput = () => poner(Number(rango.value));
  $('#retoMenos').onclick = () => poner(Number(rango.value) - 1);
  $('#retoMas').onclick = () => poner(Number(rango.value) + 1);
  $('#retoGuardar').onclick = () => {
    const nueva = Number(rango.value);
    guardarMeta(anio, nueva);
    toast('🎯 Tu meta de ' + anio + ': ' + nueva + (nueva === 1 ? ' libro' : ' libros'));
  };
}
```

- [ ] **Step 2: Pintarla con lo demás**

Sustituir `renderTodo`:

```js
function renderTodo() {
  renderBiblioteca();
  renderSagas();
  renderActividad();
  pintarSync();
  pintarAvatar();
}
```

- [ ] **Step 3: Comprobar y commit**

Run: `node --check script.js && node --test tests/`
Expected: sin errores; `# fail 0`.

```bash
git add script.js
git commit -m "Actividad: reto con barra para elegir la meta, cifras, libros por mes y reparto en casa"
```

---

### Task 12: Caché, manifiesto y README

**Files:**
- Modify: `sw.js` (`APP_SHELL`), `manifest.json` (colores), `README.md`

- [ ] **Step 1: `sw.js`**

```js
const APP_SHELL = ['./', './index.html', './style.css', './cielo.js', './sagas.js', './actividad.js', './script.js', './manifest.json', './icons/icon.svg'];
```

- [ ] **Step 2: `manifest.json`**

```json
  "background_color": "#120f1c",
  "theme_color": "#120f1c",
```

- [ ] **Step 3: `README.md`**

En la tabla de ficheros, sustituir las filas por:

```markdown
| `index.html` | Las pantallas: Biblioteca, Sagas, Añadir, Actividad y Perfil/Ajustes |
| `script.js` | Datos, sincronización, perfiles, escáner e interfaz |
| `sagas.js` | Detección de sagas (Wikidata + Open Library) |
| `actividad.js` | Cálculos de Actividad y del reto anual (funciones puras) |
| `cielo.js` | Fondo animado de constelaciones |
| `style.css` | Diseño: temas noche y pergamino |
| `sw.js` | Service worker: funciona sin conexión |
| `apps-script/Code.gs` | Backend. Se pega en el editor de Apps Script |
| `tests/` | Pruebas: `node --test tests/` |
```

Tras el párrafo «Si `URL_SCRIPT` se deja vacía…», añadir:

```markdown
**Reto anual:** cada perfil elige su meta de libros del año en Actividad. Se guarda en
la propiedad del script `RETO_{perfil}`; no hay que crearla a mano.
```

Antes de «## Probar en local», añadir:

```markdown
## Aspecto

Dos temas: **noche** (por defecto) y **pergamino**, más **Automático** según el modo
oscuro del móvil (Perfil y ajustes → Aspecto). Los colores son variables en `:root` de
`style.css`; el pergamino las redefine en `:root[data-tema="pergamino"]`.

El fondo de constelaciones (`cielo.js`) es un canvas fijo del tamaño de la pantalla:
cuesta lo mismo con 10 libros que con 500. Se para con una ficha abierta y con
«reducir movimiento».
```

- [ ] **Step 4: Commit**

```bash
git add sw.js manifest.json README.md
git commit -m "Caché de los ficheros nuevos, colores del manifiesto y README"
```

---

### Task 13: Verificación en Chromium

**Files:** ninguno del repo. Script en el directorio temporal (`$S` = scratchpad de la sesión).

- [ ] **Step 1: Servidor local**

Run (en segundo plano): `cd /home/user/bliblioteca-may && python3 -m http.server 8642`

- [ ] **Step 2: Script de prueba**

`$S/verificar.mjs`: carga la app con datos de ejemplo contra el `Code.gs` simulado (`tests/gas-simulado.js` por `createRequire`), recorre las pantallas en los dos temas y hace capturas.

```js
import { chromium } from 'playwright';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { crearBackend } = require('/home/user/bliblioteca-may/tests/gas-simulado.js');

const S = process.argv[2];
const b = crearBackend({ PIN_may: '0910' });
const hoy = new Date().toISOString().slice(0, 10);
const libros = [
  { id: 's1', titulo: 'Alas de sangre', autor: 'Rebecca Yarros', lectura: 'leido', fin: hoy.slice(0, 4) + '-02-10', paginas: 736, saga_id: 'emp', saga_num: 1, ubicacion: 'Salón · balda 2', valoracion: 5 },
  { id: 's2', titulo: 'Alas de hierro', autor: 'Rebecca Yarros', lectura: 'leido', fin: hoy.slice(0, 4) + '-07-03', paginas: 880, saga_id: 'emp', saga_num: 2, ubicacion: 'Salón · balda 2' },
  { id: 's3', titulo: 'Alas de ónix', autor: 'Rebecca Yarros', lectura: 'leyendo', pagina: 556, paginas: 896, saga_id: 'emp', saga_num: 3, ubicacion: 'Dormitorio · mesilla' },
  { id: 'i1', titulo: 'Indira', autor: 'Santiago Díaz', lectura: 'leido', fin: hoy.slice(0, 4) + '-07-20', prestado_a: 'Laura' },
  { id: 'c1', titulo: 'La Biblia de los Caídos', autor: 'Fernando Trujillo', paginas: 624, ubicacion: 'Dormitorio · mesilla' },
  { id: 'w1', titulo: 'Circe', autor: 'Madeline Miller', tengo: false }
].map(l => ({ tengo: true, lectura: 'pendiente', actualizado: '2026', ...l }));
const sagas = [{ id: 'emp', nombre: 'Empíreo', autor: 'Rebecca Yarros', fuente: 'manual',
  libros: [1, 2, 3, 4, 5].map(n => ({ titulo: ['Alas de sangre', 'Alas de hierro', 'Alas de ónix', 'Tomo 4', 'Tomo 5'][n - 1], num: n })), actualizado: '2026' }];

const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await nav.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await ctx.route(/openlibrary|wikidata|googleapis\.com\/books/, r => r.abort());
await ctx.route('https://script.google.com/**', async r => {
  const req = r.request(), u = new URL(req.url());
  const t = req.method() === 'POST' ? b.ctx.doPost({ postData: { contents: req.postData() } }).t : b.ctx.doGet({ parameter: Object.fromEntries(u.searchParams) }).t;
  r.fulfill({ contentType: 'application/json', body: t });
});
const p = await ctx.newPage();
const errores = [];
p.on('pageerror', e => errores.push(e.message));
p.on('dialog', d => d.accept());
await p.addInitScript(([l, s]) => {
  if (localStorage.getItem('init')) return;
  localStorage.setItem('init', '1');
  localStorage.setItem('mb_libros', JSON.stringify(l));
  localStorage.setItem('mb_sagas', JSON.stringify(s));
  localStorage.setItem('mb_config', JSON.stringify({ url: 'https://script.google.com/macros/s/X/exec' }));
}, [libros, sagas]);
await p.goto('http://localhost:8642/');
await p.waitForTimeout(1500);

// Entrar como May: pasa los libros sin perfil a su perfil
await p.click('#avatar');
await p.selectOption('#cfgPerfil', 'may');
await p.fill('#cfgPin', '0910');
await p.click('#formPerfil button');
await p.waitForTimeout(1200);
console.log('perfil:', await p.textContent('#perfilActual'), '| hoja LIBROS_may:', b.hojas.LIBROS_may.filas.length - 1, 'libros');

for (const tema of ['noche', 'pergamino']) {
  await p.click('#avatar');
  await p.click(`#selectorTema [data-tema="${tema}"]`);
  for (const [pantalla, nombre] of [['screenBiblioteca', 'biblioteca'], ['screenSagas', 'sagas'], ['screenAnadir', 'anadir'], ['screenActividad', 'actividad']]) {
    await p.click(`nav.bottom [data-screen="${pantalla}"]`);
    await p.waitForTimeout(400);
    await p.screenshot({ path: `${S}/${tema}-${nombre}.png`, fullPage: true });
  }
}

// Reto: elegir meta 20 y comprobar que llega a la hoja
await p.click('nav.bottom [data-screen="screenActividad"]');
await p.click('#retoBoton');
await p.fill('#retoRango', '20');
await p.click('#retoGuardar');
await p.waitForTimeout(800);
console.log('reto en la hoja:', b.props.RETO_may, '| texto:', await p.textContent('.reto .reto-cab span'));

// Lo quiero desde un hueco de saga
await p.click('nav.bottom [data-screen="screenSagas"]');
await p.click('[data-quiero-tomo]');
await p.waitForTimeout(300);
console.log('tomo 4 en deseos:', await p.evaluate(() => libros.some(l => l.titulo === 'Tomo 4' && !l.tengo)));

// Añadir a mano un tomo de una saga guardada: se detecta sola
await p.click('nav.bottom [data-screen="screenAnadir"]');
await p.evaluate(() => abrirPreview({ titulo: 'Tomo 5', autor: 'Rebecca Yarros' }));
await p.waitForTimeout(300);
console.log('paso saga:', await p.textContent('#pvSaga'));
await p.screenshot({ path: `${S}/ficha-anadir.png` });
await p.click('#pvAnadir');
await p.waitForTimeout(600);
console.log('Tomo 5 vinculado:', await p.evaluate(() => { const l = libros.find(x => x.titulo === 'Tomo 5' && x.tengo); return l && l.saga_id + '#' + l.saga_num; }));

// Fluidez del fondo con la lista en pantalla
await p.click('nav.bottom [data-screen="screenBiblioteca"]');
const fps = await p.evaluate(() => new Promise(res => { let n = 0; const t0 = performance.now();
  (function f(t) { n++; scrollBy(0, 3); if (t - t0 < 2000) requestAnimationFrame(f); else res(Math.round(n * 1000 / (t - t0))); })(t0); }));
console.log('fps:', fps);
console.log('errores JS:', errores.length ? errores : 'ninguno');
await nav.close();
```

- [ ] **Step 3: Ejecutar**

Run: `cd $S && ln -sfn $(npm root -g)/playwright node_modules/playwright; node verificar.mjs $S`
Expected:
- `perfil: May | hoja LIBROS_may: 6 libros`
- `reto en la hoja: {"2026":20}` (el año actual) y texto `N de 20 libros`
- `tomo 4 en deseos: true`
- `paso saga:` contiene `Empíreo` y `Número de tomo`
- `Tomo 5 vinculado: emp#5`
- `fps:` 50 o más
- `errores JS: ninguno`

- [ ] **Step 4: Revisar las capturas**

Abrir las ocho capturas (`noche-*.png`, `pergamino-*.png`) y `ficha-anadir.png`. Comprobar: texto legible sobre el fondo en los dos temas, nada cortado ni superpuesto, barra inferior sin tapar contenido, tomos que faltan como hueco punteado. Corregir lo que se vea mal en `style.css` y volver al Step 3 una vez.

- [ ] **Step 5: Compatibilidad con el `Code.gs` actual**

Repetir la prueba del reto contra un backend que no conoce `guardarReto`. Crear `$S/antiguo.mjs` copiando `verificar.mjs` y, justo después de `const b = crearBackend(...)`, añadir:

```js
const postOriginal = b.ctx.doPost;
b.ctx.doPost = e => JSON.parse(e.postData.contents).accion === 'guardarReto'
  ? { t: JSON.stringify({ ok: false, error: 'accion desconocida' }) }
  : postOriginal(e);
```

Y tras guardar la meta:

```js
console.log('cola tras guardarReto antiguo:', await p.evaluate(() => cola.length));
```

Expected: `cola tras guardarReto antiguo: 0` y ningún error JS.

- [ ] **Step 6: Pruebas y parar el servidor**

Run: `node --test /home/user/bliblioteca-may/tests/`
Expected: `# fail 0`.

---

### Task 14: PR y despliegue

- [ ] **Step 1: Subir la rama**

```bash
git push -u origin claude/biblioteca-cocina-sync-e76l6l
```

- [ ] **Step 2: Abrir el PR** (sin fusionar)

Título: «Rediseño Noche: temas, constelaciones, Actividad y reto anual». Cuerpo: qué cambia por pantalla, el orden de despliegue y las pruebas de la Task 13 con sus resultados.

- [ ] **Step 3: Instrucciones al usuario**

1. Pegar el `apps-script/Code.gs` nuevo en Apps Script y guardar.
2. Implementar → **Nueva implementación** → copiar la URL `/exec`.
3. Pasar la URL: se cambia `URL_SCRIPT` en `script.js` (commit en el mismo PR) y se fusiona.
4. Cada móvil entra con su PIN una vez más solo si la sesión caduca; los datos no cambian.
