// Editor de diseño: letrero de la transmisión y pantallas del templo.
import { demo, supa, requireSession, roomId } from './db.js';
import { loadRoom, saveDesign } from './live.js';
import { $, toast, mountNav } from './ui.js';
import { FONTS, POSITIONS, DEFAULT_DESIGN, mergeDesign, createBanner, createScreen, applyScreenDesign, fitStage } from './render.js';

const room = roomId();
let design = mergeDesign();
let savedJson = JSON.stringify(design);
let sb = null, userId = 'demo';

const clone = v => JSON.parse(JSON.stringify(v));
const get = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj);
const set = (obj, path, value) => { const ks = path.split('.'); const last = ks.pop(); ks.reduce((o, k) => (o[k] ??= {}), obj)[last] = value; };

// ---------- Pestañas ----------
let tab = 'banner';
$('tabs').addEventListener('click', e => {
  const b = e.target.closest('button[data-tab]'); if (!b) return;
  tab = b.dataset.tab;
  for (const x of $('tabs').children) x.classList.toggle('activo', x === b);
  $('tab-banner').hidden = tab !== 'banner';
  $('tab-screen').hidden = tab !== 'screen';
  requestAnimationFrame(() => { fitBanner(); fitScreen(); screen.refit(); });
});

// ---------- Opciones de los selects ----------
for (const s of document.querySelectorAll('select.fuentes')) {
  for (const [id, f] of Object.entries(FONTS)) s.append(new Option(f.name, id));
}
const posSel = document.querySelector('[data-b="position"]');
for (const [id, n] of Object.entries(POSITIONS)) posSel.append(new Option(n, id));

// ---------- Letrero: vista previa ----------
const SAMPLES = [['Lectura', 'Juan 3:16'], ['Himno 25', 'Un título de himno algo largo para probar'], ['Tema', 'La fe que vence al mundo'], ['Transmitiendo desde', 'Colonia Sambulá · Mérida, Yucatán']];
let sample = 0;
const bannerStage = $('bannerStage'), bannerBox = $('bannerBox');
const fitBanner = fitStage(bannerStage, bannerBox, { center: false });
const banner = createBanner(bannerStage);
bannerStage.classList.add('editando');
let selected = 'tag';

function drawBanner() {
  const b = design.banner;
  banner.setDesign(b);
  banner.show(...SAMPLES[sample], { instant: true });
  const imgMode = b.mode === 'image';
  $('bannerEmpty').hidden = !(imgMode && !b.image?.url);
  $('dragHint').hidden = !(imgMode && b.image?.url);
  for (const n of bannerStage.querySelectorAll('[data-key], img')) n.classList.toggle('sel', (n.dataset.key || 'img') === selected);
}

document.querySelectorAll('[data-sample]').forEach(c => c.onclick = () => {
  sample = Number(c.dataset.sample);
  document.querySelectorAll('[data-sample]').forEach(x => x.classList.toggle('activo', x === c));
  drawBanner();
});
const camToggle = () => { bannerBox.classList.toggle('camara', $('fakeCam').checked); bannerBox.classList.toggle('cuadros', !$('fakeCam').checked); };
$('fakeCam').onchange = camToggle; camToggle();

// Arrastrar imagen y textos
let drag = null;
bannerStage.addEventListener('pointerdown', e => {
  if (design.banner.mode !== 'image') return;
  const target = e.target.closest('.lt-imagen img, .lt-imagen .lt-txt');
  if (!target) return;
  e.preventDefault();
  const key = target.tagName === 'IMG' ? 'img' : target.dataset.key;
  if (key !== 'img') { selected = key; syncTextPick(); }
  const obj = key === 'img' ? design.banner.image : design.banner[key];
  const scale = bannerBox.clientWidth / 1920;
  drag = { key, target, obj, startX: e.clientX, startY: e.clientY, x: obj.x, y: obj.y, scale };
  target.setPointerCapture(e.pointerId);
  for (const n of bannerStage.querySelectorAll('.sel')) n.classList.remove('sel');
  target.classList.add('sel');
});
bannerStage.addEventListener('pointermove', e => {
  if (!drag) return;
  const nx = Math.round(drag.x + (e.clientX - drag.startX) / drag.scale);
  const ny = Math.round(drag.y + (e.clientY - drag.startY) / drag.scale);
  drag.obj.x = Math.max(-1800, Math.min(1900, nx));
  drag.obj.y = Math.max(-1000, Math.min(1060, ny));
  drag.target.style.left = drag.obj.x + 'px';
  drag.target.style.top = drag.obj.y + 'px';
});
const endDrag = () => { if (drag) { drag = null; changed(); } };
bannerStage.addEventListener('pointerup', endDrag);
bannerStage.addEventListener('pointercancel', endDrag);

// Teclas de flecha para acomodar fino
document.addEventListener('keydown', e => {
  if (tab !== 'banner' || design.banner.mode !== 'image' || e.target.closest('input, select, textarea')) return;
  const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
  if (!d) return;
  e.preventDefault();
  const step = e.shiftKey ? 10 : 1;
  const obj = design.banner[selected];
  obj.x += d[0] * step; obj.y += d[1] * step;
  changed();
});

// ---------- Letrero: controles ----------
function bindBannerControls() {
  for (const input of document.querySelectorAll('[data-b]')) {
    const path = input.dataset.b;
    const v = get(design.banner, path);
    if (input.type === 'checkbox') input.checked = !!v; else input.value = v ?? '';
  }
  for (const r of document.querySelectorAll('input[name=bmode]')) r.checked = r.value === design.banner.mode;
  $('bDefault').hidden = design.banner.mode !== 'default';
  $('bImage').hidden = design.banner.mode !== 'image';
  $('bImageCtl').hidden = !design.banner.image?.url;
  syncTextPick();
  showValues();
}
function syncTextPick() {
  for (const b of $('txtPick').children) b.classList.toggle('activo', b.dataset.k === selected);
  const t = design.banner[selected];
  for (const input of document.querySelectorAll('[data-t]')) {
    const v = t[input.dataset.t];
    if (input.type === 'checkbox') input.checked = !!v; else input.value = v;
  }
  showValues();
}
function showValues() {
  for (const s of document.querySelectorAll('[data-show]')) {
    const v = get(design.banner, s.dataset.show);
    s.textContent = s.dataset.show === 'size' ? v + '%' : v != null ? v + ' px' : '';
  }
  for (const s of document.querySelectorAll('[data-tshow]')) s.textContent = design.banner[selected][s.dataset.tshow] + ' px';
  for (const s of document.querySelectorAll('[data-sshow]')) {
    const v = get(design.screen, s.dataset.sshow);
    s.textContent = s.dataset.sshow === 'dim' ? v + '%' : v + ' px';
  }
}
document.querySelectorAll('[data-b]').forEach(input => input.addEventListener('input', () => {
  const raw = input.type === 'checkbox' ? input.checked : input.value;
  const num = input.type === 'range' || input.type === 'number';
  set(design.banner, input.dataset.b, num ? Number(raw) : raw);
  changed();
}));
document.querySelectorAll('[data-t]').forEach(input => input.addEventListener('input', () => {
  const k = input.dataset.t;
  let v = input.type === 'checkbox' ? input.checked : input.value;
  if (['size', 'w', 'weight'].includes(k)) v = Number(v);
  design.banner[selected][k] = v;
  changed();
}));
document.querySelectorAll('input[name=bmode]').forEach(r => r.onchange = () => { design.banner.mode = r.value; bindBannerControls(); changed(); });
$('txtPick').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { selected = b.dataset.k; syncTextPick(); drawBanner(); } });
$('resetBanner').onclick = () => {
  if (!confirm('¿Regresar al letrero original? Se quita tu imagen y tus ajustes del letrero.')) return;
  design.banner = clone(DEFAULT_DESIGN.banner); bindBannerControls(); changed();
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
async function handleFile(input, fn) {
  const file = input.files[0]; input.value = '';
  if (!file) return;
  const label = document.querySelector(`label[for="${input.id}"]`);
  const text = label?.textContent;
  if (label) label.textContent = 'Subiendo…';
  try { await fn(await upload(file, input.id.replace('File', ''))); changed(); toast('Imagen lista. Acomódala y guarda los cambios.', 'ok'); }
  catch (err) { toast(err.message); }
  finally { if (label) label.textContent = text; }
}
$('bannerFile').onchange = e => handleFile(e.target, img => {
  const full = img.w >= 1800 && img.h >= 1000;
  const width = full ? 1920 : Math.min(img.w, 1400);
  const height = Math.round(width * img.h / img.w);
  const x = full ? 0 : 100, y = full ? 0 : Math.max(0, 1080 - height - 80);
  design.banner.image = { url: img.url, w: img.w, h: img.h, x, y, width };
  const b = design.banner;
  // Primera vez: pone los textos encima de la imagen para que se vean y se puedan arrastrar.
  if (!b._placed) {
    const top = full ? 820 : y;
    const h = full ? 200 : height;
    Object.assign(b.tag, { x: x + 60, y: top + Math.round(h * 0.12), w: Math.min(600, width - 120) });
    Object.assign(b.title, { x: x + 60, y: top + Math.round(h * 0.45), w: Math.max(200, width - 120), size: Math.max(28, Math.min(64, Math.round(h * 0.32))) });
    b._placed = true;
  }
  bindBannerControls();
});

// ---------- Pantallas ----------
const SCREEN_SAMPLES = [
  { item: { kind: 'bible', key: 'b', version: 'Reina-Valera 1909', slides: [{ header: 'Juan 3:16', verse: 16, text: 'Porque de tal manera amó Dios al mundo, que ha dado á su Hijo unigénito, para que todo aquel que en él cree, no se pierda, mas tenga vida eterna.' }] }, index: 0 },
  { item: { kind: 'hymn', key: 'h', slides: [{ header: 'Título del himno', label: 'Estrofa 1', lines: ['Así se verá la letra', 'de un himno o un coro', 'en las pantallas', 'del templo.'] }] }, index: 0 },
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
$('screenFile').onchange = e => handleFile(e.target, img => { design.screen.image = { url: img.url, w: img.w, h: img.h }; design.screen.bg = 'image'; bindScreenControls(); });
$('logoFile').onchange = e => handleFile(e.target, img => { design.screen.logo.url = img.url; design.screen.logo.show = true; bindScreenControls(); });
$('logoChurch').onclick = () => { design.screen.logo.url = null; changed(); };
$('resetScreen').onclick = () => {
  if (!confirm('¿Regresar las pantallas al diseño original?')) return;
  design.screen = clone(DEFAULT_DESIGN.screen); bindScreenControls(); changed();
};

// ---------- Guardar ----------
function changed() {
  showValues();
  drawBanner();
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
    toast('Listo. Las TVs y la transmisión ya tienen el diseño nuevo.', 'ok');
  } catch (err) { toast('No se guardó: ' + err.message); }
  btn.textContent = 'Guardar cambios';
  changed();
};
$('btnDiscard').onclick = () => {
  design = mergeDesign(JSON.parse(savedJson));
  bindBannerControls(); bindScreenControls(); changed();
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
  bindBannerControls(); bindScreenControls();
  fitBanner(); fitScreen();
  changed();
})();
