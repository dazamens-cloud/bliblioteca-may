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
    case 'perfiles': return json({ ok: true, perfiles: listarPerfiles() });
    case 'entrar':   return json(entrar(p.perfil, p.pin));
  }
  if (!sesionValida(p.perfil, p.clave)) return json({ ok: false, error: 'clave' });

  switch (p.accion) {
    case 'ping':        return json({ ok: true });
    case 'todo':        return json({ ok: true, libros: leer('LIBROS', p.perfil), sagas: leer('SAGAS', p.perfil) });
    case 'googleBooks': return json(googleBooks(p.q));
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

// ── UTILIDADES ────────────────────────────────

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
