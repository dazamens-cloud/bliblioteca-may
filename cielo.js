// =============================================
// cielo.js - Mi Biblioteca
// Fondo de constelaciones. Parte de network-background.js, adaptado a móvil:
// - canvas FIJO del tamaño de la pantalla (no del documento): el coste no
//   crece con la lista de libros; el scroll mueve las estrellas más despacio
//   que el contenido, como profundidad
// - brillo con una imagen precalculada en vez de shadowBlur
// - 42 estrellas en móvil, 75 en PC; con "reducir movimiento", quieto
// Los colores salen de las variables CSS del tema (--cielo-*).
// =============================================

const Cielo = (() => {
  const movil = matchMedia('(pointer: coarse)').matches || innerWidth < 600;
  const quieto = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const N = movil ? 42 : 75;
  const ENLACE = movil ? 105 : 130;
  const VELOCIDAD = 0.12, PROFUNDIDAD = 0.25;
  const RADIO_RATON = 160, FUERZA_RATON = 0.004;

  let canvas, ctx, w = 0, h = 0, estrellas = [], sprites = {}, tema = {};
  let raton = { x: -9999, y: -9999 }, ultimoScroll = 0, pausado = false;

  function sprite(rgb, brillo) {
    const s = document.createElement('canvas');
    s.width = s.height = 32;
    const g = s.getContext('2d');
    const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    if (brillo) {
      gr.addColorStop(0, `rgba(${rgb},.95)`);
      gr.addColorStop(.25, `rgba(${rgb},.45)`);
      gr.addColorStop(1, `rgba(${rgb},0)`);
    } else {                       // punto de tinta: borde nítido, sin halo
      gr.addColorStop(0, `rgba(${rgb},.9)`);
      gr.addColorStop(.3, `rgba(${rgb},.7)`);
      gr.addColorStop(.36, `rgba(${rgb},0)`);
    }
    g.fillStyle = gr;
    g.fillRect(0, 0, 32, 32);
    return s;
  }

  function leerTema() {
    const css = getComputedStyle(document.documentElement);
    const v = n => css.getPropertyValue(n).trim();
    tema = {
      a: v('--cielo-a') || '226,191,106',
      b: v('--cielo-b') || '180,150,230',
      brillo: v('--cielo-brillo') !== '0',
      linea: Number(v('--cielo-linea')) || .3,
      punto: Number(v('--cielo-punto')) || .95
    };
    sprites = { a: sprite(tema.a, tema.brillo), b: sprite(tema.b, tema.brillo) };
  }

  function medir() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const pw = w, ph = h;
    w = innerWidth; h = innerHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (pw && ph) estrellas.forEach(e => { e.x *= w / pw; e.y *= h / ph; });
  }

  function crear() {
    estrellas = Array.from({ length: N }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - .5) * VELOCIDAD, vy: (Math.random() - .5) * VELOCIDAD,
      r: Math.random() * 1.4 + .8,
      b: Math.random() < .3,              // 30 % en el segundo color
      fase: Math.random() * Math.PI * 2
    }));
  }

  function dibujar(t) {
    ctx.clearRect(0, 0, w, h);
    const dScroll = scrollY - ultimoScroll;
    ultimoScroll = scrollY;

    if (!quieto) estrellas.forEach(e => {
      e.x += e.vx;
      e.y += e.vy - dScroll * PROFUNDIDAD;
      if (e.x < -20) e.x = w + 20; else if (e.x > w + 20) e.x = -20;
      if (e.y < -20) e.y = h + 20; else if (e.y > h + 20) e.y = -20;
      const dx = raton.x - e.x, dy = raton.y - e.y;
      if (Math.hypot(dx, dy) < RADIO_RATON) { e.x -= dx * FUERZA_RATON; e.y -= dy * FUERZA_RATON; }
    });

    ctx.lineWidth = .8;
    for (let i = 0; i < estrellas.length; i++) {
      for (let j = i + 1; j < estrellas.length; j++) {
        const p = estrellas[i], q = estrellas[j];
        const dx = p.x - q.x, dy = p.y - q.y;
        if (Math.abs(dx) > ENLACE || Math.abs(dy) > ENLACE) continue;
        const d = Math.hypot(dx, dy);
        if (d < ENLACE) {
          ctx.strokeStyle = `rgba(${p.b && q.b ? tema.b : tema.a},${(1 - d / ENLACE) * tema.linea})`;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
        }
      }
    }

    estrellas.forEach(e => {
      const d = Math.hypot(raton.x - e.x, raton.y - e.y);
      if (d < RADIO_RATON) {
        ctx.strokeStyle = `rgba(${tema.a},${(1 - d / RADIO_RATON) * .5})`;
        ctx.beginPath(); ctx.moveTo(raton.x, raton.y); ctx.lineTo(e.x, e.y); ctx.stroke();
      }
    });

    estrellas.forEach(e => {
      const tin = quieto ? 1 : .75 + .25 * Math.sin(t / 900 + e.fase);
      const tam = e.r * (tema.brillo ? 7 : 5) * tin;
      ctx.globalAlpha = tema.punto * tin;
      ctx.drawImage(e.b ? sprites.b : sprites.a, e.x - tam / 2, e.y - tam / 2, tam, tam);
    });
    ctx.globalAlpha = 1;
  }

  function bucle(t) {
    if (!pausado) dibujar(t);
    requestAnimationFrame(bucle);
  }

  function iniciar(c) {
    canvas = c;
    ctx = c.getContext('2d');
    leerTema(); medir(); crear();
    ultimoScroll = scrollY;
    addEventListener('resize', medir);
    if (!movil) {
      addEventListener('mousemove', e => { raton.x = e.clientX; raton.y = e.clientY; });
      document.addEventListener('mouseleave', () => { raton.x = raton.y = -9999; });
    }
    if (quieto) dibujar(0); else requestAnimationFrame(bucle);
  }

  // Con una ficha abierta no se ve el fondo: no gastar batería en él
  function pausar(si) {
    pausado = si;
    if (!si) ultimoScroll = scrollY;     // sin salto al volver
  }

  function recolorear() {
    if (!canvas) return;
    leerTema();
    if (quieto || pausado) dibujar(0);
  }

  return { iniciar, pausar, recolorear };
})();

function iniciarCielo(canvas) { Cielo.iniciar(canvas); }
function pausarCielo(si) { Cielo.pausar(si); }
function recolorearCielo() { Cielo.recolorear(); }
