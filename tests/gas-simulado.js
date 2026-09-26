// Ejecuta apps-script/Code.gs en Node con los servicios de Google simulados
// en memoria (hojas, propiedades, caché). Solo lo que usa Code.gs.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');

function crearHoja() {
  const filas = [];
  return {
    filas,
    getMaxRows: () => 1000,
    setFrozenRows() {},
    getLastRow: () => filas.length,
    deleteRow: n => { filas.splice(n - 1, 1); },
    getRange: (r, c, nr = 1, nc = 1) => ({
      setNumberFormat() { return this; },
      setFontWeight() { return this; },
      setValues(v) { v.forEach((fila, i) => { filas[r - 1 + i] = fila.slice(); }); return this; },
      getValues: () => filas.slice(r - 1, r - 1 + nr).map(f => f.slice(c - 1, c - 1 + nc)),
      createTextFinder: t => ({
        matchEntireCell() { return this; },
        findNext() {
          for (let i = r - 1; i < r - 1 + nr; i++) if (String(filas[i][c - 1]) === t) return { getRow: () => i + 1 };
          return null;
        }
      })
    })
  };
}

function crearBackend(props = {}) {
  const hojas = {};
  const libro = {
    getSheetByName: n => hojas[n] || null,
    insertSheet: n => (hojas[n] = crearHoja()),
    getUrl: () => 'https://docs.google.com/spreadsheets/d/simulada',
    getId: () => 'simulada'
  };
  const cache = {};
  const ctx = {
    PropertiesService: { getScriptProperties: () => ({
      getProperty: k => (k in props ? props[k] : null),
      setProperty: (k, v) => { props[k] = String(v); },
      getProperties: () => ({ ...props })
    }) },
    SpreadsheetApp: { getActiveSpreadsheet: () => libro, openById: () => libro, create: () => libro },
    CacheService: { getScriptCache: () => ({
      get: k => (k in cache ? cache[k] : null), put: (k, v) => { cache[k] = v; }, remove: k => { delete cache[k]; }
    }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      computeHmacSha256Signature: (v, k) => [...crypto.createHmac('sha256', k).update(v).digest()],
      base64EncodeWebSafe: b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_')
    },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => ({ t, setMimeType() { return this; } }) },
    Logger: { log() {} },
    UrlFetchApp: {}
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8'), ctx);
  ctx.setup();
  return {
    ctx, hojas, props,
    get: p => JSON.parse(ctx.doGet({ parameter: p }).t),
    post: d => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(d) } }).t)
  };
}

module.exports = { crearBackend };
