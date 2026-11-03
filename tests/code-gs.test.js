// Pruebas del backend (Code.gs) con Google simulado: node --test tests/*.test.js
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

test('perfiles devuelve los nombres para mostrar (NOMBRE_) y todo el del perfil', () => {
  const b = crearBackend({ PIN_ana: '1234', PIN_isabelbosch: '1', NOMBRE_isabelbosch: ' Isabel Bosch ', NOMBRE_fantasma: 'Sin PIN' });
  const r = b.get({ accion: 'perfiles' });
  assert.deepEqual(r.perfiles, ['ana', 'isabelbosch']);
  assert.deepEqual(r.nombres, { isabelbosch: 'Isabel Bosch' });
  const clave = b.get({ accion: 'entrar', perfil: 'isabelbosch', pin: '1' }).clave;
  assert.equal(b.get({ accion: 'todo', perfil: 'isabelbosch', clave }).nombre, 'Isabel Bosch');
  const claveAna = b.get({ accion: 'entrar', perfil: 'ana', pin: '1234' }).clave;
  assert.equal(b.get({ accion: 'todo', perfil: 'ana', clave: claveAna }).nombre, '');
});

// Retos de todos: solo el número de leídos del año y la meta
function conLibros() {
  const b = crearBackend({ PIN_ana: '1', PIN_luis: '2', PIN_eva: '3', NOMBRE_luis: 'Luis Gómez' });
  const k = {};
  for (const [p, pin] of [['ana', '1'], ['luis', '2'], ['eva', '3']]) k[p] = { perfil: p, clave: b.get({ accion: 'entrar', perfil: p, pin }).clave };
  const libro = (id, lectura, fin) => ({ id, titulo: 'L' + id, lectura, fin });
  b.post({ accion: 'subirTodo', libros: [libro('a1', 'leido', '2026-02-01'), libro('a2', 'leido', '2026-09-30'), libro('a3', 'leido', '2025-12-31'), libro('a4', 'leyendo', '')], sagas: [], ...k.ana });
  b.post({ accion: 'subirTodo', libros: [libro('l1', 'leido', '2026-05-05')], sagas: [], ...k.luis });
  b.post({ accion: 'guardarReto', anio: '2026', meta: 20, ...k.ana });
  return { b, k };
}

test('retos: leídos del año y meta de cada perfil, nada más', () => {
  const { b, k } = conLibros();
  const r = b.get({ accion: 'retos', anio: '2026', ...k.luis });
  assert.equal(r.ok, true);
  assert.deepEqual(r.retos.map(x => [x.perfil, x.leidos, x.meta, x.nombre]),
    [['ana', 2, 20, ''], ['eva', 0, 0, ''], ['luis', 1, 0, 'Luis Gómez']]);
  assert.deepEqual(Object.keys(r.retos[0]).sort(), ['leidos', 'meta', 'nombre', 'oculto', 'perfil']);
  // eva no ha guardado nada: no se le crea la pestaña
  assert.equal(b.hojas.LIBROS_eva, undefined);
});

test('retos: quien oculta su reto no sale para los demás, pero sí para sí mismo', () => {
  const { b, k } = conLibros();
  assert.deepEqual(b.post({ accion: 'guardarVisible', visible: false, ...k.ana }), { ok: true });
  assert.equal(b.get({ accion: 'todo', ...k.ana }).visible, false);
  assert.deepEqual(b.get({ accion: 'retos', anio: '2026', ...k.luis }).retos.map(x => x.perfil), ['eva', 'luis']);
  const propio = b.get({ accion: 'retos', anio: '2026', ...k.ana }).retos.find(x => x.perfil === 'ana');
  assert.equal(propio.oculto, true);
  b.post({ accion: 'guardarVisible', visible: true, ...k.ana });
  assert.equal(b.get({ accion: 'todo', ...k.ana }).visible, true);
  assert.equal(b.get({ accion: 'retos', anio: '2026', ...k.luis }).retos.length, 3);
});

test('retos: sin clave o con un año raro se rechaza', () => {
  const { b, k } = conLibros();
  assert.deepEqual(b.get({ accion: 'retos', anio: '2026', perfil: 'ana', clave: 'x' }), { ok: false, error: 'clave' });
  assert.deepEqual(b.get({ accion: 'retos', anio: '26', ...k.ana }), { ok: false, error: 'anio' });
});
