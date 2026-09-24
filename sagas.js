// =============================================
// sagas.js - Mi Biblioteca
// Descubre a qué saga pertenece un libro y qué otros libros tiene.
//
// Capas:
//   1. Wikidata     → sagas bien catalogadas (Harry Potter): lista completa y numerada
//   2. Open Library → sagas que Wikidata conoce pero sin libros enlazados
//                     (La Biblia de los Caídos): propuesta para que el usuario revise
// El resultado siempre se confirma a mano antes de guardarse.
// =============================================

const WD_API    = 'https://www.wikidata.org/w/api.php';
const OL_SEARCH = 'https://openlibrary.org/search.json';

// ── NORMALIZACIÓN ───────────────────────────

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ ]+/g, ' ')
    .replace(/^(la|el|los|las|the|un|una) /, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Dos títulos son "el mismo libro" si coinciden normalizados o uno contiene al otro
function mismoTitulo(a, b) {
  const x = norm(a), y = norm(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const corto = x.length < y.length ? x : y;
  const largo = x.length < y.length ? y : x;
  return corto.length >= 10 && largo.includes(corto);
}

// Mismo autor si comparten algún apellido/nombre de más de 3 letras
function mismoAutor(a, b) {
  if (!a || !b) return true; // sin dato no descartamos
  const ta = norm(a).split(' ').filter(t => t.length > 3);
  const tb = norm(b).split(' ').filter(t => t.length > 3);
  return ta.some(t => tb.includes(t));
}

// "La Biblia de los Caídos. Tomo 1 del testamento del Gris" → "La Biblia de los Caídos"
function nombreBaseSaga(titulo) {
  const partes = String(titulo || '').split(/\s*[.:(\-–—]\s+|\s*\(/);
  return (partes[0] || titulo).trim();
}

function numeroEnTitulo(titulo) {
  const m = norm(titulo).match(/(?:tomo|libro|volumen|vol|parte|n|numero)\s*(\d{1,3})\b/) ||
            norm(titulo).match(/\b(\d{1,2})$/);
  return m ? Number(m[1]) : null;
}

// fetch con tiempo máximo: Wikidata a veces tarda más de 10 s en responder
function fetchT(url, opciones, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms || 9000);
  return fetch(url, { ...(opciones || {}), signal: ctrl.signal }).finally(() => clearTimeout(t));
}

// ── WIKIDATA ────────────────────────────────
//
// Solo la API normal (www.wikidata.org/w/api.php), nada de SPARQL:
// el servicio SPARQL llegó a tardar 49 s en una consulta trivial (2026-09-24)
// mientras esta API respondía en 200 ms con los mismos datos.

const TIPOS_SERIE = ['Q1667921', 'Q277759', 'Q7725310']; // serie de novelas, de libros, de obras

async function wdApi(params) {
  const url = WD_API + '?' + new URLSearchParams({ ...params, format: 'json', origin: '*' });
  let r = await fetchT(url);
  if (r.status === 429) { await new Promise(ok => setTimeout(ok, 1500)); r = await fetchT(url); }
  if (!r.ok) throw new Error('Wikidata ' + r.status);
  return r.json();
}

async function wdBuscar(texto) {
  const d = await wdApi({ action: 'wbsearchentities', search: texto, language: 'es', uselang: 'es', type: 'item', limit: '7' });
  return (d.search || []).map(x => x.id);
}

// Entidades completas (declaraciones + etiquetas), de 50 en 50
async function wdEntidades(ids) {
  const res = {};
  const unicos = [...new Set(ids.filter(Boolean))];
  for (let i = 0; i < unicos.length; i += 50) {
    const d = await wdApi({ action: 'wbgetentities', ids: unicos.slice(i, i + 50).join('|'), props: 'claims|labels', languages: 'es|mul|en' });
    Object.assign(res, d.entities || {});
  }
  return res;
}

// 'mul' = etiqueta común a todos los idiomas: Wikidata ya no repite es/en en nombres propios
// (la serie Harry Potter y J. K. Rowling solo la tienen en 'mul')
const wdNombre = e => { const l = (e && e.labels) || {}; return (l.es || l.mul || l.en || {}).value || ''; };
const wdDecl   = (e, p) => ((e && e.claims && e.claims[p]) || []).filter(c => c.mainsnak.snaktype === 'value');
const wdIds    = (e, p) => wdDecl(e, p).map(c => c.mainsnak.datavalue.value.id).filter(Boolean);

// Devuelve { nombre, wikidata, autor } o null
async function wdSerieDe(libro) {
  const base = nombreBaseSaga(libro.titulo);
  const candidatos = await wdBuscar(libro.titulo);
  if (base !== libro.titulo) candidatos.push(...await wdBuscar(base));
  if (!candidatos.length) return null;

  const ents = await wdEntidades(candidatos);
  // Las ediciones (P629 "edición de") tienen la saga y el autor en la obra
  const obras = await wdEntidades(candidatos.flatMap(q => wdIds(ents[q], 'P629')));
  const filas = [];
  for (const q of new Set(candidatos)) {
    const e = ents[q];
    if (!e) continue;
    const obra = obras[wdIds(e, 'P629')[0]];
    const autor = wdIds(e, 'P50')[0] || wdIds(obra, 'P50')[0] || '';
    for (const serie of wdIds(e, 'P179')) filas.push({ via: 'obra', serie, autor });
    for (const serie of wdIds(obra, 'P179')) filas.push({ via: 'edicion', serie, autor });
    if (wdIds(e, 'P31').some(t => TIPOS_SERIE.includes(t))) filas.push({ via: 'serie', serie: q, autor });
  }
  if (!filas.length) return null;

  const nombres = await wdEntidades(filas.flatMap(f => [f.serie, f.autor]));
  const et = id => wdNombre(nombres[id]);

  for (const f of filas) {
    // Una obra sin autor (P50) es una película o un videojuego: fuera
    if (f.via !== 'serie' && !f.autor) continue;
    if (!mismoAutor(et(f.autor), libro.autor)) continue;
    if (f.via === 'serie' && !mismoTitulo(et(f.serie), base) && !mismoTitulo(et(f.serie), libro.titulo)) continue;
    return { nombre: et(f.serie) || base, wikidata: f.serie, autor: et(f.autor) || libro.autor };
  }
  return null;
}

// Libros de una serie de Wikidata → { principal: [...], extras: [...] }
async function wdLibrosDe(serieId) {
  const d = await wdApi({ action: 'query', list: 'search', srsearch: 'haswbstatement:P179=' + serieId, srnamespace: '0', srlimit: '100' });
  const ents = await wdEntidades((d.query && d.query.search || []).map(x => x.title));

  const todos = [];
  for (const id in ents) {
    const e = ents[id];
    if (!wdDecl(e, 'P50').length) continue; // sin autor: película, videojuego…
    const decl = wdDecl(e, 'P179').find(c => c.mainsnak.datavalue.value.id === serieId);
    const orden = decl && decl.qualifiers && decl.qualifiers.P1545 ? decl.qualifiers.P1545[0].datavalue.value : '';
    const fechas = wdDecl(e, 'P577').map(c => c.mainsnak.datavalue.value.time.replace(/^\+/, '')).sort();
    todos.push({ titulo: wdNombre(e), orden, fecha: fechas[0] || '9999' });
  }
  // Quitar duplicados por título (obra de teatro + libro del guion, etc.)
  const vistos = new Set();
  const unicos = todos.filter(x => x.titulo).sort((a, b) => a.fecha.localeCompare(b.fecha))
    .filter(x => { const k = norm(x.titulo); if (vistos.has(k)) return false; vistos.add(k); return true; });

  const esEntero = o => /^\d+$/.test(o || '');
  let principal = unicos.filter(x => esEntero(x.orden)).sort((a, b) => a.orden - b.orden);
  let extras    = unicos.filter(x => !esEntero(x.orden));

  // Sin numeración: se ordena por fecha de publicación
  if (principal.length < 2) { principal = unicos; extras = []; principal.forEach((x, i) => x.orden = String(i + 1)); }

  return {
    principal: principal.map(x => ({ titulo: x.titulo, num: Number(x.orden) })),
    extras:    extras.map(x => ({ titulo: x.titulo, num: '' }))
  };
}

// ── OPEN LIBRARY ────────────────────────────

// sagaConfirmada: Wikidata dice que la saga existe. Sin eso, solo se acepta si
// hay al menos dos títulos numerados ("Tomo 1", "Libro 2"…): si no, cualquier
// novela suelta saldría como saga (con "Cien años de soledad" salían 59 ensayos).
async function olLibrosDe(nombreSaga, autor, sagaConfirmada) {
  // Sin artículo: "La Biblia de los Caídos" devuelve 5 libros y "Biblia de los Caídos", 11
  const sinArticulo = nombreSaga.replace(/^(la|el|los|las|the)\s+/i, '');
  const params = { title: sinArticulo, fields: 'title,author_name,first_publish_year', limit: '100' };
  const d = await (await fetchT(OL_SEARCH + '?' + new URLSearchParams(params), {}, 15000)).json();

  const base = norm(nombreSaga);
  // Con un nombre largo y distintivo basta el título: hay sagas con varios autores
  // (en La Biblia de los Caídos cada testamento lo firma alguien distinto).
  const exigirAutor = base.length < 15;
  const vistos = new Map();
  for (const doc of d.docs || []) {
    if (!norm(doc.title).startsWith(base)) continue;
    if (exigirAutor && !(doc.author_name || []).some(a => mismoAutor(a, autor))) continue;
    const titulo = limpiarTituloOL(doc.title);
    const k = norm(titulo);
    const anio = doc.first_publish_year || 9999;
    if (!vistos.has(k) || vistos.get(k).anio > anio) vistos.set(k, { titulo, anio });
  }
  if (!sagaConfirmada && [...vistos.keys()].filter(k => numeroEnTitulo(k)).length < 2) return [];
  // Orden de publicación como primera aproximación; el usuario lo corrige al revisar
  const lista = [...vistos.values()].sort((a, b) =>
    a.anio - b.anio || (numeroEnTitulo(a.titulo) || 0) - (numeroEnTitulo(b.titulo) || 0));
  return lista.map((x, i) => ({ titulo: x.titulo, num: i + 1 }));
}

// Open Library trae "Biblia de Los Caídos. Tomo 1 Del Testamento Del Gris": se deja legible
function limpiarTituloOL(t) {
  return String(t).replace(/\s+/g, ' ').trim()
    .replace(/\b(De|Del|La|Las|Los|El|Y|En)\b/g, (m, palabra, pos) => pos === 0 ? m : m.toLowerCase());
}

// ── PUNTO DE ENTRADA ────────────────────────
//
// Devuelve una propuesta { nombre, autor, fuente, wikidata, libros: [{titulo, num, incluir}] }
// o null si no parece haber saga.

async function descubrirSaga(libro) {
  let serie = null;
  try { serie = await wdSerieDe(libro); } catch (e) { console.warn('Wikidata:', e.message); }

  if (serie) {
    try {
      const { principal, extras } = await wdLibrosDe(serie.wikidata);
      if (principal.length >= 2) {
        return {
          nombre: serie.nombre, autor: serie.autor, fuente: 'wikidata', wikidata: serie.wikidata,
          libros: [
            ...principal.map(x => ({ ...x, incluir: true })),
            ...extras.map(x => ({ ...x, incluir: false }))
          ]
        };
      }
    } catch (e) { console.warn('Wikidata libros:', e.message); }
  }

  // Wikidata no sabe nada, o sabe que la saga existe pero sin libros
  const nombre = serie ? serie.nombre : nombreBaseSaga(libro.titulo);
  try {
    const libros = await olLibrosDe(nombre, libro.autor, !!serie);
    if (libros.length >= 2) {
      return {
        nombre, autor: libro.autor, fuente: 'openlibrary', wikidata: serie ? serie.wikidata : '',
        libros: libros.map(x => ({ ...x, incluir: true }))
      };
    }
  } catch (e) { console.warn('Open Library:', e.message); }

  return null;
}
