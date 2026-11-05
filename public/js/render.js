import { fitText } from './live.js';
// Dibuja el letrero de la transmisión y aplica el diseño de las pantallas.
// Lo usan overlay.html, pantalla.html y el editor de diseño (vista previa).

export const FONTS = {
  inter: { name: 'Inter', css: '"Inter Variable", "Segoe UI", system-ui, sans-serif' },
  cinzel: { name: 'Cinzel (como el logo)', css: '"Cinzel Variable", "Times New Roman", serif' },
  georgia: { name: 'Georgia (clásica)', css: 'Georgia, "Times New Roman", serif' },
  arial: { name: 'Arial', css: 'Arial, Helvetica, sans-serif' }
};
export const fontCss = id => (FONTS[id] || FONTS.inter).css;

export const POSITIONS = {
  'abajo-izq': 'Abajo a la izquierda', 'abajo-centro': 'Abajo al centro', 'abajo-der': 'Abajo a la derecha',
  'arriba-izq': 'Arriba a la izquierda', 'arriba-der': 'Arriba a la derecha'
};

export const DEFAULT_DESIGN = {
  banner: {
    mode: 'default',              // 'default' | 'image'
    anim: 'deslizar',             // 'deslizar' | 'aparecer'
    position: 'abajo-izq', size: 100,
    colors: { bg: '#0a3156', accent: '#c7ae6e', text: '#ffffff', tagText: '#061f38' },
    font: 'inter', tagFont: 'cinzel',
    image: null,                  // { url, w, h, x, y, width }
    tag:   { show: true, x: 160, y: 868, w: 420, size: 30, color: '#ffffff', font: 'cinzel', weight: 800, align: 'left', upper: true },
    title: { show: true, x: 160, y: 910, w: 1100, size: 54, color: '#ffffff', font: 'inter', weight: 600, align: 'left', upper: false }
  },
  screen: {
    bg: 'default',                // 'default' | 'color' | 'image'
    color: '#0a3156', image: null, dim: 45,
    font: 'inter', titleFont: 'cinzel', text: '#f7f3eb', accent: '#dccb98',
    logo: { show: false, url: null, position: 'arriba-der', size: 180 },
    version: true
  }
};

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
export function mergeDesign(saved) {
  const merge = (a, b) => {
    const out = { ...a };
    for (const [k, v] of Object.entries(b || {})) out[k] = isObj(a[k]) && isObj(v) ? merge(a[k], v) : v;
    return out;
  };
  return merge(DEFAULT_DESIGN, isObj(saved) ? saved : {});
}

// ---------- Letrero ----------
// stage: un div de 1920x1080. Devuelve { show(tag, title), hide() }.
export function createBanner(stage) {
  const root = document.createElement('div');
  root.className = 'lt';
  stage.append(root);
  let design = mergeDesign().banner, current = null, swapTimer;

  function build() {
    root.replaceChildren();
    root.dataset.anim = design.anim;
    if (design.mode === 'image' && design.image?.url) {
      root.className = 'lt lt-imagen';
      const img = document.createElement('img');
      img.src = design.image.url; img.alt = ''; img.draggable = false;
      Object.assign(img.style, { left: design.image.x + 'px', top: design.image.y + 'px', width: design.image.width + 'px' });
      root.append(img);
      for (const key of ['tag', 'title']) {
        const t = design[key];
        const box = document.createElement('div');
        box.className = 'lt-txt lt-' + key; box.dataset.key = key;
        Object.assign(box.style, { left: t.x + 'px', top: t.y + 'px', width: t.w + 'px', fontSize: t.size + 'px', color: t.color,
          fontFamily: fontCss(t.font), fontWeight: t.weight, textAlign: t.align, textTransform: t.upper ? 'uppercase' : 'none' });
        box.hidden = !t.show;
        root.append(box);
      }
    } else {
      root.className = 'lt lt-normal pos-' + design.position;
      const c = design.colors;
      root.style.setProperty('--lt-bg', c.bg); root.style.setProperty('--lt-accent', c.accent);
      root.style.setProperty('--lt-text', c.text); root.style.setProperty('--lt-tag-text', c.tagText);
      root.style.setProperty('--lt-scale', design.size / 100);
      root.style.setProperty('--lt-font', fontCss(design.font)); root.style.setProperty('--lt-tag-font', fontCss(design.tagFont));
      const tag = document.createElement('div'); tag.className = 'lt-txt lt-tag'; tag.dataset.key = 'tag';
      const title = document.createElement('div'); title.className = 'lt-txt lt-title'; title.dataset.key = 'title';
      root.append(tag, title);
    }
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
    setDesign(d) { design = mergeDesign({ banner: d }).banner; build(); },
    show(tag, title, { instant = false } = {}) {
      clearTimeout(swapTimer);
      const next = { tag, title };
      const same = current && current.tag === tag && current.title === title && root.classList.contains('on');
      current = next;
      if (same) return;
      if (root.classList.contains('on') && !instant) {
        root.classList.remove('on');
        swapTimer = setTimeout(() => { fill(next); root.classList.add('on'); }, 420);
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
