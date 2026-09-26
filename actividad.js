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
