// =============================================
// script.js - Mi Biblioteca
// Los datos viven en el móvil (localStorage). Si hay una hoja de Google
// conectada, cada cambio se envía también allí.
// La detección de sagas está en sagas.js.
// =============================================

// URL de la Web App: en el código, así cualquier
// dispositivo la tiene sin configurar nada. Cada persona entra en su perfil
// con su PIN (los PIN están en el servidor, no aquí). Vacía = se pega en Ajustes.
// ⚠️ Cada implementación nueva de Apps Script da otra URL: cambiarla aquí.
const URL_SCRIPT = 'https://script.google.com/macros/s/AKfycby61JOBvWYkB6dqv8J0dJ3BMnGL64PBj4-KSeoH0KTUturUc7Mq1jcDhe6imPg-W1R4/exec';

const LS = { config: 'mb_config', filtro: 'mb_filtro' };
// Libros, sagas y cola van por perfil: mb_ana_libros. Sin perfil: mb_libros.
const lsDatos = (k, perfil = config.perfil) => 'mb_' + (perfil ? perfil + '_' : '') + k;

const ESTADOS = { pendiente: 'Por leer', leyendo: 'Leyendo', leido: 'Leído', abandonado: 'Pausado' };

const FILTROS = {
  todos:     () => true,
  leyendo:   l => l.lectura === 'leyendo',
  pendiente: l => l.tengo && l.lectura === 'pendiente',
  leido:     l => l.lectura === 'leido',
  deseado:   l => !l.tengo,
  prestado:  l => !!l.prestado_a
};

const LIBRO_VACIO = {
  id: '', isbn: '', titulo: '', autor: '', portada: '', paginas: '', editorial: '', anio: '',
  tipo: 'libro', tengo: true, lectura: 'pendiente', saga_id: '', saga_num: '', prestado_a: '',
  valoracion: 0, notas: '', alta: '', fin: '', saga_buscada: false, actualizado: '',
  ubicacion: '', pagina: ''
};

// ── ESTADO GLOBAL ───────────────────────────
let libros = [];
let sagas  = [];
let cola   = [];          // cambios pendientes de enviar a la hoja
let config = {};          // { url, perfil, clave } de la Web App de Apps Script
let filtro = 'todos';
let enviando = false;
let modalAbierto = false;
let escaner = null;       // { stream, timer }

// ── UTILIDADES ──────────────────────────────

const $ = sel => document.querySelector(sel);

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function uid()   { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function ahora() { return new Date().toISOString(); }
function tono(s) { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; }
const siNo = v => v === true || v === 'true' || v === 'TRUE';

function leerLS(k, def) {
  try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch (e) { return def; }
}
function guardarLS(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { console.error('localStorage:', e); }
}

let toastTimer;
function toast(html, opciones = {}) {
  const t = $('#toast');
  t.innerHTML = html;
  t.classList.add('show');
  t.classList.toggle('pulsable', !!opciones.accion);
  t.onclick = () => { t.classList.remove('show'); if (opciones.accion) opciones.accion(); };
  clearTimeout(toastTimer);
  if (opciones.ms !== 0) toastTimer = setTimeout(() => t.classList.remove('show'), opciones.ms || 3000);
}
function ocultarToast() { $('#toast').classList.remove('show'); }

// ── DATOS ───────────────────────────────────

function normalizarLibro(o) {
  const l = { ...LIBRO_VACIO, ...o };
  l.tengo = o.tengo === undefined || o.tengo === '' ? true : siNo(o.tengo);
  l.saga_buscada = siNo(l.saga_buscada);
  l.valoracion = Number(l.valoracion) || 0;
  for (const k of ['saga_num', 'pagina', 'paginas']) l[k] = l[k] === '' || l[k] == null ? '' : Number(l[k]) || '';
  return l;
}

function normalizarSaga(o) {
  let lista = o.libros;
  if (typeof lista === 'string') { try { lista = JSON.parse(lista); } catch (e) { lista = []; } }
  return {
    id: o.id, nombre: o.nombre || '', autor: o.autor || '', fuente: o.fuente || 'manual',
    wikidata: o.wikidata || '', actualizado: o.actualizado || '',
    libros: (lista || []).map(e => ({ titulo: e.titulo || '', num: e.num === '' || e.num == null ? '' : Number(e.num) }))
  };
}

function cargarLocal() {
  config = configGuardada();
  filtro = leerLS(LS.filtro, 'todos');
  if (!FILTROS[filtro]) filtro = 'todos';
  cargarDatos();
}

// Los datos del perfil activo (o los de "sin perfil")
function cargarDatos() {
  libros = leerLS(lsDatos('libros'), []).map(normalizarLibro);
  sagas  = leerLS(lsDatos('sagas'), []).map(normalizarSaga);
  cola   = leerLS(lsDatos('cola'), []);
}

// La URL del código manda sobre la guardada. Las conexiones de antes de los
// perfiles ({ url, token }) se quedan solo con la URL.
function configGuardada() {
  const c = leerLS(LS.config, {});
  return { url: URL_SCRIPT || c.url || '', perfil: c.perfil || '', clave: c.clave || '' };
}

function guardarConfig() {
  guardarLS(LS.config, { url: config.url, perfil: config.perfil, clave: config.clave });
}

function guardarLocal() {
  guardarLS(lsDatos('libros'), libros);
  guardarLS(lsDatos('sagas'), sagas);
}

function guardarLibro(l) {
  l.actualizado = ahora();
  const i = libros.findIndex(x => x.id === l.id);
  if (i >= 0) libros[i] = l; else libros.push(l);
  guardarLocal();
  encolar({ accion: 'guardarLibro', libro: l });
  renderTodo();
}

function borrarLibro(id) {
  libros = libros.filter(l => l.id !== id);
  guardarLocal();
  encolar({ accion: 'borrarLibro', id });
  renderTodo();
}

function guardarSaga(s) {
  s.actualizado = ahora();
  const i = sagas.findIndex(x => x.id === s.id);
  if (i >= 0) sagas[i] = s; else sagas.push(s);
  guardarLocal();
  encolar({ accion: 'guardarSaga', saga: s });
  renderTodo();
}

function borrarSaga(id) {
  sagas = sagas.filter(s => s.id !== id);
  libros.filter(l => l.saga_id === id).forEach(l => { l.saga_id = ''; l.saga_num = ''; guardarLibro(l); });
  guardarLocal();
  encolar({ accion: 'borrarSaga', id });
  renderTodo();
}

const libroPorId = id => libros.find(l => l.id === id);
const sagaPorId  = id => sagas.find(s => s.id === id);
const sagaDe     = l => l && l.saga_id ? sagaPorId(l.saga_id) : null;

// ── SINCRONIZACIÓN CON GOOGLE SHEETS ────────

const conectado = () => !!(config.url && config.perfil && config.clave);
const nombrePerfil = id => id ? id[0].toUpperCase() + id.slice(1) : '';

async function apiGet(params) {
  const q = new URLSearchParams({ ...params, perfil: config.perfil, clave: config.clave });
  const r = await (await fetchT(config.url + '?' + q, {}, 20000)).json();
  if (r && r.error === 'clave') sesionCaducada();
  return r;
}

// Content-Type text/plain (el de por defecto): evita la petición CORS previa,
// que Apps Script no sabe contestar.
async function apiPost(payload) {
  const r = await (await fetchT(config.url, {
    method: 'POST', body: JSON.stringify({ ...payload, perfil: config.perfil, clave: config.clave })
  }, 30000)).json();
  if (r && r.error === 'clave') sesionCaducada();
  return r;
}

function encolar(payload) {
  if (!conectado()) return;
  cola.push(payload);
  guardarLS(lsDatos('cola'), cola);
  vaciarCola();
}

async function vaciarCola() {
  if (enviando || !conectado() || !navigator.onLine) { pintarSync(); return; }
  enviando = true;
  pintarSync();
  try {
    while (cola.length) {
      const r = await apiPost(cola[0]);
      if (!r || !r.ok) throw new Error((r && r.error) || 'sin respuesta');
      cola.shift();
      guardarLS(lsDatos('cola'), cola);
    }
    config.error = '';
  } catch (e) {
    console.warn('Sincronización:', e.message);
    config.error = e.message;
  } finally {
    enviando = false;
    pintarSync();
  }
}

// Trae la hoja y reemplaza lo local. Solo si no quedan cambios sin enviar.
async function descargar() {
  if (!conectado() || !navigator.onLine) return;
  await vaciarCola();
  if (cola.length) return;
  try {
    const r = await apiGet({ accion: 'todo' });
    if (!r.ok) throw new Error(r.error);
    libros = r.libros.map(normalizarLibro);
    sagas  = r.sagas.map(normalizarSaga);
    guardarLocal();
    config.error = '';
    renderTodo();
  } catch (e) {
    console.warn('Descarga:', e.message);
    config.error = e.message;
  }
  pintarSync();
}

// Une dos listas por id quedándose con la versión más reciente
function combinar(a, b) {
  const m = new Map();
  for (const x of [...a, ...b]) {
    const y = m.get(x.id);
    if (!y || String(x.actualizado) > String(y.actualizado)) m.set(x.id, x);
  }
  return [...m.values()];
}

// ── PERFILES ────────────────────────────────

async function cargarPerfiles() {
  const sel = $('#cfgPerfil');
  const url = config.url || $('#cfgUrl').value.trim();
  if (!url || conectado()) return;
  sel.innerHTML = '<option value="">Cargando…</option>';
  try {
    const r = await (await fetchT(url + '?accion=perfiles', {}, 20000)).json();
    if (!r.ok) throw new Error(r.error);
    sel.innerHTML = r.perfiles.length
      ? '<option value="">Elige tu perfil</option>' +
        r.perfiles.map(p => `<option value="${esc(p)}">${esc(nombrePerfil(p))}</option>`).join('')
      : '<option value="">No hay perfiles: créalos en Apps Script</option>';
  } catch (e) {
    sel.innerHTML = '<option value="">No se pudieron cargar los perfiles</option>';
  }
}

const ERRORES_ENTRAR = {
  pin: 'PIN incorrecto', perfil: 'ese perfil no existe',
  bloqueado: 'demasiados intentos, espera 15 minutos'
};

async function entrarPerfil(perfil, pin) {
  const url = config.url || $('#cfgUrl').value.trim();
  if (!url || !perfil || !pin) { toast('Elige un perfil y escribe el PIN'); return; }
  toast('Entrando…', { ms: 0 });
  try {
    const q = new URLSearchParams({ accion: 'entrar', perfil, pin });
    const r = await (await fetchT(url + '?' + q, {}, 20000)).json();
    if (!r.ok) throw new Error(ERRORES_ENTRAR[r.error] || r.error);

    const sinPerfil = { libros, sagas };
    config = { url, perfil, clave: r.clave };
    cargarDatos();
    // Libros de antes de los perfiles (o de usar la app sin conectar):
    // se ofrecen al perfil que entra, y solo se pasan si se acepta
    const heredar = sinPerfil.libros.length > 0 &&
      confirm('Este móvil tiene ' + sinPerfil.libros.length + ' libros sin perfil. ¿Pasarlos a ' + nombrePerfil(perfil) + '?');
    if (heredar) {
      libros = combinar(libros, sinPerfil.libros);
      sagas  = combinar(sagas, sinPerfil.sagas);
    }

    // Lo que quedó pendiente de la última vez (un libro borrado, por ejemplo)
    // se envía antes: si no, al combinar volvería desde la hoja
    await vaciarCola();
    const t = await apiGet({ accion: 'todo' });
    if (!t.ok) throw new Error(t.error);
    // Al entrar se combina: no se pierde nada ni del móvil ni de la hoja
    libros = combinar(t.libros.map(normalizarLibro), libros);
    sagas  = combinar(t.sagas.map(normalizarSaga), sagas);
    guardarLocal();
    guardarConfig();
    // Ya están guardados en el perfil: ahora sí se pueden quitar de "sin perfil"
    if (heredar) ['libros', 'sagas', 'cola'].forEach(k => localStorage.removeItem(lsDatos(k, '')));
    cola = [{ accion: 'subirTodo', libros, sagas }];
    guardarLS(lsDatos('cola'), cola);
    $('#cfgPin').value = '';
    await vaciarCola();
    toast('✅ Hola, ' + esc(nombrePerfil(perfil)) + '. ' + libros.length + ' libros.');
  } catch (e) {
    config = configGuardada();
    cargarDatos();
    toast('❌ No se pudo entrar: ' + esc(e.message), { ms: 6000 });
  }
  renderTodo();
  renderAjustes();
}

// Los libros del perfil se quedan en el móvil (y en la hoja): al volver a
// entrar con el PIN se siguen viendo sin conexión.
function salirPerfil() {
  config = { url: URL_SCRIPT || config.url, perfil: '', clave: '' };
  guardarConfig();
  cargarDatos();
  renderTodo();
  renderAjustes();
}

// El PIN ha cambiado en el servidor: la clave guardada ya no vale
function sesionCaducada() {
  if (!conectado()) return;
  salirPerfil();
  toast('🔒 La sesión ha caducado. Vuelve a entrar con tu PIN.', { ms: 6000 });
}

function pintarSync() {
  const el = $('#syncEstado');
  if (!el) return;
  let icono, txt = '', titulo;
  if (!conectado())          { icono = 'smartphone'; titulo = 'Solo en este móvil, sin perfil'; }
  else if (enviando)         { icono = 'sync'; titulo = 'Enviando…'; }
  else if (cola.length)      { icono = 'cloud_off'; txt = cola.length; titulo = cola.length + ' cambios pendientes de enviar'; }
  else if (config.error)     { icono = 'warning'; titulo = 'Error: ' + config.error; }
  else                       { icono = 'cloud_done'; titulo = nombrePerfil(config.perfil) + ': sincronizado con la hoja'; }
  el.innerHTML = `<span class="ic">${icono}</span>${txt}`;
  el.title = titulo;
  el.classList.toggle('error', !!(conectado() && config.error));
  const info = $('#infoSync');
  if (info) info.innerHTML = `<span class="ic">${icono}</span>${esc(titulo)}`;
}

// ── BÚSQUEDA DE LIBROS ──────────────────────

const OL = 'https://openlibrary.org';

function limpiarIsbn(s) { return String(s || '').replace(/[^0-9Xx]/g, '').toUpperCase(); }

// Preferir ediciones españolas (978-84) si una obra tiene varias
function elegirIsbn(lista) {
  const l = (lista || []).filter(i => i.length === 13);
  return l.find(i => i.startsWith('97884')) || l[0] || (lista || [])[0] || '';
}

async function buscarPorIsbn(isbn) {
  isbn = limpiarIsbn(isbn);
  if (isbn.length !== 10 && isbn.length !== 13) { toast('Ese ISBN no parece válido'); return; }
  $('#resultados').innerHTML = '<p class="cargando">Buscando…</p>';

  const [ed, bus] = await Promise.all([
    fetchT(`${OL}/isbn/${isbn}.json`).then(r => r.ok ? r.json() : null).catch(() => null),
    fetchT(`${OL}/search.json?isbn=${isbn}&fields=title,author_name,cover_i,number_of_pages_median,first_publish_year&limit=1`)
      .then(r => r.json()).then(d => (d.docs || [])[0]).catch(() => null)
  ]);

  if (ed || bus) {
    const cover = ed && ed.covers && ed.covers[0] > 0 ? ed.covers[0] : bus && bus.cover_i;
    abrirPreview({
      isbn,
      titulo:    (ed && ed.title) || (bus && bus.title) || '',
      autor:     ((bus && bus.author_name) || []).join(', '),
      editorial: ((ed && ed.publishers) || [])[0] || '',
      paginas:   (ed && ed.number_of_pages) || (bus && bus.number_of_pages_median) || '',
      anio:      ((ed && ed.publish_date) || '').match(/\d{4}/)?.[0] || (bus && bus.first_publish_year) || '',
      portada:   cover ? `https://covers.openlibrary.org/b/id/${cover}-M.jpg` : ''
    });
    $('#resultados').innerHTML = '';
    return;
  }

  const gb = await googleBooks('isbn:' + isbn);
  $('#resultados').innerHTML = '';
  if (gb.length) { abrirPreview({ ...gb[0], isbn }); return; }
  abrirPreview({ isbn }, 'No lo encuentro en ninguna base de datos. Rellénalo a mano.');
}

async function buscarPorTexto(q) {
  q = q.trim();
  if (!q) return;
  const cont = $('#resultados');
  cont.innerHTML = '<p class="cargando">Buscando…</p>';
  let lista = [];
  try {
    const d = await (await fetchT(`${OL}/search.json?` + new URLSearchParams({
      q, fields: 'title,author_name,first_publish_year,cover_i,isbn,number_of_pages_median', limit: '20'
    }))).json();
    lista = (d.docs || []).map(x => ({
      titulo: x.title, autor: (x.author_name || []).join(', '), anio: x.first_publish_year || '',
      paginas: x.number_of_pages_median || '', isbn: elegirIsbn(x.isbn),
      portada: x.cover_i ? `https://covers.openlibrary.org/b/id/${x.cover_i}-M.jpg` : ''
    }));
  } catch (e) { console.warn('Open Library:', e.message); }
  if (!lista.length) lista = await googleBooks(q);

  if (!lista.length) {
    cont.innerHTML = '<p class="vacio">Sin resultados. Prueba con otras palabras o <a href="#" data-manual>añádelo a mano</a>.</p>';
    return;
  }
  cont._datos = lista;
  cont.innerHTML = lista.map((x, i) => `
    <article class="libro" data-resultado="${i}">
      ${portadaHTML(x)}
      <div class="info">
        <h3>${esc(x.titulo)}</h3>
        <p>${esc(x.autor)}${x.anio ? ' · ' + esc(x.anio) : ''}</p>
      </div>
    </article>`).join('');
}

// Google Books: por la hoja (con clave propia) si está conectada; si no, directo
// (sin clave la cuota compartida suele estar agotada, pero no cuesta intentarlo).
async function googleBooks(q) {
  try {
    let datos;
    if (conectado()) {
      const r = await apiGet({ accion: 'googleBooks', q });
      if (!r.ok) return [];
      datos = r.datos;
    } else {
      const r = await fetchT('https://www.googleapis.com/books/v1/volumes?maxResults=15&q=' + encodeURIComponent(q));
      if (!r.ok) return [];
      datos = await r.json();
    }
    return (datos.items || []).map(it => {
      const v = it.volumeInfo || {};
      const ids = (v.industryIdentifiers || []).map(x => x.identifier);
      return {
        titulo: v.title + (v.subtitle ? '. ' + v.subtitle : ''), autor: (v.authors || []).join(', '),
        editorial: v.publisher || '', anio: (v.publishedDate || '').slice(0, 4), paginas: v.pageCount || '',
        isbn: elegirIsbn(ids),
        portada: ((v.imageLinks || {}).thumbnail || '').replace('http://', 'https://')
      };
    });
  } catch (e) {
    console.warn('Google Books:', e.message);
    return [];
  }
}

// ── ESCÁNER (BarcodeDetector: Chrome en Android) ──

async function iniciarEscaner() {
  if (!('BarcodeDetector' in window)) {
    toast('Este navegador no puede escanear. Escribe el ISBN (los números bajo el código de barras).', { ms: 6000 });
    $('#inputIsbn').focus();
    return;
  }
  try {
    const detector = new BarcodeDetector({ formats: ['ean_13'] });
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    const video = $('#video');
    video.srcObject = stream;
    await video.play();
    $('#escaner').hidden = false;
    escaner = { stream, timer: setInterval(async () => {
      try {
        const codigos = await detector.detect(video);
        const isbn = codigos.map(c => c.rawValue).find(v => /^97[89]\d{10}$/.test(v));
        if (isbn) {
          pararEscaner();
          if (navigator.vibrate) navigator.vibrate(80);
          $('#inputIsbn').value = isbn;
          buscarPorIsbn(isbn);
        }
      } catch (e) { /* fotograma sin código */ }
    }, 250) };
  } catch (e) {
    toast('No se pudo abrir la cámara: ' + esc(e.message), { ms: 5000 });
  }
}

function pararEscaner() {
  if (!escaner) return;
  clearInterval(escaner.timer);
  escaner.stream.getTracks().forEach(t => t.stop());
  escaner = null;
  $('#escaner').hidden = true;
}

// ── NAVEGACIÓN Y MODAL ──────────────────────

const NOMBRES_SECCION = { screenBiblioteca: 'Biblioteca', screenAnadir: 'Añadir', screenSagas: 'Sagas', screenAjustes: 'Ajustes' };

function irA(id) {
  if (id !== 'screenAnadir') pararEscaner();
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id));
  document.querySelectorAll('nav.bottom button').forEach(b => b.classList.toggle('active', b.dataset.screen === id));
  $('#nombreSeccion').textContent = NOMBRES_SECCION[id] || '';
  window.scrollTo(0, 0);
}

// El modal ocupa una entrada del historial: el botón "atrás" de Android lo cierra
function abrirModal(html) {
  $('#modalHoja').innerHTML = html;
  $('#modal').hidden = false;
  $('#modalHoja').scrollTop = 0;
  if (!modalAbierto) { history.pushState({ modal: true }, ''); modalAbierto = true; }
}
function cerrarModal() { if (modalAbierto) history.back(); }
window.addEventListener('popstate', () => {
  if (modalAbierto) { modalAbierto = false; $('#modal').hidden = true; $('#modalHoja').innerHTML = ''; }
});

const ic = (nombre, relleno) => `<span class="ic${relleno ? ' relleno' : ''}">${nombre}</span>`;

// ── RENDER: BIBLIOTECA ──────────────────────

function portadaHTML(l, clase) {
  const iniciales = esc(String(l.titulo || '?').replace(/^(el|la|los|las|the) /i, '').slice(0, 2).toUpperCase());
  return `<div class="portada ${clase || ''}" style="--h:${tono(l.titulo)}">
    <span>${iniciales}</span>
    ${l.portada ? `<img src="${esc(l.portada)}" alt="" loading="lazy" onerror="this.remove()">` : ''}
  </div>`;
}

function badgesLibro(l) {
  const b = [];
  const s = sagaDe(l);
  if (s) b.push(`<span class="badge serie">${esc(s.nombre)}${l.saga_num !== '' ? ' #' + l.saga_num : ''}</span>`);
  if (!l.tengo) b.push('<span class="badge deseado">Lo quiero</span>');
  else b.push(`<span class="badge ${l.lectura}">${ESTADOS[l.lectura]}</span>`);
  if (l.prestado_a) b.push('<span class="badge prestado">Prestado</span>');
  return b.join('');
}

function tarjetaLibro(l) {
  const izq = l.prestado_a ? `${ic('local_library')}A ${esc(l.prestado_a)}`
            : l.ubicacion  ? `${ic('shelves')}${esc(l.ubicacion)}` : '';
  const der = l.lectura === 'leyendo' && l.pagina ? `Pág. ${esc(l.pagina)}` : esc(l.anio);
  return `<article class="libro" data-libro="${esc(l.id)}">
    ${portadaHTML(l)}
    <div class="info">
      <div class="badges">${badgesLibro(l)}</div>
      <h3>${esc(l.titulo)}</h3>
      <p>${esc(l.autor)}</p>
      ${izq || der ? `<div class="pie"><span>${izq}</span><span>${der}</span></div>` : ''}
    </div>
  </article>`;
}

function porcentaje(l) {
  const p = Number(l.paginas), a = Number(l.pagina);
  return p && a ? Math.min(100, Math.round(a / p * 100)) : 0;
}

function tarjetaLeyendo(l) {
  const pct = porcentaje(l);
  return `<div class="leyendo-card">
    <div data-libro="${esc(l.id)}">${portadaHTML(l)}</div>
    <div class="cuerpo">
      <div data-libro="${esc(l.id)}">
        <div class="etiqueta">${pct ? 'En progreso · ' + pct + '%' : 'Leyendo'}</div>
        <h3>${esc(l.titulo)}</h3>
        <div class="autor">${esc(l.autor)}</div>
        ${l.paginas ? `<div class="pags">${ic('menu_book')}Pág. ${esc(l.pagina || 0)} de ${esc(l.paginas)}</div>` : ''}
      </div>
      ${l.paginas ? `<div class="barra"><div style="width:${pct}%"></div></div>` : ''}
      <div class="fila">
        <button class="btn" data-sumar-paginas="${esc(l.id)}" data-n="10">+10 págs.</button>
        <button class="btn secundario cuadrado" data-terminar="${esc(l.id)}" aria-label="Marcar como leído">${ic('done_all')}</button>
      </div>
    </div>
  </div>`;
}

function renderBiblioteca() {
  const q = norm($('#buscador').value);
  const orden = { leyendo: 0, pendiente: 1, leido: 2, abandonado: 3 };
  const lista = libros
    .filter(FILTROS[filtro])
    .filter(l => !q || norm([l.titulo, l.autor, l.ubicacion, (sagaDe(l) || {}).nombre].join(' ')).includes(q))
    .sort((a, b) => (orden[a.lectura] - orden[b.lectura]) || String(b.actualizado).localeCompare(String(a.actualizado)));

  // Chips con contador
  const nombres = { todos: 'Todos', leyendo: 'Leyendo', pendiente: 'Por leer', leido: 'Leídos', deseado: 'Deseos', prestado: 'Prestados' };
  $('#chips').innerHTML = Object.keys(FILTROS).map(k =>
    `<button data-filtro="${k}" class="${k === filtro ? 'active' : ''}">${nombres[k]}<span class="n">${libros.filter(FILTROS[k]).length}</span></button>`).join('');

  // Resumen: métricas, sagas con huecos y lo que estoy leyendo
  let panel = '';
  if (libros.length) {
    const tengo = libros.filter(l => l.tengo).length;
    const leyendo = libros.filter(l => l.lectura === 'leyendo');
    const leidos = libros.filter(l => l.lectura === 'leido').length;
    panel += `<div class="metricas">
      <div class="metrica"><div class="et">Total</div><div class="num">${tengo}</div><div class="sub">En casa</div></div>
      <div class="metrica activa"><div class="et">Activos</div><div class="num">${leyendo.length}</div><div class="sub">Leyendo</div></div>
      <div class="metrica"><div class="et">Completos</div><div class="num">${leidos}</div><div class="sub">Leídos</div></div>
    </div>`;

    const conHuecos = sagas.map(s => ({ s, p: progresoSaga(s) })).filter(x => x.p.faltanTener > 0);
    if (conHuecos.length) {
      const total = conHuecos.reduce((n, x) => n + x.p.faltanTener, 0);
      const nombresSagas = conHuecos.map(x => x.s.nombre);
      panel += `<button class="alerta-sagas" data-ir="screenSagas">
        <span class="cuadro">${ic('bookmark_border')}</span>
        <span class="txt">
          <strong>${total === 1 ? 'Te falta 1 libro' : 'Te faltan ' + total + ' libros'} de tus sagas</strong>
          <span class="detalle-alerta">${esc(nombresSagas.slice(0, 2).join(', '))}${nombresSagas.length > 2 ? ' y ' + (nombresSagas.length - 2) + ' más' : ''}</span>
        </span>
        ${ic('arrow_forward')}
      </button>`;
    }

    if (leyendo.length && filtro === 'todos' && !q) {
      panel += `<div class="titulo-seccion"><h2>Leyendo ahora</h2>${leyendo.length > 1 ? `<span>${leyendo.length} libros</span>` : ''}</div>`;
      panel += leyendo.slice(0, 2).map(tarjetaLeyendo).join('');
      panel += `<div class="titulo-seccion"><h2>Mi estantería</h2><span>${lista.length} de ${libros.length}</span></div>`;
    }
  }
  $('#panelResumen').innerHTML = panel;
  $('#panelResumen').hidden = !panel;

  $('#listaLibros').innerHTML = lista.length ? lista.map(tarjetaLibro).join('') :
    libros.length ? '<p class="vacio">Nada por aquí con ese filtro.</p>' :
    `<div class="bienvenida">
       ${ic('auto_stories')}
       <h2>Tu biblioteca está vacía</h2>
       <p>Escanea el código de barras de un libro para empezar.</p>
       <button class="btn" data-ir="screenAnadir">${ic('library_add')}Añadir el primer libro</button>
     </div>`;
}

// ── RENDER: DETALLE DE UN LIBRO ─────────────

function ubicacionesConocidas() {
  const cuenta = {};
  libros.forEach(l => { if (l.ubicacion) cuenta[l.ubicacion] = (cuenta[l.ubicacion] || 0) + 1; });
  return Object.keys(cuenta).sort((a, b) => cuenta[b] - cuenta[a]).slice(0, 8);
}

function chipsUbicacion(actual, atributo) {
  return ubicacionesConocidas().map(u =>
    `<button ${atributo}="${esc(u)}" class="${u === actual ? 'active' : ''}">${esc(u)}</button>`).join('');
}

const ICONOS = { leido: 'check_circle', leyendo: 'auto_stories', tengo: 'menu_book', deseado: 'favorite', falta: 'bookmark_border' };
const TEXTOS = { leido: 'Leído', leyendo: 'Leyendo', tengo: 'En casa', deseado: 'En deseos', falta: 'Te falta' };

// "Harry Potter y la cámara secreta" dentro de la saga Harry Potter → "La cámara secreta"
function tituloCorto(titulo, saga) {
  const t = String(titulo);
  // Prefijo literal (no normalizado): con artículos o tildes distintas el corte caería mal
  if (!t.toLowerCase().startsWith(String(saga).toLowerCase()) || t.length === saga.length) return t;
  const resto = t.slice(saga.length).replace(/^[\s.:,\-–—]*(y\s+)?/i, '');
  return resto ? resto.charAt(0).toUpperCase() + resto.slice(1) : t;
}

function estantesSaga(s, actualId) {
  return `<div class="estantes">${progresoSaga(s).filas.map(f => {
    const actual = f.libro && f.libro.id === actualId;
    return `<div class="estante ${f.estado}${actual ? ' actual' : ''}" title="${esc(f.titulo)}">
      ${ic(ICONOS[f.estado], f.estado === 'leido')}
      <span class="t">${f.num !== '' ? esc(f.num) + '. ' : ''}${esc(tituloCorto(f.titulo, s.nombre))}</span>
      <span class="e">${actual ? 'Este' : TEXTOS[f.estado]}</span>
    </div>`;
  }).join('')}</div>`;
}

function abrirDetalle(id) {
  const l = libroPorId(id);
  if (!l) return;
  const s = sagaDe(l);
  const pct = porcentaje(l);

  let bloqueSaga;
  if (s) {
    const p = progresoSaga(s);
    bloqueSaga = `<div class="bloque caja-saga" data-abrir-saga="${esc(s.id)}">
      <div class="cab-bloque"><span>${ic('collections_bookmark')}Saga</span><span>${l.saga_num !== '' ? 'Libro ' + esc(l.saga_num) + ' de ' + p.total : p.total + ' libros'}</span></div>
      <h3>${esc(s.nombre)}</h3>
      <p class="meta">${textoFaltan(p).replace(/^./, c => c.toUpperCase())}</p>
      ${estantesSaga(s, l.id)}
    </div>`;
  } else {
    bloqueSaga = `<button class="btn secundario" data-buscar-saga="${esc(l.id)}">${ic('travel_explore')}¿Es parte de una saga?</button>`;
  }

  const bloqueProgreso = l.lectura === 'leyendo' ? `
    <div class="bloque">
      <div class="cab-bloque"><span>${ic('menu_book')}Progreso</span><span>${pct ? pct + '%' : ''}</span></div>
      ${l.paginas ? `<div class="barra"><div style="width:${pct}%"></div></div>` : ''}
      <div class="progreso-lectura">
        <div class="fila"><span>Página <strong>${esc(l.pagina || 0)}</strong>${l.paginas ? ' de ' + esc(l.paginas) : ''}</span>
        ${l.paginas && l.pagina ? `<span>Faltan ${Math.max(0, l.paginas - l.pagina)} págs.</span>` : ''}</div>
        <div class="pasos">
          <button data-sumar-paginas="${esc(l.id)}" data-n="10">+10</button>
          <button data-sumar-paginas="${esc(l.id)}" data-n="25">+25</button>
          <input type="number" inputmode="numeric" data-campo="pagina" value="${esc(l.pagina)}" placeholder="Página" aria-label="Página actual">
        </div>
      </div>
    </div>` : '';

  abrirModal(`
    <div class="detalle" data-id="${esc(l.id)}">
      <div class="cabecera">
        ${portadaHTML(l, 'grande')}
        <div>
          <h2>${esc(l.titulo)}</h2>
          <p class="autor">${esc(l.autor)}</p>
          <p class="meta">${[l.editorial, l.anio, l.paginas ? l.paginas + ' págs.' : ''].filter(Boolean).map(esc).join(' · ')}</p>
          <div class="estrellas" data-campo="valoracion">
            ${[1, 2, 3, 4, 5].map(n => `<button data-valor="${n}" class="${l.valoracion >= n ? 'on' : ''}" aria-label="${n} estrellas">${ic('star', true)}</button>`).join('')}
          </div>
        </div>
      </div>

      <div class="segmentado" data-campo="tengo">
        <button data-valor="true"  class="${l.tengo ? 'active' : ''}">${ic('menu_book')}Lo tengo</button>
        <button data-valor="false" class="${!l.tengo ? 'active' : ''}">${ic('favorite')}Lo quiero</button>
      </div>

      <div class="segmentado" data-campo="lectura">
        ${Object.entries(ESTADOS).map(([k, v]) => `<button data-valor="${k}" class="${l.lectura === k ? 'active' : ''}">${v}</button>`).join('')}
      </div>

      ${bloqueProgreso}
      ${bloqueSaga}

      <div class="bloque">
        <div class="cab-bloque"><span>${ic('shelves')}En casa</span></div>
        <label>Ubicación <input data-campo="ubicacion" value="${esc(l.ubicacion)}" placeholder="Ej. Salón, balda 3"></label>
        <div class="chips-ubicacion">${chipsUbicacion(l.ubicacion, 'data-poner-ubicacion')}</div>
        <label>Prestado a <input data-campo="prestado_a" value="${esc(l.prestado_a)}" placeholder="Nadie"></label>
        <label>Notas <textarea data-campo="notas" rows="3" placeholder="Regalo, edición firmada, lo que quieras recordar…">${esc(l.notas)}</textarea></label>
      </div>

      <details>
        <summary>Editar datos del libro</summary>
        <label>Título <input data-campo="titulo" value="${esc(l.titulo)}"></label>
        <label>Autor <input data-campo="autor" value="${esc(l.autor)}"></label>
        <label>Nº en la saga <input data-campo="saga_num" type="number" min="0" step="0.5" value="${esc(l.saga_num)}"></label>
        <label>Páginas <input data-campo="paginas" type="number" value="${esc(l.paginas)}"></label>
        <label>Portada (URL) <input data-campo="portada" value="${esc(l.portada)}"></label>
        <p class="meta">${l.isbn ? 'ISBN ' + esc(l.isbn) : ''}</p>
      </details>

      <div class="acciones">
        <button class="btn peligro" data-borrar-libro="${esc(l.id)}">${ic('delete')}Borrar</button>
        <button class="btn" data-cerrar>Hecho</button>
      </div>
    </div>`);
}

function cambiarCampo(id, campo, valor) {
  const l = libroPorId(id);
  if (!l) return;
  const antes = l.lectura;
  if (campo === 'tengo') valor = valor === 'true';
  if (campo === 'valoracion') valor = l.valoracion === Number(valor) ? 0 : Number(valor);
  if (['saga_num', 'pagina', 'paginas'].includes(campo)) valor = valor === '' ? '' : Number(valor);
  l[campo] = valor;
  if (campo === 'lectura' && valor === 'leido') {
    if (!l.fin) l.fin = ahora().slice(0, 10);
    if (l.paginas) l.pagina = l.paginas;
  }
  guardarLibro(l);

  if (['tengo', 'lectura', 'valoracion', 'pagina', 'ubicacion'].includes(campo) && modalAbierto) abrirDetalle(id);
  // Al empezar o terminar un libro: avisar de la saga (o buscarla)
  if (campo === 'lectura' && valor !== antes && (valor === 'leyendo' || valor === 'leido')) avisarSaga(l, true);
}

function sumarPaginas(id, n) {
  const l = libroPorId(id);
  if (!l) return;
  let p = (Number(l.pagina) || 0) + n;
  if (l.paginas) p = Math.min(p, Number(l.paginas));
  l.pagina = p;
  guardarLibro(l);
  if (modalAbierto) abrirDetalle(id);
  if (l.paginas && p >= l.paginas) toast('¿Terminado? Toca aquí para marcarlo como leído', { ms: 6000, accion: () => cambiarCampo(id, 'lectura', 'leido') });
}

// ── SAGAS ───────────────────────────────────

function libroDeEntrada(s, e) {
  return libros.find(l => l.saga_id === s.id && l.saga_num !== '' && Number(l.saga_num) === Number(e.num)) ||
         libros.find(l => (!l.saga_id || l.saga_id === s.id) && mismoTitulo(l.titulo, e.titulo));
}

function progresoSaga(s) {
  const filas = [...s.libros].sort((a, b) => (a.num === '' ? 999 : a.num) - (b.num === '' ? 999 : b.num))
    .map(e => {
      const l = libroDeEntrada(s, e);
      const estado = !l ? 'falta' : l.lectura === 'leido' ? 'leido' : l.lectura === 'leyendo' ? 'leyendo' : l.tengo ? 'tengo' : 'deseado';
      return { ...e, libro: l, estado };
    });
  const leidos = filas.filter(f => f.estado === 'leido').length;
  const tienes = filas.filter(f => f.libro && f.libro.tengo).length;
  return { filas, total: filas.length, leidos, tienes, faltanLeer: filas.length - leidos, faltanTener: filas.length - tienes };
}

function textoFaltan(p) {
  if (p.faltanLeer === 0) return '¡saga terminada! 🎉';
  // Si estás leyendo uno, lo natural es contar lo que queda después de ese
  const leyendo = p.filas.filter(f => f.estado === 'leyendo').length;
  const quedan = p.faltanLeer - leyendo;
  let t;
  if (leyendo && quedan === 0) t = 'es el último que te queda';
  else if (leyendo)           t = `después de este, te ${quedan === 1 ? 'queda 1 más' : 'quedan ' + quedan + ' más'}`;
  else                        t = `te ${p.faltanLeer === 1 ? 'falta 1' : 'faltan ' + p.faltanLeer} por leer`;
  if (p.faltanTener) t += ` (${p.faltanTener === 1 ? '1 no lo tienes' : p.faltanTener + ' no los tienes'})`;
  return t;
}

function barra(p) {
  const pct = p.total ? Math.round(p.leidos / p.total * 100) : 0;
  return `<div class="barra${pct === 100 ? ' completa' : ''}"><div style="width:${pct}%"></div></div>`;
}

// El aviso central de la app: "tienes el 1 de Harry Potter → te faltan 6"
function avisarSaga(l, buscarSiNo) {
  const s = sagaDe(l);
  if (s) {
    const p = progresoSaga(s);
    const pos = l.saga_num !== '' ? `libro ${l.saga_num} de ${p.total}` : `${p.total} libros`;
    toast(`📚 <b>${esc(s.nombre)}</b>: ${pos}. ${textoFaltan(p).replace(/^./, c => c.toUpperCase())}.<small>Toca para ver la saga</small>`,
      { ms: 8000, accion: () => abrirSaga(s.id) });
  } else if (buscarSiNo && !l.saga_buscada) {
    comprobarSaga(l, false);
  }
}

function vincular(l, s, num) {
  l.saga_id = s.id;
  l.saga_num = num === '' || num == null ? '' : Number(num);
}

async function comprobarSaga(l, manual) {
  // 1. ¿Encaja en una saga que ya tengo guardada?
  for (const s of sagas) {
    const e = s.libros.find(e => mismoTitulo(e.titulo, l.titulo));
    if (e) {
      vincular(l, s, e.num);
      guardarLibro(l);
      avisarSaga(l, false);
      if (manual) abrirDetalle(l.id);
      return;
    }
  }

  // 2. Buscar fuera
  toast('🔍 Buscando si «' + esc(l.titulo) + '» es parte de una saga…', { ms: 0 });
  let propuesta = null;
  try { propuesta = await descubrirSaga(l); } catch (e) { console.warn(e); }
  l.saga_buscada = true;
  guardarLibro(l);

  if (propuesta) {
    ocultarToast();
    abrirEditorSaga(propuesta, l);
  } else if (manual) {
    toast('No he encontrado ninguna saga. Toca aquí para crearla a mano.', {
      ms: 6000, accion: () => abrirEditorSaga({ nombre: '', autor: l.autor, fuente: 'manual', libros: [{ titulo: l.titulo, num: 1, incluir: true }] }, l)
    });
  } else {
    ocultarToast();
  }
}

// Editor de saga: sirve para revisar una propuesta, crear una a mano o editar una guardada
function abrirEditorSaga(saga, libro) {
  const esPropuesta = !saga.id && saga.fuente !== 'manual';
  const avisos = {
    wikidata:    'Lista sacada de Wikidata. Los desmarcados son extras (precuelas, obras de teatro…): márcalos si quieres contarlos.',
    openlibrary: 'Lista aproximada de Open Library: desmarca lo que no sea de la saga y corrige el orden si hace falta.',
    manual:      'Escribe los libros de la saga en orden.'
  };
  const marcado = libro ? saga.libros.findIndex(e => mismoTitulo(e.titulo, libro.titulo)) : -1;

  const fila = (e, i) => `
    <div class="fila-ed">
      <input type="checkbox" class="inc" ${e.incluir !== false ? 'checked' : ''} aria-label="Incluir">
      <input type="number" class="num" value="${esc(e.num)}" min="0" step="0.5" aria-label="Número">
      <input class="tit" value="${esc(e.titulo)}" placeholder="Título">
      ${libro ? `<label class="este" title="Este es el libro que tengo"><input type="radio" name="este" ${i === marcado ? 'checked' : ''}>es este</label>` : ''}
    </div>`;

  abrirModal(`
    <div class="editor-saga">
      <h2>${esPropuesta ? '📚 ¡Hay más libros!' : saga.id ? 'Editar saga' : 'Nueva saga'}</h2>
      ${esPropuesta && libro ? `<p>«${esc(libro.titulo)}» parece parte de <b>${esc(saga.nombre)}</b>, con ${saga.libros.filter(e => e.incluir !== false).length} libros.</p>` : ''}
      <p class="sub">${avisos[saga.fuente] || avisos.manual}</p>
      <label>Nombre de la saga <input id="edNombre" value="${esc(saga.nombre)}"></label>
      <label>Autor <input id="edAutor" value="${esc(saga.autor)}"></label>
      <div id="edFilas">${saga.libros.map(fila).join('')}</div>
      <button class="btn-link" id="edAnadirFila">+ Añadir un libro</button>
      <div class="acciones">
        ${saga.id ? `<button class="btn peligro" data-borrar-saga="${esc(saga.id)}">${ic('delete')}Borrar</button>` : ''}
        <button class="btn secundario" data-cerrar>${esPropuesta ? 'No es una saga' : 'Cancelar'}</button>
        <button class="btn" id="edGuardar">Guardar saga</button>
      </div>
    </div>`);

  $('#edAnadirFila').onclick = () => {
    const nums = [...document.querySelectorAll('#edFilas .num')].map(x => Number(x.value) || 0);
    $('#edFilas').insertAdjacentHTML('beforeend', fila({ titulo: '', num: (Math.max(0, ...nums) + 1), incluir: true }, -1));
    $('#edFilas .fila-ed:last-child .tit').focus();
  };

  $('#edGuardar').onclick = () => {
    const nombre = $('#edNombre').value.trim();
    if (!nombre) { toast('Ponle un nombre a la saga'); return; }
    let numEste = null;
    const lista = [];
    document.querySelectorAll('#edFilas .fila-ed').forEach(f => {
      const titulo = f.querySelector('.tit').value.trim();
      const num = f.querySelector('.num').value === '' ? '' : Number(f.querySelector('.num').value);
      const radio = f.querySelector('input[name=este]');
      if (radio && radio.checked) numEste = num;
      if (titulo && f.querySelector('.inc').checked) lista.push({ titulo, num });
    });
    if (lista.length < 1) { toast('La saga necesita al menos un libro'); return; }
    lista.sort((a, b) => (a.num === '' ? 999 : a.num) - (b.num === '' ? 999 : b.num));

    const s = normalizarSaga({
      id: saga.id || uid(), nombre, autor: $('#edAutor').value.trim(),
      fuente: saga.fuente || 'manual', wikidata: saga.wikidata || '', libros: lista
    });
    guardarSaga(s);

    if (libro && numEste !== null) { vincular(libro, s, numEste); guardarLibro(libro); }
    // Enlazar otros libros que ya tuviera de esta saga
    libros.filter(l => !l.saga_id).forEach(l => {
      const e = s.libros.find(e => mismoTitulo(e.titulo, l.titulo));
      if (e) { vincular(l, s, e.num); guardarLibro(l); }
    });

    cerrarModal();
    if (libro && libro.saga_id === s.id) setTimeout(() => avisarSaga(libro, false), 300);
    else toast('Saga guardada');
  };
}

const FILTROS_SAGA = {
  todas:      { nombre: 'Todas',        f: () => true },
  faltan:     { nombre: 'Te faltan',    f: p => p.faltanTener > 0 },
  porleer:    { nombre: 'Por terminar', f: p => p.faltanLeer > 0 },
  terminadas: { nombre: 'Terminadas',   f: p => p.faltanLeer === 0 }
};
let filtroSagas = 'todas';

function renderSagas() {
  const cont = $('#listaSagas');
  const todas = sagas.map(s => ({ s, p: progresoSaga(s) }));
  $('#chipsSagas').innerHTML = sagas.length ? Object.entries(FILTROS_SAGA).map(([k, v]) =>
    `<button data-filtro-saga="${k}" class="${k === filtroSagas ? 'active' : ''}">${v.nombre}<span class="n">${todas.filter(x => v.f(x.p)).length}</span></button>`).join('') : '';

  if (!sagas.length) {
    cont.innerHTML = `<div class="bienvenida">
      ${ic('collections_bookmark')}
      <h2>Aún no hay sagas</h2>
      <p>Se crean solas cuando añades o empiezas un libro que forma parte de una. También puedes crear una a mano.</p>
    </div>`;
    return;
  }
  const lista = todas.filter(x => FILTROS_SAGA[filtroSagas].f(x.p))
    .sort((a, b) => (a.p.faltanLeer === 0) - (b.p.faltanLeer === 0) || a.s.nombre.localeCompare(b.s.nombre));
  cont.innerHTML = lista.length ? lista.map(({ s, p }) => {
    const faltan = p.filas.filter(f => f.estado === 'falta').map(f => f.titulo);
    const pct = p.total ? Math.round(p.leidos / p.total * 100) : 0;
    return `<article class="saga" data-abrir-saga="${esc(s.id)}">
      <div class="cab">
        <div>
          <h3>${esc(s.nombre)}</h3>
          <p class="autor">${esc(s.autor)}</p>
        </div>
        ${p.faltanLeer === 0 ? `<span class="badge leido">${ic('task_alt')}Terminada</span>` :
          p.faltanTener ? `<span class="badge deseado">${p.faltanTener === 1 ? 'Falta 1' : 'Faltan ' + p.faltanTener}</span>` : ''}
      </div>
      ${barra(p)}
      <div class="cifras"><span>Leídos ${p.leidos} de ${p.total} · ${p.tienes} en casa</span><span class="pct">${pct}%</span></div>
      ${faltan.length ? `<div class="faltan">${ic('bookmark_border')}<span>Te falta: <b>${faltan.slice(0, 2).map(esc).join('</b> y <b>')}</b>${faltan.length > 2 ? ' y ' + (faltan.length - 2) + ' más' : ''}</span></div>` : ''}
    </article>`;
  }).join('') : '<p class="vacio">Ninguna saga con ese filtro.</p>';
}

function abrirSaga(id) {
  const s = sagaPorId(id);
  if (!s) return;
  const p = progresoSaga(s);
  abrirModal(`
    <div class="vista-saga">
      <h2>${esc(s.nombre)}</h2>
      <p class="autor">${esc(s.autor)}</p>
      ${barra(p)}
      <p class="meta">Leídos ${p.leidos} de ${p.total} · ${p.tienes} en casa · ${textoFaltan(p)}</p>
      <ol class="filas-saga">
        ${p.filas.map((f, i) => `
          <li class="${f.estado}">
            <span class="icono">${ic(ICONOS[f.estado], f.estado === 'leido')}</span>
            <span class="n">${f.num === '' ? '·' : esc(f.num)}</span>
            <span class="t" ${f.libro ? `data-libro="${esc(f.libro.id)}"` : ''}>${esc(f.titulo)}<small>${TEXTOS[f.estado]}</small></span>
            ${f.libro ? '' : `
              <span class="botones">
                <button data-crear-de-saga="${i}" data-tengo="true" title="Lo tengo">${ic('add')}Lo tengo</button>
                <button data-crear-de-saga="${i}" data-tengo="false" class="suave" title="Lo quiero">${ic('favorite')}</button>
              </span>`}
          </li>`).join('')}
      </ol>
      <div class="acciones">
        <button class="btn secundario" data-editar-saga="${esc(s.id)}">${ic('edit_note')}Editar</button>
        <button class="btn" data-cerrar>Cerrar</button>
      </div>
    </div>`);
  $('#modalHoja').dataset.saga = s.id;
}

function crearDesdeSaga(sagaId, indice, tengo) {
  const s = sagaPorId(sagaId);
  const f = progresoSaga(s).filas[indice];
  if (!f) return;
  const l = normalizarLibro({
    id: uid(), titulo: f.titulo, autor: s.autor, tengo, lectura: 'pendiente',
    saga_id: s.id, saga_num: f.num, saga_buscada: true, alta: ahora()
  });
  guardarLibro(l);
  toast(tengo ? '📗 Añadido a tu biblioteca' : '♡ Añadido a tus deseos');
  abrirSaga(sagaId);
}

// ── AÑADIR ──────────────────────────────────

function abrirPreview(d, aviso) {
  const duplicado = libros.find(l => (d.isbn && l.isbn === d.isbn) || (d.titulo && mismoTitulo(l.titulo, d.titulo) && mismoAutor(l.autor, d.autor)));
  abrirModal(`
    <div class="preview">
      ${aviso ? `<p class="aviso">${esc(aviso)}</p>` : ''}
      ${duplicado ? `<p class="aviso">Ya tienes «${esc(duplicado.titulo)}» en tu biblioteca.</p>` : ''}
      <div class="cabecera">
        ${portadaHTML(d, 'grande')}
        <div class="campos">
          <label>Título <input id="pvTitulo" value="${esc(d.titulo)}"></label>
          <label>Autor <input id="pvAutor" value="${esc(d.autor)}"></label>
        </div>
      </div>
      <p class="meta">${[d.editorial, d.anio, d.paginas ? d.paginas + ' págs.' : '', d.isbn ? 'ISBN ' + d.isbn : ''].filter(Boolean).map(esc).join(' · ')}</p>
      <div class="segmentado" id="pvTengo">
        <button data-valor="true" class="active">${ic('menu_book')}Lo tengo</button>
        <button data-valor="false">${ic('favorite')}Lo quiero</button>
      </div>
      <div class="segmentado" id="pvLectura">
        <button data-valor="pendiente" class="active">Por leer</button>
        <button data-valor="leyendo">Leyendo</button>
        <button data-valor="leido">Ya leído</button>
      </div>
      <label>Ubicación en casa <input id="pvUbicacion" placeholder="Ej. Salón, balda 3 (opcional)"></label>
      <div class="chips-ubicacion" id="pvChipsUbicacion">${chipsUbicacion('', 'data-ubicacion-preview')}</div>
      <div class="acciones">
        <button class="btn secundario" data-cerrar>Cancelar</button>
        <button class="btn" id="pvAnadir">${ic('library_add')}Guardar</button>
      </div>
    </div>`);

  document.querySelectorAll('#pvTengo button, #pvLectura button').forEach(b => b.onclick = () => {
    b.parentElement.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
  });
  document.querySelectorAll('#pvChipsUbicacion button').forEach(b => b.onclick = () => {
    $('#pvUbicacion').value = b.dataset.ubicacionPreview;
    document.querySelectorAll('#pvChipsUbicacion button').forEach(x => x.classList.toggle('active', x === b));
  });

  $('#pvAnadir').onclick = () => {
    const titulo = $('#pvTitulo').value.trim();
    if (!titulo) { toast('Falta el título'); return; }
    const lectura = $('#pvLectura .active').dataset.valor;
    const l = normalizarLibro({
      ...d, id: uid(), titulo, autor: $('#pvAutor').value.trim(),
      tengo: $('#pvTengo .active').dataset.valor === 'true', lectura,
      ubicacion: $('#pvUbicacion').value.trim(),
      alta: ahora(), fin: lectura === 'leido' ? ahora().slice(0, 10) : ''
    });
    guardarLibro(l);
    cerrarModal();
    $('#resultados').innerHTML = '';
    $('#inputIsbn').value = '';
    if (navigator.vibrate) navigator.vibrate([20, 40, 20]);
    toast('✅ «' + esc(l.titulo) + '» guardado');
    setTimeout(() => comprobarSaga(l, false), 400);
  };
}

// ── AJUSTES ─────────────────────────────────

function renderAjustes() {
  if (!$('#cfgUrl').value) $('#cfgUrl').value = config.url || '';
  $('#campoUrl').hidden = !!URL_SCRIPT;
  $('#formPerfil').hidden = conectado();
  $('#bloqueConectado').hidden = !conectado();
  $('#perfilActual').textContent = nombrePerfil(config.perfil);
  if (!conectado() && !$('#cfgPerfil').value) cargarPerfiles();
  pintarSync();
}

function exportar() {
  const datos = { app: 'mi-biblioteca', version: 1, exportado: ahora(), libros, sagas };
  const blob = new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'mi-biblioteca-' + ahora().slice(0, 10) + '.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function importar(fichero) {
  try {
    const d = JSON.parse(await fichero.text());
    if (!Array.isArray(d.libros)) throw new Error('no es una copia de Mi Biblioteca');
    libros = combinar(libros, d.libros.map(normalizarLibro));
    sagas  = combinar(sagas, (d.sagas || []).map(normalizarSaga));
    guardarLocal();
    encolar({ accion: 'subirTodo', libros, sagas });
    renderTodo();
    toast('✅ Copia importada: ' + d.libros.length + ' libros');
  } catch (e) {
    toast('❌ No se pudo importar: ' + esc(e.message), { ms: 5000 });
  }
}

// ── EVENTOS ─────────────────────────────────

function renderTodo() {
  renderBiblioteca();
  renderSagas();
  pintarSync();
}

function engancharEventos() {
  document.querySelectorAll('nav.bottom button').forEach(b => b.onclick = () => irA(b.dataset.screen));

  $('#chips').onclick = e => {
    const b = e.target.closest('button');
    if (!b) return;
    filtro = b.dataset.filtro;
    guardarLS(LS.filtro, filtro);
    renderBiblioteca();
  };
  $('#chipsSagas').onclick = e => {
    const b = e.target.closest('button');
    if (!b) return;
    filtroSagas = b.dataset.filtroSaga;
    renderSagas();
  };
  $('#buscador').oninput = renderBiblioteca;

  $('#btnEscanear').onclick = iniciarEscaner;
  $('#btnPararEscaner').onclick = pararEscaner;
  $('#formIsbn').onsubmit = e => { e.preventDefault(); buscarPorIsbn($('#inputIsbn').value); };
  $('#formTexto').onsubmit = e => { e.preventDefault(); buscarPorTexto($('#inputTexto').value); };
  $('#btnManual').onclick = () => abrirPreview({});
  $('#btnNuevaSaga').onclick = () => abrirEditorSaga({ nombre: '', autor: '', fuente: 'manual', libros: [{ titulo: '', num: 1, incluir: true }] });

  $('#formPerfil').onsubmit = e => { e.preventDefault(); entrarPerfil($('#cfgPerfil').value, $('#cfgPin').value.trim()); };
  $('#cfgUrl').onchange = cargarPerfiles;
  $('#btnSincronizar').onclick = async () => { toast('Sincronizando…', { ms: 0 }); await descargar(); toast(config.error ? '⚠️ ' + esc(config.error) : '☁️ Al día'); };
  $('#btnSalir').onclick = () => {
    if (cola.length && !confirm('Hay ' + cola.length + ' cambios sin enviar a la hoja. Se enviarán cuando vuelvas a entrar. ¿Salir?')) return;
    salirPerfil();
  };
  $('#btnExportar').onclick = exportar;
  $('#inputImportar').onchange = e => { if (e.target.files[0]) importar(e.target.files[0]); e.target.value = ''; };

  $('#modal').onclick = e => { if (e.target.id === 'modal') cerrarModal(); };

  // Delegación: todo lo que se pinta dinámicamente
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-libro],[data-resultado],[data-cerrar],[data-ir],[data-manual],[data-abrir-saga],[data-buscar-saga],[data-borrar-libro],[data-borrar-saga],[data-editar-saga],[data-crear-de-saga],[data-sumar-paginas],[data-terminar],[data-poner-ubicacion],.segmentado[data-campo] button,.estrellas button');
    if (!t) return;
    const ds = t.dataset;

    if (t.matches('.segmentado[data-campo] button, .estrellas button')) {
      const id = t.closest('.detalle').dataset.id;
      cambiarCampo(id, t.parentElement.dataset.campo, ds.valor);
    }
    else if (ds.libro)                   { abrirDetalle(ds.libro); }
    else if (ds.resultado !== undefined) { abrirPreview($('#resultados')._datos[Number(ds.resultado)]); }
    else if (ds.cerrar !== undefined)    { cerrarModal(); }
    else if (ds.ir)                      { irA(ds.ir); }
    else if (ds.manual !== undefined)    { e.preventDefault(); abrirPreview({ titulo: $('#inputTexto').value }); }
    else if (ds.abrirSaga)               { abrirSaga(ds.abrirSaga); }
    else if (ds.buscarSaga)              { comprobarSaga(libroPorId(ds.buscarSaga), true); }
    else if (ds.editarSaga)              { abrirEditorSaga(sagaPorId(ds.editarSaga)); }
    else if (ds.sumarPaginas)            { sumarPaginas(ds.sumarPaginas, Number(ds.n)); }
    else if (ds.terminar)                { cambiarCampo(ds.terminar, 'lectura', 'leido'); }
    else if (ds.ponerUbicacion !== undefined) {
      const id = t.closest('.detalle').dataset.id;
      const l = libroPorId(id);
      cambiarCampo(id, 'ubicacion', l.ubicacion === ds.ponerUbicacion ? '' : ds.ponerUbicacion);
    }
    else if (ds.crearDeSaga !== undefined) {
      crearDesdeSaga($('#modalHoja').dataset.saga, Number(ds.crearDeSaga), ds.tengo === 'true');
    }
    else if (ds.borrarLibro) {
      if (confirm('¿Borrar este libro de tu biblioteca?')) { borrarLibro(ds.borrarLibro); cerrarModal(); }
    }
    else if (ds.borrarSaga) {
      if (confirm('¿Borrar la saga? Los libros se quedan, solo se desvinculan.')) { borrarSaga(ds.borrarSaga); cerrarModal(); }
    }
  });

  // Campos de texto del detalle: se guardan al salir del campo
  document.addEventListener('change', e => {
    const campo = e.target.dataset && e.target.dataset.campo;
    const det = e.target.closest('.detalle');
    if (campo && det) cambiarCampo(det.dataset.id, campo, e.target.value.trim());
  });

  window.addEventListener('online', () => descargar());
}

// ── ARRANQUE ────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  cargarLocal();
  engancharEventos();
  renderTodo();
  renderAjustes();
  // Primera vez en este móvil: directo a elegir perfil
  if (config.url && !conectado() && !libros.length) irA('screenAjustes');
  descargar();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW:', e));
});
