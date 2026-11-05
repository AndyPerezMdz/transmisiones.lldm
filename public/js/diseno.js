// Editor de diseño: letrero (cantos, citas, tema), nombre del expositor, logos fijos y letra completa.
import { demo, supa, requireSession, roomId } from './db.js';
import { loadRoom, saveDesign } from './live.js';
import { $, el, toast, mountNav } from './ui.js';
import { FONTS, POSITIONS, LAYER_SLOTS, DEFAULT_DESIGN, mergeDesign, placeLayer,
  createBanner, createLayers, createScreen, applyScreenDesign, fitStage } from './render.js';

const room = roomId();
let design = mergeDesign();
let savedJson = JSON.stringify(design);
let sb = null, userId = 'demo';

const clone = v => JSON.parse(JSON.stringify(v));
const get = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj);
const set = (obj, path, value) => { const ks = path.split('.'); const last = ks.pop(); ks.reduce((o, k) => (o[k] ??= {}), obj)[last] = value; };

// Qué se edita en cada pestaña de la transmisión
const KINDS = {
  banner: { intro: 'Es el letrero que sale cuando ponen un canto, una cita o el tema. Todos usan el mismo diseño y salen en el mismo lugar.',
    tag: ['Etiqueta', '(“Lectura”)'], title: ['Título', '(“Juan 3:16”)'] },
  speaker: { intro: 'Es el nombre de quien expone. Sale abajo a la izquierda, encima de la imagen central, y se queda hasta que lo ocultan desde la cabina.',
    tag: ['Cargo', '(“Ministro”)'], title: ['Nombre', '(“Hno. Juan Pérez”)'] }
};
let tab = 'banner';
const editKind = () => (tab === 'banner' || tab === 'speaker' ? tab : null);
const lt = () => design[editKind()];

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
let sample = 0, selected = 'tag';
const txStage = $('bannerStage'), txBox = $('bannerBox');
const fitTx = fitStage(txStage, txBox, { center: false });
const layers = createLayers(txStage);
const letreros = { banner: createBanner(txStage, { kind: 'banner' }), speaker: createBanner(txStage, { kind: 'speaker' }) };
txStage.classList.add('editando', 'edit-banner');

function drawTx() {
  layers.setDesign(design.layers);
  letreros.banner.setDesign(design.banner);
  letreros.banner.show(...SAMPLES[sample], { instant: true });
  letreros.speaker.setDesign(design.speaker);
  letreros.speaker.show('Ministro', 'Hno. Juan Pérez', { instant: true });
  const k = editKind();
  const imgMode = k && lt().mode === 'image';
  $('bannerEmpty').hidden = !(imgMode && !lt().image?.url);
  $('dragHint').hidden = !((imgMode && lt().image?.url) || (tab === 'layers' && Object.values(design.layers).some(Boolean)));
  const selPath = k ? k + '.' + selected : tab === 'layers' ? 'layers.' + selectedLayer : '';
  for (const n of txStage.querySelectorAll('[data-drag]')) n.classList.toggle('sel', n.dataset.drag === selPath);
}

document.querySelectorAll('[data-sample]').forEach(c => c.onclick = () => {
  sample = Number(c.dataset.sample);
  document.querySelectorAll('[data-sample]').forEach(x => x.classList.toggle('activo', x === c));
  drawTx();
});
const camToggle = () => { txBox.classList.toggle('camara', $('fakeCam').checked); txBox.classList.toggle('cuadros', !$('fakeCam').checked); };
$('fakeCam').onchange = camToggle; camToggle();

// Arrastrar: solo lo que pertenece a la pestaña abierta
let drag = null, selectedLayer = 'der';
txStage.addEventListener('pointerdown', e => {
  const target = e.target.closest('[data-drag]');
  if (!target) return;
  const path = target.dataset.drag;
  const owner = path.split('.')[0];
  if (owner !== tab) return;
  if (owner !== 'layers' && design[owner].mode !== 'image') return;
  e.preventDefault();
  const obj = get(design, path);
  if (!obj) return;
  const part = path.split('.')[1];
  if (owner === 'layers') { selectedLayer = part; renderLayerRows(); }
  else if (part !== 'image') { selected = part; syncTextPick(); }
  drag = { target, obj, startX: e.clientX, startY: e.clientY, x: obj.x, y: obj.y, scale: txBox.clientWidth / 1920 };
  target.setPointerCapture(e.pointerId);
  for (const n of txStage.querySelectorAll('.sel')) n.classList.remove('sel');
  target.classList.add('sel');
});
txStage.addEventListener('pointermove', e => {
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
  if (tab === 'screen' || e.target.closest('input, select, textarea')) return;
  const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
  if (!d) return;
  const obj = tab === 'layers' ? design.layers[selectedLayer] : lt().mode === 'image' ? lt()[selected] : null;
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
$('resetBanner').onclick = () => {
  const k = editKind();
  if (!k || !confirm('¿Regresar este letrero al diseño original? Se quita su imagen y sus ajustes.')) return;
  design[k] = clone(DEFAULT_DESIGN[k]); bindLetrero(); changed();
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
$('bannerFile').onchange = e => handleFile(e.target, editKind() || 'banner', img => {
  const d = lt();
  const full = img.w >= 1800 && img.h >= 1000;
  const width = full ? 1920 : Math.min(img.w, editKind() === 'banner' ? 760 : 1100);
  const height = Math.round(width * img.h / img.w);
  // Arranca donde le toca: el letrero arriba a la derecha, el expositor abajo a la izquierda.
  const x = full ? 0 : editKind() === 'banner' ? 1920 - 70 - width : 70;
  const y = full ? 0 : editKind() === 'banner' ? 230 : Math.max(0, 1080 - 210 - height);
  d.image = { url: img.url, w: img.w, h: img.h, x, y, width };
  if (!d._placed) {
    const top = full ? (editKind() === 'banner' ? 230 : 760) : y, h = full ? 160 : height, left = full ? (editKind() === 'banner' ? 1180 : 120) : x;
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
$('resetScreen').onclick = () => {
  if (!confirm('¿Regresar la letra completa al diseño original?')) return;
  design.screen = clone(DEFAULT_DESIGN.screen); bindScreenControls(); changed();
};

// ---------- Guardar ----------
function changed() {
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

// ---------- Arranque ----------
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
})();
