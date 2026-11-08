import { fitText } from './live.js';
// Dibuja el letrero de la transmisión y aplica el diseño de las pantallas.
// Lo usan overlay.html, pantalla.html y el editor de diseño (vista previa).

export const FONTS = {
  jakarta: { name: 'Plus Jakarta Sans', css: '"Plus Jakarta Sans Variable", "Segoe UI", system-ui, sans-serif' },
  fraunces: { name: 'Fraunces (clásica moderna)', css: '"Fraunces Variable", Georgia, serif' },
  inter: { name: 'Inter', css: '"Inter Variable", "Segoe UI", system-ui, sans-serif' },
  cinzel: { name: 'Cinzel (como el logo)', css: '"Cinzel Variable", "Times New Roman", serif' },
  georgia: { name: 'Georgia (clásica)', css: 'Georgia, "Times New Roman", serif' },
  montserrat: { name: 'Montserrat', css: '"Montserrat Variable", system-ui, sans-serif' },
  raleway: { name: 'Raleway (elegante)', css: '"Raleway Variable", system-ui, sans-serif' },
  nunito: { name: 'Nunito (redondeada)', css: '"Nunito Variable", system-ui, sans-serif' },
  oswald: { name: 'Oswald (angosta, para títulos)', css: '"Oswald Variable", "Arial Narrow", sans-serif' },
  lora: { name: 'Lora (para leer)', css: '"Lora Variable", Georgia, serif' },
  sourceserif: { name: 'Source Serif (libro)', css: '"Source Serif 4 Variable", Georgia, serif' },
  playfair: { name: 'Playfair Display (de revista)', css: '"Playfair Display Variable", Georgia, serif' },
  robotoslab: { name: 'Roboto Slab (firme)', css: '"Roboto Slab Variable", Georgia, serif' },
  arial: { name: 'Arial', css: 'Arial, Helvetica, sans-serif' }
};
export const fontCss = id => (FONTS[id] || FONTS.jakarta).css;

export const ANIMS = {
  deslizar: 'Se desliza desde la izquierda', 'deslizar-der': 'Se desliza desde la derecha', subir: 'Sube desde abajo', bajar: 'Baja desde arriba',
  aparecer: 'Aparece suave', crecer: 'Crece', rebote: 'Con rebote', barrido: 'Barrido (se va dibujando)', cortina: 'Cortina (se abre del centro)', desenfoque: 'Desenfoque'
};
export const SPEEDS = { rapida: 0.3, normal: 0.55, lenta: 1 };
// Estilos del letrero de la cabina (además del modo "su propio diseño" con imagen).
export const STYLES = {
  tarjeta: { name: 'Tarjeta', hint: 'con barra de color a un lado' },
  pildora: { name: 'Píldora', hint: 'redonda y compacta' },
  cinta:   { name: 'Cinta', hint: 'barra ancha con línea arriba' },
  cristal: { name: 'Cristal', hint: 'transparente y difuminado' },
  minimal: { name: 'Solo texto', hint: 'sin fondo, con sombra' }
};

export const POSITIONS = {
  'abajo-izq': 'Abajo a la izquierda', 'abajo-centro': 'Abajo al centro', 'abajo-der': 'Abajo a la derecha',
  'arriba-izq': 'Arriba a la izquierda', 'arriba-der': 'Arriba a la derecha',
  'libre': 'Libre (donde lo arrastres)'
};

// Plantilla de un letrero (se usa para el de cantos/citas/tema y para el del expositor).
const lowerThird = ({ position, margin, tag, title }) => ({
  mode: 'default',              // 'default' | 'image'
  style: 'tarjeta',             // ver STYLES
  anim: 'deslizar', speed: 'normal',  // ver ANIMS y SPEEDS
  position, size: 100, margin,  // margin: distancia al borde en px (x horizontal, y vertical)
  free: { x: 100, y: 100 },     // esquina de arriba a la izquierda cuando position = 'libre'
  colors: { bg: '#16231e', accent: '#c2a15a', text: '#ffffff', tagText: '#e6d5a6' },
  font: 'jakarta', tagFont: 'jakarta',
  image: null,                  // { url, w, h, x, y, width }
  tag:   { show: true, w: 420, size: 28, color: '#e6d5a6', font: 'jakarta', weight: 700, align: 'left', upper: true, ...tag },
  title: { show: true, w: 1100, size: 54, color: '#ffffff', font: 'jakarta', weight: 600, align: 'left', upper: false, ...title }
});

export const LAYER_SLOTS = {
  izq:    { name: 'Arriba a la izquierda', hint: 'Otra imagen (por ejemplo, el logo del aniversario)' },
  der:    { name: 'Arriba a la derecha', hint: 'Logo de la iglesia' },
  centro: { name: 'Abajo, a todo lo ancho', hint: 'La imagen central de abajo' }
};

// Cada tipo de letrero tiene su propio diseño, lugar y tamaño.
export const LETREROS = {
  lectura:   { name: 'Cita bíblica', icon: 'biblia', sample: ['Lectura', 'Juan 3:16'] },
  himno:     { name: 'Himno', icon: 'himno', sample: ['Himno 25', 'Un título de himno algo largo'] },
  coro:      { name: 'Coro', icon: 'coro', sample: ['Coro', 'Alabemos con alegría'] },
  tema:      { name: 'Tema', icon: 'tema', sample: ['Tema', 'La fe que vence al mundo'] },
  ubicacion: { name: 'Ubicación', icon: 'ubicacion', sample: ['Transmitiendo desde', 'Colonia, ciudad, estado'] }
};
const bannerDefault = () => lowerThird({ position: 'arriba-der', margin: { x: 70, y: 250 },
  tag: { x: 1180, y: 250 }, title: { x: 1180, y: 292, w: 680 } });

export const DEFAULT_DESIGN = {
  // Cantos, citas, tema y ubicación: de inicio arriba a la derecha, abajo del logo de la iglesia.
  letreros: Object.fromEntries(Object.keys(LETREROS).map(k => [k, bannerDefault()])),
  // Nombre del expositor: abajo a la izquierda, encima de la imagen central.
  speaker: lowerThird({ position: 'abajo-izq', margin: { x: 70, y: 210 },
    tag: { x: 120, y: 720, w: 500 }, title: { x: 120, y: 762, w: 900 } }),
  // Imágenes que siempre están encima de la transmisión.
  layers: { izq: null, der: null, centro: null },  // cada una: { url, w, h, x, y, width }
  screen: {
    bg: 'default',                // 'default' | 'color' | 'image'
    color: '#1f4d3f', image: null, dim: 45,
    font: 'jakarta', titleFont: 'fraunces', text: '#f3f0e8', accent: '#e2c478',
    logo: { show: false, url: null, position: 'arriba-der', size: 180 },
    version: true
  }
};

// Dónde se coloca una imagen fija la primera vez que se sube.
export function placeLayer(slot, w, h) {
  if (slot === 'centro') { const width = 1920; return { x: 0, y: Math.max(0, 1080 - Math.round(width * h / w)), width }; }
  const width = Math.min(320, w);
  return { x: slot === 'izq' ? 40 : 1920 - 40 - width, y: 30, width };
}

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
export const get = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj);
export const set = (obj, path, value) => { const ks = path.split('.'); const last = ks.pop(); ks.reduce((o, k) => (o[k] ??= {}), obj)[last] = value; };
export function mergeDesign(saved) {
  const merge = (a, b) => {
    const out = { ...a };
    for (const [k, v] of Object.entries(b || {})) out[k] = isObj(a[k]) && isObj(v) ? merge(a[k], v) : v;
    return out;
  };
  const src = isObj(saved) ? saved : {};
  const out = merge(DEFAULT_DESIGN, src);
  // Diseños guardados antes tenían un solo letrero ("banner") para todo: sirve de base para cada tipo.
  if (isObj(src.banner)) for (const k of Object.keys(LETREROS)) out.letreros[k] = merge(merge(bannerDefault(), src.banner), src.letreros?.[k] || {});
  delete out.banner;
  // El color de etiqueta viejo (azul oscuro, pensado para una etiqueta dorada) no se lee en la tarjeta nueva.
  for (const lt of [...Object.values(out.letreros), out.speaker]) if (lt?.colors?.tagText === '#061f38') lt.colors.tagText = lt.colors.accent || '#e6d5a6';
  return out;
}

// ---------- Letreros ----------
// stage: un div de 1920x1080. kind: 'banner' (cantos, citas, tema) o 'speaker' (expositor).
// kind: 'banner' o 'speaker' (para estilos). path: dónde vive su diseño, p. ej. 'letreros.himno'.
export function createBanner(stage, { kind = 'banner', path = kind === 'speaker' ? 'speaker' : 'letreros.lectura' } = {}) {
  const root = document.createElement('div');
  root.className = 'lt';
  root.dataset.path = path;
  stage.append(root);
  let design = get(mergeDesign(), path), current = null, swapTimer;
  const base = () => 'lt lt-' + kind;

  function build() {
    root.replaceChildren();
    root.dataset.anim = ANIMS[design.anim] ? design.anim : 'deslizar';
    const dur = () => (SPEEDS[design.speed] ?? SPEEDS.normal);
    if (design.mode === 'image' && design.image?.url) {
      root.className = base() + ' lt-imagen';
      root.removeAttribute('style');
      const img = document.createElement('img');
      img.src = design.image.url; img.alt = ''; img.draggable = false; img.dataset.drag = path + '.image';
      Object.assign(img.style, { left: design.image.x + 'px', top: design.image.y + 'px', width: design.image.width + 'px' });
      root.append(img);
      for (const key of ['tag', 'title']) {
        const t = design[key];
        const box = document.createElement('div');
        box.className = 'lt-txt lt-' + key; box.dataset.key = key; box.dataset.drag = path + '.' + key;
        Object.assign(box.style, { left: t.x + 'px', top: t.y + 'px', width: t.w + 'px', fontSize: t.size + 'px', color: t.color,
          fontFamily: fontCss(t.font), fontWeight: t.weight, textAlign: t.align, textTransform: t.upper ? 'uppercase' : 'none' });
        box.hidden = !t.show;
        root.append(box);
      }
    } else {
      root.className = base() + ' lt-normal pos-' + design.position;
      root.dataset.style = STYLES[design.style] ? design.style : 'tarjeta';
      const c = design.colors;
      root.style.setProperty('--x', (design.margin?.x ?? 70) + 'px'); root.style.setProperty('--y', (design.margin?.y ?? 110) + 'px');
      root.style.setProperty('--fx', (design.free?.x ?? 100) + 'px'); root.style.setProperty('--fy', (design.free?.y ?? 100) + 'px');
      root.style.setProperty('--lt-bg', c.bg); root.style.setProperty('--lt-accent', c.accent);
      root.style.setProperty('--lt-text', c.text); root.style.setProperty('--lt-tag-text', c.tagText);
      root.style.setProperty('--lt-scale', design.size / 100);
      root.style.setProperty('--lt-font', fontCss(design.font)); root.style.setProperty('--lt-tag-font', fontCss(design.tagFont));
      const card = document.createElement('div'); card.className = 'lt-card'; card.dataset.drag = path + '.free';
      const tag = document.createElement('div'); tag.className = 'lt-txt lt-tag'; tag.dataset.key = 'tag'; tag.dataset.drag = path + '.free';
      const title = document.createElement('div'); title.className = 'lt-txt lt-title'; title.dataset.key = 'title'; title.dataset.drag = path + '.free';
      card.append(tag, title);
      root.append(card);
    }
    root.style.setProperty('--lt-dur', dur() + 's');
    if (current) fill(current);
  }

  function fill({ tag, title }) {
    const t = root.querySelector('.lt-tag'), ti = root.querySelector('.lt-title');
    if (t) t.textContent = tag || '';
    if (ti) ti.textContent = title || '';
    if (design.mode === 'image') for (const box of root.querySelectorAll('.lt-txt')) shrinkToWidth(box, design[box.dataset.key].size);
    if (t && design.mode !== 'image') t.hidden = !tag;
  }

  return {
    setDesign(d) { const full = {}; set(full, path, d || {}); design = get(mergeDesign(full), path); build(); },
    show(tag, title, { instant = false } = {}) {
      clearTimeout(swapTimer);
      const next = { tag, title };
      const same = current && current.tag === tag && current.title === title && root.classList.contains('on');
      current = next;
      if (same) return;
      if (root.classList.contains('on') && !instant) {
        root.classList.remove('on');
        swapTimer = setTimeout(() => { fill(next); root.classList.add('on'); }, (SPEEDS[design.speed] ?? SPEEDS.normal) * 1000);
      } else { fill(next); if (instant) root.classList.add('sin-anim'); root.classList.add('on'); }
    },
    hide() { clearTimeout(swapTimer); root.classList.remove('on'); },
    root
  };
}

// Achica la letra de un renglón hasta que quepa en el ancho de su caja.
export function shrinkToWidth(box, max) {
  let size = max;
  box.style.fontSize = size + 'px';
  box.style.whiteSpace = 'nowrap';
  while (box.scrollWidth > box.clientWidth + 1 && size > 12) { size -= 2; box.style.fontSize = size + 'px'; }
}

// ---------- Imágenes fijas (logos) ----------
export function createLayers(stage) {
  const root = document.createElement('div');
  root.className = 'capas';
  stage.prepend(root);
  return {
    setDesign(layers) {
      root.replaceChildren();
      for (const slot of Object.keys(LAYER_SLOTS)) {
        const l = layers?.[slot];
        if (!l?.url) continue;
        const img = document.createElement('img');
        img.src = l.url; img.alt = ''; img.draggable = false; img.dataset.drag = 'layers.' + slot;
        Object.assign(img.style, { left: l.x + 'px', top: l.y + 'px', width: l.width + 'px' });
        root.append(img);
      }
    },
    root
  };
}

// ---------- Pantallas (TVs) ----------
export function applyScreenDesign(stage, screen) {
  const s = mergeDesign({ screen }).screen;
  stage.style.setProperty('--tv-font', fontCss(s.font));
  stage.style.setProperty('--tv-title-font', fontCss(s.titleFont));
  stage.style.setProperty('--tv-text', s.text);
  stage.style.setProperty('--tv-accent', s.accent);
  stage.dataset.bg = s.bg === 'image' && s.image?.url ? 'image' : s.bg === 'color' ? 'color' : 'default';
  stage.style.setProperty('--tv-color', s.color);
  stage.style.setProperty('--tv-image', s.bg === 'image' && s.image?.url ? `url("${String(s.image.url).replace(/"/g, '%22')}")` : 'none');
  stage.style.setProperty('--tv-dim', Math.max(0, Math.min(90, Number(s.dim) || 0)) / 100);
  stage.dataset.version = s.version ? 'si' : 'no';
  let logo = stage.querySelector(':scope > .tv-logo');
  if (s.logo.show) {
    if (!logo) { logo = document.createElement('img'); logo.className = 'tv-logo'; logo.alt = ''; stage.append(logo); }
    logo.src = s.logo.url || '/img/logo-claro.png';
    logo.dataset.pos = s.logo.position;
    logo.style.width = Math.max(60, Math.min(600, Number(s.logo.size) || 180)) + 'px';
  } else logo?.remove();
}

// ---------- Diapositivas ----------

function buildSlide(state) {
  const { item, index, blank, theme } = state;
  const slide = !blank && item ? item.slides[index] : null;
  const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const wrap = mk('div', 'slide');
  const head = mk('div', 'head'), body = mk('div', 'body'), fit = mk('div', 'fit'), foot = mk('div', 'foot');
  body.append(fit); wrap.append(head, body, foot);
  if (!slide) {
    if (theme) { wrap.classList.add('cover'); fit.append(mk('span', 'kicker', 'Tema'), document.createTextNode(theme)); }
  } else if (item.kind === 'bible') {
    wrap.classList.add('bible');
    head.textContent = slide.header;
    fit.append(mk('span', 'verse', String(slide.verse)), document.createTextNode(slide.text));
    foot.textContent = item.version || '';
  } else if (slide.lines?.length) {
    if (slide.chorus) wrap.classList.add('chorus');
    head.textContent = slide.label || '';
    for (const l of slide.lines) fit.append(mk('span', 'line', l));
    foot.textContent = slide.header || '';
  } else if (slide.title) {
    wrap.classList.add('cover');
    fit.append(mk('span', 'kicker', slide.header || ''), document.createTextNode(slide.title));
  } else fit.textContent = slide.text || '';
  return wrap;
}

// stage: el div .tv. Cambia de diapositiva con un fundido suave.
export function createScreen(stage) {
  let lastKey = null, lastState = null;
  function render(state, force = false) {
    lastState = state;
    const key = JSON.stringify([state.blank, state.item?.key, state.index, state.item ? '' : state.theme]);
    if (key === lastKey && !force) return;
    lastKey = key;
    const next = buildSlide(state);
    stage.append(next);
    fitText(next.querySelector('.fit'), { min: 28, max: next.classList.contains('cover') ? 120 : 96 });
    requestAnimationFrame(() => next.classList.add('on'));
    for (const old of [...stage.querySelectorAll(':scope > .slide')].slice(0, -1)) {
      old.classList.remove('on');
      setTimeout(() => old.remove(), 400);
    }
  }
  return { render, refit: () => lastState && render(lastState, true) };
}

// Escala un lienzo de 1920×1080 para que quepa en su contenedor.
export function fitStage(stage, container = document.documentElement, { center = true } = {}) {
  const apply = () => {
    const w = container === document.documentElement ? innerWidth : container.clientWidth;
    const h = container === document.documentElement ? innerHeight : container.clientHeight;
    const s = Math.min(w / 1920, h / 1080);
    stage.style.transformOrigin = '0 0';
    stage.style.transform = `translate(${center ? (w - 1920 * s) / 2 : 0}px, ${center ? (h - 1080 * s) / 2 : 0}px) scale(${s})`;
    return s;
  };
  const ro = new ResizeObserver(apply);
  ro.observe(container === document.documentElement ? document.body : container);
  addEventListener('resize', apply);
  return apply;
}
