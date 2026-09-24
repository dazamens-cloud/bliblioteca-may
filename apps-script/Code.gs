// =============================================
// Code.gs - Mi Biblioteca (backend)
// Vale vinculado a una hoja (Hoja → Extensiones → Apps Script) o suelto
// (creado en script.google.com): en ese caso setup() crea la hoja
// "Mi Biblioteca" y guarda su id en la propiedad SHEET_ID.
//
// Primera vez: ejecutar setup() desde el editor.
// Crea las pestañas LIBROS y SAGAS y genera el TOKEN
// (se ve en el registro de ejecución; va en WEB_APP_TOKEN de script.js).
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

// ── SETUP ─────────────────────────────────────

function setup() {
  const props = PropertiesService.getScriptProperties();
  let ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss && props.getProperty('SHEET_ID')) ss = SpreadsheetApp.openById(props.getProperty('SHEET_ID'));
  if (!ss) {
    ss = SpreadsheetApp.create('Mi Biblioteca');
    props.setProperty('SHEET_ID', ss.getId());
  }
  Object.keys(HOJAS).forEach(function (nombre) {
    let hoja = ss.getSheetByName(nombre);
    if (!hoja) hoja = ss.insertSheet(nombre);
    const campos = HOJAS[nombre];
    // Todo como texto plano: si no, Sheets convierte ISBN y fechas por su cuenta
    hoja.getRange(1, 1, hoja.getMaxRows(), campos.length).setNumberFormat('@');
    hoja.getRange(1, 1, 1, campos.length).setValues([campos]).setFontWeight('bold');
    hoja.setFrozenRows(1);
  });

  let token = props.getProperty('TOKEN');
  if (!token) {
    token = Utilities.getUuid().replace(/-/g, '');
    props.setProperty('TOKEN', token);
  }
  Logger.log('Hoja: ' + ss.getUrl());
  Logger.log('TOKEN (cópialo en WEB_APP_TOKEN de script.js): ' + token);
}

// ── ENTRADA ───────────────────────────────────

function doGet(e) {
  const p = e.parameter || {};
  if (!tokenValido(p.token)) return json({ ok: false, error: 'token' });

  switch (p.accion) {
    case 'ping':        return json({ ok: true });
    case 'todo':        return json({ ok: true, libros: leer('LIBROS'), sagas: leer('SAGAS') });
    case 'googleBooks': return json(googleBooks(p.q));
    default:            return json({ ok: false, error: 'accion desconocida' });
  }
}

function doPost(e) {
  let d;
  try { d = JSON.parse(e.postData.contents); }
  catch (err) { return json({ ok: false, error: 'json' }); }
  if (!tokenValido(d.token)) return json({ ok: false, error: 'token' });

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    switch (d.accion) {
      case 'guardarLibro': guardar('LIBROS', d.libro); break;
      case 'borrarLibro':  borrar('LIBROS', d.id);     break;
      case 'guardarSaga':  guardar('SAGAS', d.saga);   break;
      case 'borrarSaga':   borrar('SAGAS', d.id);      break;
      case 'subirTodo':
        (d.libros || []).forEach(function (l) { guardar('LIBROS', l); });
        (d.sagas  || []).forEach(function (s) { guardar('SAGAS', s); });
        break;
      default: return json({ ok: false, error: 'accion desconocida' });
    }
    return json({ ok: true });
  } finally {
    lock.releaseLock();
  }
}

// ── DATOS ─────────────────────────────────────

function leer(nombre) {
  const hoja = obtenerHoja(nombre);
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

function guardar(nombre, obj) {
  if (!obj || !obj.id) return;
  const hoja = obtenerHoja(nombre);
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

function borrar(nombre, id) {
  const hoja = obtenerHoja(nombre);
  const n = buscarFila(hoja, id);
  if (n) hoja.deleteRow(n);
}

function buscarFila(hoja, id) {
  if (!id || hoja.getLastRow() < 2) return 0;
  const celda = hoja.getRange(2, 1, hoja.getLastRow() - 1, 1)
    .createTextFinder(String(id)).matchEntireCell(true).findNext();
  return celda ? celda.getRow() : 0;
}

// La hoja vinculada, o la que creó setup() si el script va suelto
function obtenerHoja(nombre) {
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  const ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(nombre);
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

function tokenValido(t) {
  const token = PropertiesService.getScriptProperties().getProperty('TOKEN');
  return !!token && t === token;
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
