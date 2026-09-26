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
