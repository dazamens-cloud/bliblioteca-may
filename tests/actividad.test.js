// Pruebas de actividad.js: node --test tests/*.test.js
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
