// Pruebas de la búsqueda en la Biblioteca Nacional (Code.gs, sin red): node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { crearBackend } = require('./gas-simulado.js');

// Registro con el aspecto de los datos abiertos de la BNE (ISBN con guiones)
const godOfMalice = {
  id: 'a1234567',
  isbn: '979-13-87924-71-3',
  titulo: 'God of malice : un dark romance universitario / Rina Kent',
  mencion_de_autores: 'Rina Kent ; traducción de Fulana de Tal',
  autores: 'Kent, Rina (1990-) /**/ Tal, Fulana de',
  editorial: 'Barcelona : Montena, 2025',
  fecha_de_publicacion: '2025',
  extension: '528 p. ; 23 cm'
};

function preparar(registros) {
  const b = crearBackend({ PIN_ana: '1234' });
  const clave = b.get({ accion: 'entrar', perfil: 'ana', pin: '1234' }).clave;
  b.urls = [];
  b.ctx.UrlFetchApp.fetch = url => {
    b.urls.push(url);
    const q = decodeURIComponent(url.split('isbn=')[1]).split(' OR ').map(f => f.replace(/^"|"$/g, ''));
    assert.ok(decodeURIComponent(url).split('isbn=')[1].split(' OR ').every(f => /^".+"$/.test(f)), 'cada forma entre comillas');
    // La API devuelve los registros cuyo ISBN contiene alguna de las formas
    const data = registros.filter(r => q.some(f => r.isbn.includes(f)));
    return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ success: true, data }) };
  };
  b.bne = isbn => b.get({ accion: 'bne', isbn, perfil: 'ana', clave });
  return b;
}

test('encuentra un 979-13 guardado con guiones y limpia los campos', () => {
  const b = preparar([godOfMalice]);
  const r = b.bne('9791387924713');
  assert.equal(r.ok, true);
  assert.deepEqual(r.libro, {
    titulo: 'God of malice. un dark romance universitario', autor: 'Rina Kent',
    editorial: 'Montena', anio: '2025', paginas: 528
  });
  assert.equal(b.urls.length, 1);
});

test('un 978-84 viejo guardado solo con el ISBN de 10 cifras', () => {
  const b = preparar([{ isbn: '84-7888-445-9', titulo: 'Harry Potter y la piedra filosofal', autores: 'Rowling, J. K., 1965-', editorial: 'Salamandra', fecha_de_publicacion: '1999', extension: '254 p.' }]);
  const r = b.bne('9788478884452');
  assert.equal(r.libro.titulo, 'Harry Potter y la piedra filosofal');
  assert.equal(r.libro.autor, 'J. K. Rowling');
  assert.equal(r.libro.paginas, 254);
});

test('no se queda con otro libro cuyo ISBN solo se parece', () => {
  const b = preparar([{ ...godOfMalice, isbn: '979-13-87924-71-35' }, { ...godOfMalice, isbn: '979-13-87924-72-1', titulo: 'Otro' }]);
  // El primero contiene el ISBN entero, así que cuenta; el segundo no
  assert.equal(b.bne('9791387924713').libro.titulo, 'God of malice. un dark romance universitario');
  assert.deepEqual(preparar([{ ...godOfMalice, isbn: '979-13-87924-72-1' }]).bne('9791387924713'), { ok: true, libro: null });
});

test('ISBN no válido o error de la BNE: responde sin romperse', () => {
  const b = preparar([]);
  assert.deepEqual(b.bne('123'), { ok: false, error: 'isbn' });
  b.ctx.UrlFetchApp.fetch = () => ({ getResponseCode: () => 503, getContentText: () => '' });
  assert.deepEqual(b.bne('9791387924713'), { ok: false, error: 'http 503' });
  b.ctx.UrlFetchApp.fetch = () => { throw new Error('timeout'); };
  assert.deepEqual(b.bne('9791387924713'), { ok: false, error: 'red' });
});

test('formasIsbn: todos los cortes con guiones y el ISBN de 10', () => {
  const { ctx } = crearBackend({});
  const f = ctx.formasIsbn('9788478884452');
  assert.equal(f.i10, '8478884459');
  assert.ok(f.todas.includes('978-84-7888-445-2'));
  assert.ok(f.todas.includes('84-7888-445-9'));
  assert.equal(ctx.formasIsbn('8478884459').i13, '9788478884452');
  // Fuera de España solo las formas sin guiones
  assert.deepEqual([...ctx.formasIsbn('9780747532743').todas], ['9780747532743', '0747532745']);
});
