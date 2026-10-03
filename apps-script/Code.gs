// =============================================
// Code.gs - Mi Biblioteca (backend)
// Vale vinculado a una hoja (Hoja → Extensiones → Apps Script) o suelto
// (creado en script.google.com): en ese caso setup() crea la hoja
// "Mi Biblioteca" y guarda su id en la propiedad SHEET_ID.
//
// Primera vez: ejecutar setup() desde el editor.
//
// PERFILES: cada persona tiene su biblioteca en sus propias pestañas
// (LIBROS_ana, SAGAS_ana) y entra con un PIN. Para crear un perfil, en
// Configuración del proyecto → Propiedades del script, añadir
// PIN_ana = 1234 (id en minúsculas, sin espacios). No hace falta
// tocar el código ni redesplegar. Cambiar el PIN cierra su sesión en
// todos los móviles.
//
// NOMBRE (opcional): NOMBRE_ana = Ana María es el nombre que muestra la app
// (con espacios, tildes…). Sin él se ve el id con mayúscula: «Ana».
//
// RETO: la meta de libros del año de cada perfil va en la propiedad
// RETO_ana (la escribe la app; no hace falta tocarla a mano).
//
// BÚSQUEDA: si Open Library y Google Books no conocen un ISBN, la app
// pregunta al catálogo de la Biblioteca Nacional (SRU) por aquí (accion=bne).
// No necesita clave.
//
// ⚠️ Al cambiar este código: Implementar → NUEVA implementación.
// Redesplegar la existente no sirve el código nuevo (ver README).
// =============================================

const CAMPOS_LIBRO = ['id', 'isbn', 'titulo', 'autor', 'portada', 'paginas', 'editorial', 'anio',
  'tipo', 'tengo', 'lectura', 'saga_id', 'saga_num', 'prestado_a', 'valoracion', 'notas',
  'alta', 'fin', 'saga_buscada', 'actualizado', 'ubicacion', 'pagina'];
// Campos nuevos: siempre AL FINAL. Las filas se leen por posición.
const CAMPOS_SAGA = ['id', 'nombre', 'autor', 'fuente', 'wikidata', 'libros', 'actualizado'];

const HOJAS = { LIBROS: CAMPOS_LIBRO, SAGAS: CAMPOS_SAGA };

const MAX_FALLOS = 5;          // PIN mal seguidos antes de bloquear el perfil
const BLOQUEO_SEG = 15 * 60;   // durante 15 minutos

// ── SETUP ─────────────────────────────────────

function setup() {
  const props = PropertiesService.getScriptProperties();
  let ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss && props.getProperty('SHEET_ID')) ss = SpreadsheetApp.openById(props.getProperty('SHEET_ID'));
  if (!ss) {
    ss = SpreadsheetApp.create('Mi Biblioteca');
    props.setProperty('SHEET_ID', ss.getId());
  }
  // Secreto con el que se firman las sesiones. No sale nunca del servidor.
  if (!props.getProperty('TOKEN')) props.setProperty('TOKEN', Utilities.getUuid().replace(/-/g, ''));

  Logger.log('Hoja: ' + ss.getUrl());
  const perfiles = listarPerfiles();
  Logger.log(perfiles.length
    ? 'Perfiles: ' + perfiles.join(', ')
    : 'Sin perfiles todavía: añade PIN_tunombre en las propiedades del script.');
}

// ── ENTRADA ───────────────────────────────────

function doGet(e) {
  const p = e.parameter || {};
  switch (p.accion) {
    case 'perfiles': return json({ ok: true, perfiles: listarPerfiles(), nombres: nombresPerfiles() });
    case 'entrar':   return json(entrar(p.perfil, p.pin));
  }
  if (!sesionValida(p.perfil, p.clave)) return json({ ok: false, error: 'clave' });

  switch (p.accion) {
    case 'ping':        return json({ ok: true });
    case 'todo':        return json({ ok: true, libros: leer('LIBROS', p.perfil), sagas: leer('SAGAS', p.perfil), reto: leerReto(p.perfil), nombre: nombreDe(p.perfil) });
    case 'googleBooks': return json(googleBooks(p.q));
    case 'bne':         return json(bne(p.isbn));
    default:            return json({ ok: false, error: 'accion desconocida' });
  }
}

function doPost(e) {
  let d;
  try { d = JSON.parse(e.postData.contents); }
  catch (err) { return json({ ok: false, error: 'json' }); }
  if (!sesionValida(d.perfil, d.clave)) return json({ ok: false, error: 'clave' });
  const perfil = d.perfil;

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    switch (d.accion) {
      case 'guardarLibro': guardar('LIBROS', perfil, d.libro); break;
      case 'borrarLibro':  borrar('LIBROS', perfil, d.id);     break;
      case 'guardarSaga':  guardar('SAGAS', perfil, d.saga);   break;
      case 'borrarSaga':   borrar('SAGAS', perfil, d.id);      break;
      case 'guardarReto':
        if (!guardarReto(perfil, d.anio, d.meta)) return json({ ok: false, error: 'meta' });
        break;
      case 'subirTodo':
        (d.libros || []).forEach(function (l) { guardar('LIBROS', perfil, l); });
        (d.sagas  || []).forEach(function (s) { guardar('SAGAS', perfil, s); });
        break;
      default: return json({ ok: false, error: 'accion desconocida' });
    }
    return json({ ok: true });
  } finally {
    lock.releaseLock();
  }
}

// ── PERFILES Y PIN ────────────────────────────

function listarPerfiles() {
  return Object.keys(PropertiesService.getScriptProperties().getProperties())
    .filter(function (k) { return /^PIN_[a-z0-9]+$/.test(k); })
    .map(function (k) { return k.slice(4); })
    .sort();
}

// Nombres para mostrar de los perfiles que existen: { ana: 'Ana María' }
function nombresPerfiles() {
  const nombres = {};
  listarPerfiles().forEach(function (id) {
    const n = nombreDe(id);
    if (n) nombres[id] = n;
  });
  return nombres;
}

function nombreDe(perfil) {
  if (!/^[a-z0-9]+$/.test(String(perfil || ''))) return '';
  return String(PropertiesService.getScriptProperties().getProperty('NOMBRE_' + perfil) || '').trim().slice(0, 40);
}

function pinDe(perfil) {
  if (!/^[a-z0-9]+$/.test(String(perfil || ''))) return null;
  return PropertiesService.getScriptProperties().getProperty('PIN_' + perfil);
}

// La clave de sesión es una firma del perfil y su PIN: el servidor no guarda
// sesiones, y al cambiar el PIN todas las claves anteriores dejan de valer.
function claveDe(perfil, pin) {
  const secreto = PropertiesService.getScriptProperties().getProperty('TOKEN');
  const firma = Utilities.computeHmacSha256Signature(perfil + ':' + pin, secreto);
  return Utilities.base64EncodeWebSafe(firma).replace(/=+$/, '');
}

function entrar(perfil, pin) {
  const bueno = pinDe(perfil);
  if (!bueno) return { ok: false, error: 'perfil' };
  const cache = CacheService.getScriptCache();
  const k = 'fallos_' + perfil;
  const fallos = Number(cache.get(k)) || 0;
  if (fallos >= MAX_FALLOS) return { ok: false, error: 'bloqueado' };
  if (String(pin) !== bueno) {
    cache.put(k, String(fallos + 1), BLOQUEO_SEG);
    return { ok: false, error: 'pin' };
  }
  cache.remove(k);
  return { ok: true, clave: claveDe(perfil, bueno) };
}

function sesionValida(perfil, clave) {
  const pin = pinDe(perfil);
  return !!pin && !!clave && clave === claveDe(perfil, pin);
}

// ── DATOS ─────────────────────────────────────

function leer(nombre, perfil) {
  const hoja = obtenerHoja(nombre, perfil);
  const campos = HOJAS[nombre];
  const n = hoja.getLastRow() - 1;
  if (n < 1) return [];
  return hoja.getRange(2, 1, n, campos.length).getValues()
    .filter(function (fila) { return fila[0] !== ''; })
    .map(function (fila) {
      const obj = {};
      campos.forEach(function (c, i) { obj[c] = fila[i]; });
      if (nombre === 'SAGAS') {
        try { obj.libros = JSON.parse(obj.libros || '[]'); } catch (err) { obj.libros = []; }
      }
      return obj;
    });
}

function guardar(nombre, perfil, obj) {
  if (!obj || !obj.id) return;
  const hoja = obtenerHoja(nombre, perfil);
  const campos = HOJAS[nombre];
  const fila = campos.map(function (c) {
    const v = obj[c];
    if (v === undefined || v === null) return '';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  });
  const n = buscarFila(hoja, obj.id);
  const rango = n ? hoja.getRange(n, 1, 1, campos.length)
                  : hoja.getRange(hoja.getLastRow() + 1, 1, 1, campos.length);
  rango.setNumberFormat('@').setValues([fila]);
}

function borrar(nombre, perfil, id) {
  const hoja = obtenerHoja(nombre, perfil);
  const n = buscarFila(hoja, id);
  if (n) hoja.deleteRow(n);
}

function buscarFila(hoja, id) {
  if (!id || hoja.getLastRow() < 2) return 0;
  const celda = hoja.getRange(2, 1, hoja.getLastRow() - 1, 1)
    .createTextFinder(String(id)).matchEntireCell(true).findNext();
  return celda ? celda.getRow() : 0;
}

// La pestaña del perfil (LIBROS_ana). Si no existe, se crea.
// Hoja: la vinculada, o la que creó setup() si el script va suelto.
function obtenerHoja(nombre, perfil) {
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  const ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  const titulo = nombre + '_' + perfil;
  let hoja = ss.getSheetByName(titulo);
  if (!hoja) {
    hoja = ss.insertSheet(titulo);
    const campos = HOJAS[nombre];
    // Todo como texto plano: si no, Sheets convierte ISBN y fechas por su cuenta
    hoja.getRange(1, 1, hoja.getMaxRows(), campos.length).setNumberFormat('@');
    hoja.getRange(1, 1, 1, campos.length).setValues([campos]).setFontWeight('bold');
    hoja.setFrozenRows(1);
  }
  return hoja;
}

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

// ── GOOGLE BOOKS (la clave no sale del servidor) ──

function googleBooks(q) {
  const clave = PropertiesService.getScriptProperties().getProperty('GOOGLE_BOOKS_KEY');
  if (!clave) return { ok: false, error: 'sin GOOGLE_BOOKS_KEY' };
  const url = 'https://www.googleapis.com/books/v1/volumes?maxResults=15&q=' +
    encodeURIComponent(q || '') + '&key=' + clave;
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return { ok: false, error: 'http ' + res.getResponseCode() };
  return { ok: true, datos: JSON.parse(res.getContentText()) };
}

// ── BIBLIOTECA NACIONAL (libros editados en España) ──
// Catálogo de la BNE por SRU (protocolo estándar de bibliotecas), sin clave.
// Recoge lo que entra por depósito legal, así que tiene casi todo lo editado
// en España, también los ISBN nuevos 979-13 (las novedades, con algo de retraso).
// Devuelve MARCXML: 245 título, 100 autor, 264/260 editorial y año, 300 páginas.

const SRU_BNE = 'https://catalogo.bne.es/view/sru/34BNE_INST';

function bne(isbn) {
  isbn = String(isbn || '').replace(/[^0-9Xx]/g, '').toUpperCase();
  if (!/^(\d{13}|\d{9}[\dX])$/.test(isbn)) return { ok: false, error: 'isbn' };
  let res;
  try { res = UrlFetchApp.fetch(urlBne(isbn), { muteHttpExceptions: true }); }
  catch (e) { return { ok: false, error: 'red' }; }
  if (res.getResponseCode() !== 200) return { ok: false, error: 'http ' + res.getResponseCode() };
  const registros = registrosMarc(res.getContentText());
  if (!registros.length) return { ok: true, libro: null };
  // Por si acaso, el que tenga este ISBN en el 020; si no, el primero
  const reg = registros.find(function (r) {
    return subcampos(r, '020', 'a').some(function (v) { return v.replace(/[^0-9Xx]/g, '').toUpperCase().indexOf(isbn) === 0; });
  }) || registros[0];
  return { ok: true, libro: libroMarc(reg) };
}

function urlBne(isbn) {
  return SRU_BNE + '?version=1.2&operation=searchRetrieve&recordSchema=marcxml&maximumRecords=5&query=' +
    encodeURIComponent('alma.isbn="' + isbn + '"');
}

// MARCXML → [{ tag: [{ ind2, sub: { a: ['…'] } }] }]. Con expresiones regulares
// y no con XmlService, para poder probarlo fuera de Google.
function registrosMarc(xml) {
  return String(xml || '').split(/<(?:\w+:)?record(?=[\s>])/).slice(1).map(function (trozo) {
    const campos = {};
    const reCampo = /<(?:\w+:)?datafield\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?datafield>/g;
    let m;
    while ((m = reCampo.exec(trozo))) {
      const tag = (m[1].match(/tag="(\d+)"/) || [])[1];
      if (!tag) continue;
      const sub = {};
      const reSub = /<(?:\w+:)?subfield\b[^>]*code="(\w)"[^>]*>([\s\S]*?)<\/(?:\w+:)?subfield>/g;
      let s;
      while ((s = reSub.exec(m[2]))) (sub[s[1]] = sub[s[1]] || []).push(entidades(s[2]).trim());
      (campos[tag] = campos[tag] || []).push({ ind2: (m[1].match(/ind2="(.)"/) || [])[1] || ' ', sub: sub });
    }
    const c008 = trozo.match(/<(?:\w+:)?controlfield\b[^>]*tag="008"[^>]*>([^<]*)</);
    if (c008 && Object.keys(campos).length) campos._008 = c008[1];
    return campos;
  }).filter(function (c) { return Object.keys(c).length; });
}

function entidades(t) {
  return t.replace(/&#x([0-9a-f]+);/gi, function (x, h) { return String.fromCharCode(parseInt(h, 16)); })
    .replace(/&#(\d+);/g, function (x, d) { return String.fromCharCode(Number(d)); })
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

function subcampos(reg, tag, code) {
  return (reg[tag] || []).reduce(function (t, c) { return t.concat(c.sub[code] || []); }, []);
}

// Quita corchetes y la puntuación ISBD de los extremos (" /", " :", ","),
// pero no el punto de una inicial ("Rowling, J. K.")
function limpiarMarc(s) {
  s = String(s || '').replace(/[\[\]]/g, '').replace(/^[\s.,:;\/=]+|[\s,:;\/=]+$/g, '');
  return /(^|[\s.])[A-ZÁÉÍÓÚÑ]\.$/.test(s) ? s : s.replace(/[\s.]+$/, '');
}

// "Kent, Rina" → "Rina Kent"
function nombreMarc(s) {
  const partes = limpiarMarc(s).split(',').map(function (x) { return x.trim(); }).filter(String);
  return partes.length >= 2 ? partes[1] + ' ' + partes[0] : partes.join('');
}

function libroMarc(r) {
  // Título: 245 $a, más número y nombre de parte ($n, $p) y subtítulo ($b):
  // en algunas sagas los libros solo se distinguen por el subtítulo
  const t245 = (r['245'] || [{ sub: {} }])[0].sub;
  const titulo = [(t245.a || [''])[0]].concat(t245.n || [], t245.p || [], (t245.b || []).slice(0, 1))
    .map(limpiarMarc).filter(String)
    .map(function (x, i) { return i ? x.charAt(0).toUpperCase() + x.slice(1) : x; }).join('. ');

  // Autor: 100; si no hay, el primer 700 que no sea traductor ni ilustrador;
  // si tampoco, la mención de la portada (245 $c)
  let autor = nombreMarc(subcampos(r, '100', 'a')[0]);
  if (!autor) {
    const otro = (r['700'] || []).find(function (c) { return !/trad|ilus/i.test((c.sub.e || []).join(' ')); });
    if (otro) autor = nombreMarc((otro.sub.a || [''])[0]);
  }
  if (!autor) autor = limpiarMarc(String((t245.c || [''])[0]).split(';')[0]);

  // Editorial y año: 264 de publicación (ind2 = 1) o el 260 antiguo
  const pub = (r['264'] || []).find(function (c) { return c.ind2 === '1'; }) || (r['264'] || [])[0] || (r['260'] || [])[0];
  // Las fichas provisionales traen la razón social: "…, S.A.U." fuera
  const editorial = pub ? limpiarMarc(limpiarMarc((pub.sub.b || [''])[0])
    .replace(/,?\s+S\.?\s?(A|L)\.?(\s?U\.?)?$/i, '')) : '';
  // Año: el de publicación; si no, el del depósito legal ("B 16289-2025")
  // o, en último caso, el del 008
  const anio = ((pub && (pub.sub.c || []).join(' ')) || '').match(/\d{4}/) ||
    subcampos(r, '017', 'a').join(' ').match(/(\d{4})\s*$/) ||
    (r._008 || '').slice(7, 11).match(/^\d{4}$/);

  const ext = subcampos(r, '300', 'a').join(' ');
  const pag = ext.match(/(\d+)\s*p/) || ext.match(/(\d+)/);

  return { titulo: titulo, autor: autor, editorial: editorial, anio: anio ? anio[anio.length - 1] : '', paginas: pag ? Number(pag[1]) : '' };
}

// Para probar desde el editor: elegir probarBne y pulsar Ejecutar.
// Sale el principio de lo que contesta la BNE y cómo queda cada libro
// (God of Malice, de 2025, y Harry Potter de Salamandra, de 1999).
function probarBne() {
  ['9791387924713', '9788478884452'].forEach(function (isbn) {
    const r = UrlFetchApp.fetch(urlBne(isbn), { muteHttpExceptions: true });
    Logger.log(isbn + ' → ' + r.getResponseCode() + ' ' + r.getContentText().slice(0, 1500));
    Logger.log(JSON.stringify(bne(isbn)));
  });
}

// ── UTILIDADES ────────────────────────────────

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
