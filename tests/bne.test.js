// Pruebas de la búsqueda en la Biblioteca Nacional (Code.gs, sin red): node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { crearBackend } = require('./gas-simulado.js');

const campo = (tag, subs, ind2 = ' ') =>
  `<datafield tag="${tag}" ind1=" " ind2="${ind2}">` +
  subs.map(([c, v]) => `<subfield code="${c}">${v}</subfield>`).join('') + '</datafield>';

// Respuesta SRU como la del catálogo de la BNE (srw + MARCXML)
const sru = (...registros) => `<?xml version="1.0" encoding="UTF-8"?>
<searchRetrieveResponse xmlns="http://www.loc.gov/zing/srw/"><version>1.2</version>
<numberOfRecords>${registros.length}</numberOfRecords><records>` +
  registros.map((r, i) => `<record><recordSchema>marcxml</recordSchema><recordPacking>xml</recordPacking><recordData>
<record xmlns="http://www.loc.gov/MARC21/slim"><leader>00000cam a2200000 i 4500</leader>
<controlfield tag="001">99100000${i}</controlfield>${r.join('')}</record></recordData>
<recordPosition>${i + 1}</recordPosition></record>`).join('') + '</records></searchRetrieveResponse>';

const godOfMalice = [
  campo('020', [['a', '9791387924713'], ['q', '(tapa dura)']]),
  campo('100', [['a', 'Kent, Rina,'], ['e', 'autor']]),
  campo('245', [['a', 'God of malice :'], ['b', 'un dark romance universitario /'], ['c', 'Rina Kent ; traducción de Fulana de Tal']]),
  campo('264', [['a', 'Barcelona :'], ['b', 'Montena,'], ['c', '2025']], '1'),
  campo('300', [['a', '528 páginas ;'], ['c', '23 cm']]),
  campo('490', [['a', 'Legado de dioses ;'], ['v', '1']]),
  campo('700', [['a', 'Tal, Fulana de,'], ['e', 'traductor']])
];

function preparar(xml, codigo = 200) {
  const b = crearBackend({ PIN_ana: '1234' });
  const clave = b.get({ accion: 'entrar', perfil: 'ana', pin: '1234' }).clave;
  b.urls = [];
  b.ctx.UrlFetchApp.fetch = url => { b.urls.push(url); return { getResponseCode: () => codigo, getContentText: () => xml }; };
  b.bne = isbn => b.get({ accion: 'bne', isbn, perfil: 'ana', clave });
  return b;
}

test('God of Malice: título, autor, editorial, año y páginas del MARC', () => {
  const b = preparar(sru(godOfMalice));
  assert.deepEqual(b.bne('979-13-87924-71-3').libro, {
    titulo: 'God of malice', autor: 'Rina Kent', editorial: 'Montena', anio: '2025', paginas: 528
  });
  assert.equal(b.urls.length, 1);
  assert.ok(b.urls[0].startsWith('https://catalogo.bne.es/view/sru/34BNE_INST?'));
  assert.ok(decodeURIComponent(b.urls[0]).includes('query=alma.isbn="9791387924713"'));
});

test('libro antiguo con 260, iniciales y entidades XML', () => {
  const b = preparar(sru([
    campo('020', [['a', '84-7888-445-9']]),
    campo('100', [['a', 'Rowling, J. K.']]),
    campo('245', [['a', 'Harry Potter y la piedra filosofal /'], ['c', 'J.K. Rowling']]),
    campo('260', [['a', 'Barcelona :'], ['b', 'Salamandra &amp; Cía,'], ['c', '[1999]']]),
    campo('300', [['a', '254 p. ;'], ['c', '21 cm']])
  ]));
  assert.deepEqual(b.bne('8478884459').libro, {
    titulo: 'Harry Potter y la piedra filosofal', autor: 'J. K. Rowling', editorial: 'Salamandra & Cía', anio: '1999', paginas: 254
  });
});

test('manga: número de tomo en 245 $n; sin 100 usa el 700 que no es traductor', () => {
  const b = preparar(sru([
    campo('020', [['a', '9788467917885']]),
    campo('245', [['a', 'Ataque a los titanes.'], ['n', '1 /'], ['c', 'Hajime Isayama']]),
    campo('264', [['b', 'Norma Editorial'], ['c', '2012']], '1'),
    campo('700', [['a', 'Pérez, Marc,'], ['e', 'traductor']]),
    campo('700', [['a', 'Isayama, Hajime'], ['e', 'autor']])
  ]));
  const l = b.bne('9788467917885').libro;
  assert.equal(l.titulo, 'Ataque a los titanes. 1');
  assert.equal(l.autor, 'Hajime Isayama');
  assert.equal(l.paginas, '');
});

test('si llegan varios, se queda con el de este ISBN', () => {
  const otro = [campo('020', [['a', '9788400000000']]), campo('245', [['a', 'Otro libro']])];
  assert.equal(preparar(sru(otro, godOfMalice)).bne('9791387924713').libro.titulo, 'God of malice');
});

test('sin resultados, ISBN no válido o error de la BNE: responde sin romperse', () => {
  assert.deepEqual(preparar(sru()).bne('9791387924713'), { ok: true, libro: null });
  assert.deepEqual(preparar('').bne('123'), { ok: false, error: 'isbn' });
  assert.deepEqual(preparar('', 503).bne('9791387924713'), { ok: false, error: 'http 503' });
  const b = preparar('');
  b.ctx.UrlFetchApp.fetch = () => { throw new Error('timeout'); };
  assert.deepEqual(b.bne('9791387924713'), { ok: false, error: 'red' });
});
