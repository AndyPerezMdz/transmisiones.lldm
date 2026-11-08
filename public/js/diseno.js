// Editor de diseño: letrero (cantos, citas, tema), nombre del expositor, logos fijos y letra completa.
import { demo, supa, requireSession, roomId } from './db.js';
import { loadRoom, saveDesign, subscribe } from './live.js';
import { createTurno } from './turno.js';
import { $, el, toast, mountNav, modal } from './ui.js';
import { FONTS, POSITIONS, LAYER_SLOTS, LETREROS, DEFAULT_DESIGN, mergeDesign, placeLayer,
  createBanner, createLayers, createScreen, applyScreenDesign, fitStage } from './render.js';

const room = roomId();
let design = mergeDesign();
let savedJson = JSON.stringify(design);
let sb = null, userId = 'demo';

const clone = v => JSON.parse(JSON.stringify(v));
const get = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj);
const set = (obj, path, value) => { const ks = path.split('.'); const last = ks.pop(); ks.reduce((o, k) => (o[k] ??= {}), obj)[last] = value; };
let tipo = 'lectura';   // qué letrero se está editando en la pestaña de letreros

// Qué se edita en cada pestaña de la transmisión
const KINDS = {
  banner: { intro: 'Cada letrero (cita, himno, coro, tema, ubicación) puede tener su propio diseño, lugar y tamaño. Elige arriba de la vista previa cuál estás editando.',
    tag: ['Etiqueta', '(“Lectura”)'], title: ['Título', '(“Juan 3:16”)'] },
  speaker: { intro: 'Es el nombre de quien expone. Sale abajo a la izquierda, encima de la imagen central, y se queda hasta que lo ocultan desde la cabina.',
    tag: ['Cargo', '(“Ministro”)'], title: ['Nombre', '(“Hno. Juan Pérez”)'] }
};
let tab = 'banner';
const editKind = () => (tab === 'banner' || tab === 'speaker' ? tab : null);
const editPath = () => (tab === 'banner' ? 'letreros.' + tipo : tab === 'speaker' ? 'speaker' : null);
const lt = () => get(design, editPath());

// ---------- Pestañas ----------
$('tabs').addEventListener('click', e => {
  const b = e.target.closest('button[data-tab]'); if (!b) return;
  tab = b.dataset.tab;
  for (const x of $('tabs').children) x.classList.toggle('activo', x === b);
  $('tab-tx').hidden = tab === 'screen';
  $('tab-screen').hidden = tab !== 'screen';
  $('pLetrero').hidden = !editKind();
  $('pLayers').hidden = tab !== 'layers';
  $('samples').hidden = tab !== 'banner';
  txStage.classList.remove('edit-banner', 'edit-speaker', 'edit-layers');
  if (tab !== 'screen') txStage.classList.add('edit-' + tab);
  if (editKind()) { selected = 'tag'; bindLetrero(); } else if (tab === 'layers') renderLayerRows();
  requestAnimationFrame(() => { fitTx(); fitScreen(); screen.refit(); drawTx(); });
});

// ---------- Opciones de los selects ----------
for (const s of document.querySelectorAll('select.fuentes')) for (const [id, f] of Object.entries(FONTS)) s.append(new Option(f.name, id));
const posSel = document.querySelector('[data-b="position"]');
for (const [id, n] of Object.entries(POSITIONS)) posSel.append(new Option(n, id));

// ---------- Vista previa de la transmisión (logos + letrero + expositor) ----------
const SAMPLES = [['Lectura', 'Juan 3:16'], ['Himno 25', 'Un título de himno algo largo para probar'], ['Tema', 'La fe que vence al mundo'], ['Transmitiendo desde', 'Colonia Sambulá · Mérida, Yucatán']];
let selected = 'tag';
const txStage = $('bannerStage'), txBox = $('bannerBox');
const fitTx = fitStage(txStage, txBox, { center: false });
const layers = createLayers(txStage);
const tipos = Object.fromEntries(Object.keys(LETREROS).map(k => [k, createBanner(txStage, { kind: 'banner', path: 'letreros.' + k })]));
const speakerLt = createBanner(txStage, { kind: 'speaker' });
const instanceFor = path => (path === 'speaker' ? speakerLt : tipos[path.split('.')[1]]);
txStage.classList.add('editando', 'edit-banner');

function drawTx() {
  layers.setDesign(design.layers);
  for (const [k, b] of Object.entries(tipos)) {
    b.setDesign(design.letreros[k]);
    if (k === tipo) b.show(...LETREROS[k].sample, { instant: true }); else b.hide();
  }
  speakerLt.setDesign(design.speaker);
  speakerLt.show('Ministro', 'Hno. Juan Pérez', { instant: true });
  const k = editKind();
  const imgMode = k && lt().mode === 'image';
  $('bannerEmpty').hidden = !(imgMode && !lt().image?.url);
  $('dragHint').hidden = !(k ? (!imgMode || lt().image?.url) : tab === 'layers' && Object.values(design.layers).some(Boolean));
  const selPath = k ? editPath() + '.' + selected : tab === 'layers' ? 'layers.' + selectedLayer : '';
  for (const n of txStage.querySelectorAll('[data-drag]')) n.classList.toggle('sel', n.dataset.drag === selPath);
  placeHandle();
}

// ---------- Tirador para cambiar el tamaño ----------
const handle = el('div', { class: 'tirador', title: 'Arrastra para cambiar el tamaño' });
txStage.append(handle);
function resizeTarget() {
  if (tab === 'layers') {
    const l = design.layers[selectedLayer];
    return l ? { node: txStage.querySelector(`[data-drag="layers.${selectedLayer}"]`), obj: l, prop: 'width', min: 60, max: 1920 } : null;
  }
  if (!editKind()) return null;
  const d = lt(), root = instanceFor(editPath()).root;
  if (d.mode === 'image') return d.image?.url ? { node: root.querySelector('img'), obj: d.image, prop: 'width', min: 100, max: 1920 } : null;
  return { nodes: [...root.querySelectorAll('.lt-card')], obj: d, prop: 'size', min: 40, max: 250 };
}
function placeHandle() {
  const t = resizeTarget();
  const nodes = t ? (t.nodes || [t.node]).filter(Boolean) : [];
  handle.dataset.drag = (tab === 'layers' ? 'layers' : editPath() || 'x') + '.resize';
  if (!nodes.length) { handle.hidden = true; return; }
  const scale = txBox.clientWidth / 1920, box = txStage.getBoundingClientRect();
  const rects = nodes.map(n => n.getBoundingClientRect());
  const right = Math.max(...rects.map(r => r.right)), bottom = Math.max(...rects.map(r => r.bottom));
  handle.hidden = false;
  handle.style.left = ((right - box.left) / scale - 22) + 'px';
  handle.style.top = ((bottom - box.top) / scale - 22) + 'px';
}
function startResize(e) {
  const t = resizeTarget(); if (!t) return;
  const nodes = (t.nodes || [t.node]).filter(Boolean);
  const scale = txBox.clientWidth / 1920;
  const rects = nodes.map(n => n.getBoundingClientRect());
  const width = (Math.max(...rects.map(r => r.right)) - Math.min(...rects.map(r => r.left))) / scale;
  drag = { resize: true, t, start: t.obj[t.prop], width, startX: e.clientX, scale };
  txStage.setPointerCapture(e.pointerId);
}

// Elegir qué letrero se edita
const tiposBox = $('samples');
tiposBox.replaceChildren(el('span', { class: 'chico', text: 'Editando:' }));
for (const [k, info] of Object.entries(LETREROS)) {
  tiposBox.append(el('button', { type: 'button', class: 'chip' + (k === tipo ? ' activo' : ''), 'data-tipo': k, text: info.icon + ' ' + info.name,
    onclick: () => { tipo = k; for (const c of tiposBox.querySelectorAll('[data-tipo]')) c.classList.toggle('activo', c.dataset.tipo === k); selected = 'tag'; bindLetrero(); drawTx(); } }));
}
tiposBox.append(el('button', { type: 'button', class: 'btn btn-mini', text: 'Copiar este diseño a los demás', onclick: async () => {
  if (!(await modal({ title: 'Copiar a los demás letreros', text: `Los demás letreros quedarán igual que “${LETREROS[tipo].name}”: diseño, lugar y tamaño.`, ok: 'Copiar' }))) return;
  for (const k of Object.keys(LETREROS)) if (k !== tipo) design.letreros[k] = clone(design.letreros[tipo]);
  changed(); toast('Listo: todos quedaron igual. Ya puedes ajustar cada uno.', 'ok');
} }));
const camToggle = () => { txBox.classList.toggle('camara', $('fakeCam').checked); txBox.classList.toggle('cuadros', !$('fakeCam').checked); };
$('fakeCam').onchange = camToggle; camToggle();

// Arrastrar: solo lo que pertenece a la pestaña abierta
let drag = null, selectedLayer = 'der';
txStage.addEventListener('pointerdown', e => {
  if (readOnly) return;
  const target = e.target.closest('[data-drag]');
  if (!target) return;
  const path = target.dataset.drag;
  const prefix = tab === 'layers' ? 'layers' : editPath();
  if (!prefix || !path.startsWith(prefix + '.')) return;
  e.preventDefault();
  if (target.classList.contains('tirador')) return startResize(e);
  if (path.endsWith('.free')) return startFreeDrag(prefix, e);
  const obj = get(design, path);
  if (!obj) return;
  const part = path.split('.').pop();
  if (prefix === 'layers') { selectedLayer = part; renderLayerRows(); }
  else if (part !== 'image') { selected = part; syncTextPick(); }
  drag = { target, obj, startX: e.clientX, startY: e.clientY, x: obj.x, y: obj.y, scale: txBox.clientWidth / 1920 };
  target.setPointerCapture(e.pointerId);
  for (const n of txStage.querySelectorAll('.sel')) n.classList.remove('sel');
  target.classList.add('sel');
});
// Letrero con el diseño de la cabina: se pasa a posición libre y se arrastra completo.
function toFree(kind) {
  const d = get(design, kind);
  if (d.position === 'libre') return;
  const root = instanceFor(kind).root, scale = txBox.clientWidth / 1920, box = txStage.getBoundingClientRect();
  const rects = [...root.querySelectorAll('.lt-card')].map(n => n.getBoundingClientRect());
  d.free = { x: Math.round((Math.min(...rects.map(r => r.left)) - box.left) / scale), y: Math.round((Math.min(...rects.map(r => r.top)) - box.top) / scale) };
  d.position = 'libre';
  posSel.value = 'libre';
  $('margins').hidden = true;
  drawTx();
}
function startFreeDrag(kind, e) {
  toFree(kind);
  const root = instanceFor(kind).root, d = get(design, kind);
  drag = { free: true, root, obj: d.free, startX: e.clientX, startY: e.clientY, x: d.free.x, y: d.free.y, scale: txBox.clientWidth / 1920 };
  txStage.setPointerCapture(e.pointerId);
}

txStage.addEventListener('pointermove', e => {
  if (drag?.resize) {
    const { t } = drag;
    const factor = Math.max(0.1, (drag.width + (e.clientX - drag.startX) / drag.scale) / drag.width);
    let v = Math.round(drag.start * factor);
    if (t.prop === 'size') v = Math.round(v / 5) * 5;
    const old = t.obj[t.prop];
    t.obj[t.prop] = Math.max(t.min, Math.min(t.max, v));
    // El logo de la derecha y la imagen de abajo crecen desde su esquina.
    if (tab === 'layers' && selectedLayer === 'der') t.obj.x -= t.obj.width - old;
    if (tab === 'layers' && selectedLayer === 'centro') t.obj.y -= Math.round((t.obj.width - old) * t.obj.h / t.obj.w);
    if (t.prop === 'size') document.querySelector('[data-b=size]').value = t.obj.size;
    if (t.prop === 'width' && tab !== 'layers') document.querySelector('[data-b="image.width"]').value = t.obj.width;
    drawTx(); showValues();
    return;
  }
  if (drag?.free) {
    drag.obj.x = Math.max(0, Math.min(1860, Math.round(drag.x + (e.clientX - drag.startX) / drag.scale)));
    drag.obj.y = Math.max(-20, Math.min(1000, Math.round(drag.y + (e.clientY - drag.startY) / drag.scale)));
    drag.root.style.setProperty('--fx', drag.obj.x + 'px');
    drag.root.style.setProperty('--fy', drag.obj.y + 'px');
    return;
  }
  if (!drag) return;
  drag.obj.x = Math.max(-1800, Math.min(1900, Math.round(drag.x + (e.clientX - drag.startX) / drag.scale)));
  drag.obj.y = Math.max(-1000, Math.min(1060, Math.round(drag.y + (e.clientY - drag.startY) / drag.scale)));
  drag.target.style.left = drag.obj.x + 'px';
  drag.target.style.top = drag.obj.y + 'px';
});
const endDrag = () => { if (drag) { drag = null; changed(); } };
txStage.addEventListener('pointerup', endDrag);
txStage.addEventListener('pointercancel', endDrag);

// Flechas del teclado para acomodar fino
document.addEventListener('keydown', e => {
  if (readOnly) return;
  if (tab === 'screen' || e.target.closest('input, select, textarea')) return;
  const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
  if (!d) return;
  if (editKind() && lt().mode === 'default') toFree(editPath());
  const obj = tab === 'layers' ? design.layers[selectedLayer] : lt().mode === 'image' ? lt()[selected] : lt().free;
  if (!obj) return;
  e.preventDefault();
  const step = e.shiftKey ? 10 : 1;
  obj.x += d[0] * step; obj.y += d[1] * step;
  changed();
});

// ---------- Letrero / expositor: controles ----------
function bindLetrero() {
  const k = editKind(); if (!k) return;
  const d = lt();
  $('ltIntro').textContent = KINDS[k].intro;
  [$('tagName').textContent, $('tagEx').textContent] = KINDS[k].tag;
  [$('titleName').textContent, $('titleEx').textContent] = KINDS[k].title;
  for (const input of document.querySelectorAll('[data-b]')) {
    const v = get(d, input.dataset.b);
    if (input.type === 'checkbox') input.checked = !!v; else input.value = v ?? '';
  }
  for (const r of document.querySelectorAll('input[name=bmode]')) r.checked = r.value === d.mode;
  $('bDefault').hidden = d.mode !== 'default';
  $('margins').hidden = d.position === 'libre';
  $('bImage').hidden = d.mode !== 'image';
  $('bImageCtl').hidden = !d.image?.url;
  syncTextPick();
}
function syncTextPick() {
  if (!editKind()) return;
  for (const b of $('txtPick').children) b.classList.toggle('activo', b.dataset.k === selected);
  const t = lt()[selected];
  for (const input of document.querySelectorAll('[data-t]')) {
    const v = t[input.dataset.t];
    if (input.type === 'checkbox') input.checked = !!v; else input.value = v;
  }
  showValues();
}
function showValues() {
  const k = editKind();
  if (k) {
    for (const s of document.querySelectorAll('[data-show]')) {
      const v = get(lt(), s.dataset.show);
      s.textContent = s.dataset.show === 'size' ? v + '%' : v != null ? v + ' px' : '';
    }
    for (const s of document.querySelectorAll('[data-tshow]')) s.textContent = lt()[selected][s.dataset.tshow] + ' px';
  }
  for (const s of document.querySelectorAll('[data-sshow]')) {
    const v = get(design.screen, s.dataset.sshow);
    s.textContent = s.dataset.sshow === 'dim' ? v + '%' : v + ' px';
  }
}
document.querySelectorAll('[data-b]').forEach(input => input.addEventListener('input', () => {
  if (!editKind()) return;
  const raw = input.type === 'checkbox' ? input.checked : input.value;
  set(lt(), input.dataset.b, input.type === 'range' || input.type === 'number' ? Number(raw) : raw);
  if (input.dataset.b === 'position') $('margins').hidden = raw === 'libre';
  changed();
}));
document.querySelectorAll('[data-t]').forEach(input => input.addEventListener('input', () => {
  if (!editKind()) return;
  const k = input.dataset.t;
  let v = input.type === 'checkbox' ? input.checked : input.value;
  if (['size', 'w', 'weight'].includes(k)) v = Number(v);
  lt()[selected][k] = v;
  changed();
}));
document.querySelectorAll('input[name=bmode]').forEach(r => r.onchange = () => { lt().mode = r.value; bindLetrero(); changed(); });
$('txtPick').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { selected = b.dataset.k; syncTextPick(); drawTx(); } });
$('resetBanner').onclick = async () => {
  const k = editKind();
  if (!k || !(await modal({ title: 'Volver al diseño original', text: 'Se quita la imagen y los ajustes de este letrero. Puedes descartarlo antes de guardar.', ok: 'Sí, regresar', danger: true }))) return;
  set(design, editPath(), clone(get(DEFAULT_DESIGN, editPath()))); bindLetrero(); changed();
};

// ---------- Subir imágenes ----------
const MAX_BYTES = 8 * 1024 * 1024;
function readSize(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res({ w: i.naturalWidth, h: i.naturalHeight }); i.onerror = () => rej(new Error('No se pudo abrir la imagen.')); i.src = src; });
}
async function upload(file, kind) {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error('Usa una imagen PNG, JPG o WEBP.');
  if (file.size > MAX_BYTES) throw new Error('La imagen pesa más de 8 MB. Guárdala más ligera e inténtalo otra vez.');
  if (demo) {
    if (file.size > 2.5 * 1024 * 1024) throw new Error('En modo de prueba usa una imagen de menos de 2.5 MB.');
    const url = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
    return { url, ...(await readSize(url)) };
  }
  const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[file.type];
  const path = `${userId}/${room}/${kind}-${Date.now()}.${ext}`;
  const { error } = await sb.storage.from('disenos').upload(path, file, { contentType: file.type, cacheControl: '31536000', upsert: false });
  if (error) throw new Error('No se pudo subir: ' + error.message);
  const { data } = sb.storage.from('disenos').getPublicUrl(path);
  return { url: data.publicUrl, ...(await readSize(URL.createObjectURL(file))) };
}
async function handleFile(input, kind, fn) {
  const file = input.files[0]; input.value = '';
  if (!file) return;
  const label = document.querySelector(`label[for="${input.id}"]`);
  const text = label?.textContent;
  if (label) label.textContent = 'Subiendo…';
  try { await fn(await upload(file, kind)); changed(); toast('Imagen lista. Acomódala y guarda los cambios.', 'ok'); }
  catch (err) { toast(err.message); }
  finally { if (label) label.textContent = text; }
}
$('bannerFile').onchange = e => handleFile(e.target, tab === 'banner' ? 'letrero-' + tipo : 'expositor', img => {
  const d = lt();
  const full = img.w >= 1800 && img.h >= 1000;
  const width = full ? 1920 : Math.min(img.w, tab === 'banner' ? 760 : 1100);
  const height = Math.round(width * img.h / img.w);
  // Arranca donde le toca: el letrero arriba a la derecha, el expositor abajo a la izquierda.
  const x = full ? 0 : tab === 'banner' ? 1920 - 70 - width : 70;
  const y = full ? 0 : tab === 'banner' ? 230 : Math.max(0, 1080 - 210 - height);
  d.image = { url: img.url, w: img.w, h: img.h, x, y, width };
  if (!d._placed) {
    const top = full ? (tab === 'banner' ? 230 : 760) : y, h = full ? 160 : height, left = full ? (tab === 'banner' ? 1180 : 120) : x;
    const w = full ? 640 : width;
    Object.assign(d.tag, { x: left + 40, y: top + Math.round(h * 0.1), w: Math.max(150, Math.min(500, w - 80)) });
    Object.assign(d.title, { x: left + 40, y: top + Math.round(h * 0.42), w: Math.max(200, w - 80), size: Math.max(28, Math.min(60, Math.round(h * 0.32))) });
    d._placed = true;
  }
  bindLetrero();
});

// ---------- Logos fijos ----------
function renderLayerRows() {
  const box = $('layerRows'); box.replaceChildren();
  for (const [slot, info] of Object.entries(LAYER_SLOTS)) {
    const l = design.layers[slot];
    const fileId = 'layerFile-' + slot;
    const input = el('input', { type: 'file', id: fileId, accept: 'image/png,image/jpeg,image/webp', hidden: true });
    input.onchange = () => handleFile(input, 'logo-' + slot, img => {
      design.layers[slot] = { url: img.url, w: img.w, h: img.h, ...placeLayer(slot, img.w, img.h) };
      selectedLayer = slot; renderLayerRows();
    });
    const row = el('div', { class: 'capa-fila' + (selectedLayer === slot && l ? ' sel' : '') },
      el('div', { class: 'capa-mini' }, l ? el('img', { src: l.url, alt: '' }) : el('span', { class: 'chico', text: 'vacío' })),
      el('div', {}, el('b', { text: info.name }), el('span', { class: 'chico', text: info.hint })),
      el('div', { class: 'acciones' },
        el('label', { class: 'btn btn-sec', for: fileId, text: l ? 'Cambiar imagen' : '⬆ Subir imagen' }), input,
        l ? el('button', { type: 'button', class: 'btn btn-mini', text: 'Quitar', onclick: () => { design.layers[slot] = null; renderLayerRows(); changed(); } }) : null,
        l ? el('button', { type: 'button', class: 'btn btn-mini', text: 'Acomodar como al inicio', onclick: () => { Object.assign(l, placeLayer(slot, l.w, l.h)); changed(); } }) : null));
    if (l) {
      const range = el('input', { type: 'range', min: 60, max: 1920, step: 10, value: l.width, title: 'Tamaño' });
      range.oninput = () => {
        // Crece desde la esquina que le corresponde
        const old = l.width; l.width = Number(range.value);
        if (slot === 'der') l.x -= l.width - old;
        if (slot === 'centro') l.y -= Math.round((l.width - old) * l.h / l.w);
        changed();
      };
      row.append(el('span', { class: 'chico', text: 'Tamaño' }), range);
    }
    box.append(row);
  }
}

// ---------- Letra completa (página opcional) ----------
const SCREEN_SAMPLES = [
  { item: { kind: 'bible', key: 'b', version: 'Reina-Valera 1909', slides: [{ header: 'Juan 3:16', verse: 16, text: 'Porque de tal manera amó Dios al mundo, que ha dado á su Hijo unigénito, para que todo aquel que en él cree, no se pierda, mas tenga vida eterna.' }] }, index: 0 },
  { item: { kind: 'hymn', key: 'h', slides: [{ header: 'Título del himno', label: 'Estrofa 1', lines: ['Así se verá la letra', 'de un himno o un coro', 'en la pantalla', 'de letra completa.'] }] }, index: 0 },
  { item: { kind: 'hymn', key: 'p', slides: [{ header: 'Himno 25', title: 'Título del himno', lines: [] }] }, index: 0 },
  { item: null, index: 0, theme: 'La fe que vence al mundo' }
];
let ssample = 0;
const screenStage = $('screenStage'), screenBox = $('screenBox');
const fitScreen = fitStage(screenStage, screenBox, { center: false });
const screen = createScreen(screenStage);
function drawScreen() {
  applyScreenDesign(screenStage, design.screen);
  screen.render({ blank: false, theme: '', ...SCREEN_SAMPLES[ssample] }, true);
}
document.querySelectorAll('[data-ssample]').forEach(c => c.onclick = () => {
  ssample = Number(c.dataset.ssample);
  document.querySelectorAll('[data-ssample]').forEach(x => x.classList.toggle('activo', x === c));
  drawScreen();
});
function bindScreenControls() {
  for (const input of document.querySelectorAll('[data-s]')) {
    const v = get(design.screen, input.dataset.s);
    if (input.type === 'checkbox') input.checked = !!v; else input.value = v ?? '';
  }
  for (const r of document.querySelectorAll('input[name=sbg]')) r.checked = r.value === design.screen.bg;
  $('sColorBox').hidden = design.screen.bg !== 'color';
  $('sImageBox').hidden = design.screen.bg !== 'image';
  $('sLogoBox').hidden = !design.screen.logo.show;
  showValues();
}
document.querySelectorAll('[data-s]').forEach(input => input.addEventListener('input', () => {
  const raw = input.type === 'checkbox' ? input.checked : input.value;
  set(design.screen, input.dataset.s, input.type === 'range' ? Number(raw) : raw);
  if (input.dataset.s === 'logo.show') bindScreenControls();
  changed();
}));
document.querySelectorAll('input[name=sbg]').forEach(r => r.onchange = () => { design.screen.bg = r.value; bindScreenControls(); changed(); });
$('screenFile').onchange = e => handleFile(e.target, 'fondo', img => { design.screen.image = { url: img.url, w: img.w, h: img.h }; design.screen.bg = 'image'; bindScreenControls(); });
$('logoFile').onchange = e => handleFile(e.target, 'logo', img => { design.screen.logo.url = img.url; design.screen.logo.show = true; bindScreenControls(); });
$('logoChurch').onclick = () => { design.screen.logo.url = null; changed(); };
$('resetScreen').onclick = async () => {
  if (!(await modal({ title: 'Volver al diseño original', text: '¿Regresar la letra completa al diseño original?', ok: 'Sí, regresar', danger: true }))) return;
  design.screen = clone(DEFAULT_DESIGN.screen); bindScreenControls(); changed();
};

// ---------- Guardar ----------
function changed() {
  if (readOnly) { drawTx(); drawScreen(); return; }
  showValues();
  drawTx();
  drawScreen();
  const dirty = JSON.stringify(design) !== savedJson;
  $('saveBar').classList.toggle('cambios', dirty);
  $('saveMsg').textContent = dirty ? 'Tienes cambios sin guardar' : 'Sin cambios';
  $('btnSave').disabled = !dirty;
  $('btnDiscard').disabled = !dirty;
}
$('btnSave').onclick = async () => {
  const btn = $('btnSave');
  btn.disabled = true; btn.textContent = 'Guardando…';
  try {
    await saveDesign(room, design);
    savedJson = JSON.stringify(design);
    toast('Listo. La transmisión ya tiene el diseño nuevo.', 'ok');
  } catch (err) { toast('No se guardó: ' + err.message); }
  btn.textContent = 'Guardar cambios';
  changed();
};
$('btnDiscard').onclick = () => {
  design = mergeDesign(JSON.parse(savedJson));
  bindLetrero(); bindScreenControls(); renderLayerRows(); changed();
};
addEventListener('beforeunload', e => { if (JSON.stringify(design) !== savedJson) { e.preventDefault(); e.returnValue = ''; } });
// Al irse a otra página de la app con cambios pendientes, se pregunta con una ventana propia.
document.addEventListener('click', async e => {
  const link = e.target.closest('a[href]');
  if (!link || link.target === '_blank' || JSON.stringify(design) === savedJson) return;
  e.preventDefault();
  const leave = await modal({ title: 'Tienes cambios sin guardar', text: 'Si te vas ahora, se pierden los cambios del diseño.', ok: 'Salir sin guardar', cancel: 'Quedarme', danger: true });
  if (leave) { savedJson = JSON.stringify(design); location.href = link.href; }
}, true);

// ---------- Arranque ----------
// ---------- Turno: una sola persona edita a la vez ----------
let readOnly = false, hadTurn = false;
function setReadOnly(on, state) {
  readOnly = on;
  document.body.classList.toggle('solo-lectura', on);
  const bar = $('turnoBar');
  bar.hidden = !on;
  if (on) {
    const who = state.holder?.name || 'Otra persona';
    $('turnoTxt').textContent = state.checking ? 'Revisando si alguien más está editando el diseño…'
      : `${who} está editando el diseño. Puedes ver cómo va, pero no mover nada hasta que termine.`;
    $('turnoTomar').hidden = !!state.checking;
  }
  $('saveBar').hidden = on;
}
async function reloadDesign() {
  try { const saved = await loadRoom(room); design = mergeDesign(saved?.design); savedJson = JSON.stringify(design); } catch {}
  bindLetrero(); bindScreenControls(); renderLayerRows(); changed();
}
function startTurno(me) {
  let first = true;
  setReadOnly(true, { checking: true });
  const turno = createTurno('diseno-' + room, me, async state => {
    const wasFirst = first; first = false;
    if (state.mine) {
      const was = readOnly;
      setReadOnly(false, state);
      if (was && !wasFirst) { await reloadDesign(); toast('Ya es tu turno: puedes editar el diseño.', 'ok'); }
      hadTurn = true;
    } else {
      const lost = hadTurn && !readOnly;
      setReadOnly(true, state);
      if (lost) {
        // Alguien tomó el turno: lo que no se guardó se descarta para no pisar su trabajo.
        await modal({ title: 'Alguien más tomó el diseño', text: `${state.holder?.name || 'Otra persona'} está editando ahora. Lo que no guardaste se descartó.`, ok: 'Entendido', cancel: null });
        await reloadDesign();
      }
    }
  });
  $('turnoTomar').onclick = async () => {
    if (await modal({ title: 'Entrar de todos modos', text: 'Úsalo solo si la otra persona ya no está editando (por ejemplo, dejó la página abierta). Lo que no haya guardado se perderá.', ok: 'Sí, entrar', danger: true })) turno.take();
  };
  addEventListener('pagehide', () => turno.release());
  // Mientras miras, ves los cambios que va guardando la otra persona.
  subscribe(room, () => {}, d => { if (readOnly) { design = mergeDesign(d); savedJson = JSON.stringify(design); bindLetrero(); bindScreenControls(); renderLayerRows(); changed(); } });
}

(async () => {
  const session = await requireSession();
  mountNav('diseno');
  sb = await supa();
  userId = session.user.id;
  try {
    const saved = await loadRoom(room);
    if (!saved) { toast('Esa sala no existe. Elige una desde Salas.'); return; }
    if ($('navSala')) $('navSala').textContent = saved.name || '';
    design = mergeDesign(saved.design);
    savedJson = JSON.stringify(design);
  } catch (err) { toast(err.message); }
  bindLetrero(); bindScreenControls(); renderLayerRows();
  fitTx(); fitScreen();
  changed();
  const meta = session.user.user_metadata || {};
  startTurno({ id: session.user.id, name: demo ? 'Otra pestaña' : (meta.name || session.user.email || 'Alguien') });
})();
