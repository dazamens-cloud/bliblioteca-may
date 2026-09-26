// Pruebas de la detección de sagas (sin red): node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../sagas.js');
const { descubrirSaga } = S;

// Lo que devuelve Open Library para "Ataque a los titanes" (resumido de un caso real)
const d = (title, year, author = 'Hajime Isayama') => ({ title, first_publish_year: year, author_name: [author] });
const docsTitanes = [
  d('Ataque a los titanes 1', 2012, '諫山創'), d('ATAQUE A LOS TITANES 01', 2016),
  d('Ataque a los titanes 2', 2012), d('Ataque a los titanes 4', 2013), d('Ataque a los titanes 3', 2013),
  d('Ataque a los titanes 05', 2013), d('ATAQUE A LOS TITANES 34', 2021),
  d('Ataque a los titanes. Antes de la caída 1', 2014), d('Ataque a los titanes antes de la caída 16', 2019),
  d('Ataque a los titanes. Antes de la caída 16', 2019)
];

test('nombreBaseSaga quita el número del final', () => {
  assert.equal(S.nombreBaseSaga('Ataque a los titanes 1'), 'Ataque a los titanes');
  assert.equal(S.nombreBaseSaga('Ataque a los titanes, vol. 3'), 'Ataque a los titanes');
  assert.equal(S.nombreBaseSaga('Harry Potter y la piedra filosofal'), 'Harry Potter y la piedra filosofal');
  assert.equal(S.nombreBaseSaga('La Biblia de los Caídos. Tomo 1 del testamento del Gris'), 'La Biblia de los Caídos');
});

test('manga: un tomo por número, ordenados por número, con el nombre de la saga', () => {
  const r = S.agruparTomosOL(docsTitanes, 'Ataque a los titanes', '', true);
  const principal = r.libros.filter(x => x.incluir);
  assert.deepEqual(principal.map(x => x.num), [1, 2, 3, 4, 5, 34]);
  assert.deepEqual(principal.map(x => x.titulo).slice(0, 2), ['Ataque a los titanes 1', 'Ataque a los titanes 2']);
});

test('manga: el spin-off va aparte, sin marcar y sin repetidos', () => {
  const r = S.agruparTomosOL(docsTitanes, 'Ataque a los titanes', '', true);
  const extras = r.libros.filter(x => !x.incluir);
  assert.deepEqual(extras.map(x => x.titulo), ['Ataque a los titanes. Antes de la caída 1', 'Ataque a los titanes antes de la caída 16']);
  assert.ok(extras.every(x => x.num === ''));
});

test('autor: se prefiere el nombre en letras latinas', () => {
  assert.equal(S.agruparTomosOL(docsTitanes, 'Ataque a los titanes', '諫山創', true).autor, 'Hajime Isayama');
  assert.equal(S.autorLegible(['諫山創', 'Hajime Isayama', 'Isayama Hajime', 'Hajime Isayama']), 'Hajime Isayama');
  assert.equal(S.autorLegible(['諫山創']), '諫山創');
});

test('novelas con subtítulo tras el número: no se juntan por número (La Biblia de los Caídos)', () => {
  const docs = [
    d('La Biblia de los Caídos. Tomo 1 del testamento del Gris', 2014, 'Fernando Trujillo'),
    d('La Biblia de los Caídos. Tomo 1 del testamento de Sombra', 2014, 'Fernando Trujillo'),
    d('La Biblia de los Caídos. Tomo 2 del testamento del Gris', 2015, 'Fernando Trujillo')
  ];
  const r = S.agruparTomosOL(docs, 'La Biblia de los Caídos', 'Fernando Trujillo', true);
  assert.equal(r.libros.length, 3);
  assert.ok(r.libros.every(x => x.incluir));
  assert.deepEqual(r.libros.map(x => x.num), [1, 2, 3]);
});

test('sin saga confirmada y sin títulos numerados no hay saga (Cien años de soledad)', () => {
  const docs = [d('Cien años de soledad', 1967, 'Gabriel García Márquez'), d('Cien años de soledad: ensayos', 1990, 'Varios')];
  assert.deepEqual(S.agruparTomosOL(docs, 'Cien años de soledad', 'Gabriel García Márquez', false).libros, []);
});

test('wdNombre: una etiqueta en japonés cede ante otra en letras latinas', () => {
  assert.equal(S.wdNombre({ labels: { mul: { value: '諫山創' }, en: { value: 'Hajime Isayama' } } }), 'Hajime Isayama');
  assert.equal(S.wdNombre({ labels: { mul: { value: 'J. K. Rowling' } } }), 'J. K. Rowling');
  assert.equal(S.wdNombre({ labels: { es: { value: 'Harry Potter' }, en: { value: 'Harry Potter series' } } }), 'Harry Potter');
});

test('mismoTitulo: tomos con distinto número no son el mismo libro', () => {
  assert.equal(S.mismoTitulo('Ataque a los titanes 1', 'Ataque a los titanes 10'), false);
  assert.equal(S.mismoTitulo('Ataque a los titanes 10', 'ATAQUE A LOS TITANES 10'), true);
  assert.equal(S.mismoTitulo('Alas de ónix', 'Alas de ónix (Empíreo 3)'), true);
  assert.equal(S.mismoTitulo('Harry Potter y la cámara secreta', 'Harry Potter y la cámara secreta (edición ilustrada)'), true);
});

test('descubrirSaga: manga sin tomos en Wikidata → lista de Open Library limpia', async () => {
  const fetchReal = global.fetch;
  global.fetch = async url => ({
    ok: true, status: 200,
    json: async () => String(url).includes('wikidata') ? { search: [] } : { docs: docsTitanes }
  });
  try {
    const p = await descubrirSaga({ titulo: 'Ataque a los titanes 1', autor: '諫山創' });
    assert.equal(p.nombre, 'Ataque a los titanes');
    assert.equal(p.autor, 'Hajime Isayama');
    assert.equal(p.fuente, 'openlibrary');
    assert.equal(p.libros.filter(x => x.incluir).length, 6);
    assert.equal(p.libros.filter(x => !x.incluir).length, 2);
  } finally { global.fetch = fetchReal; }
});
