// Cabina: escucha al expositor, sugiere lo que dijo y controla TVs y OBS.
import { demo, requireSession, loadSongs, loadBible, roomId } from './db.js';
import { createCatalog } from './catalog.js';
import { createPublisher, loadRoom } from './live.js';

const $ = id => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const ICON = { bible: '📖', hymn: '🎵', coro: '🎶', theme: '📌' };
const KIND = { bible: 'Cita', hymn: 'Himno', coro: 'Coro', theme: 'Tema' };
const DEFAULT_SETTINGS = { bannerSeconds: 25, location: '', showBanner: true, voiceLang: 'es-MX' };

const room = roomId();
let catalog = null, ctx = {};
let suggestions = [];
const seen = new Map();
let results = [], sel = 0;
let state = { rev: 0, item: null, index: 0, blank: false, theme: '', overlay: { visible: false, tag: '', title: '', seq: 0, until: 0 },
  settings: { ...DEFAULT_SETTINGS }, history: [] };

// ---------- utilidades ----------
let toastTimer;
function toast(text, kind = 'error') {
  const t = $('toast');
  t.textContent = text; t.className = 'toast show ' + kind;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.className = 'toast', 3500);
}
const ago = t => { const s = Math.round((Date.now() - t) / 1000); return s < 60 ? 'ahora' : Math.round(s / 60) + ' min'; };
const withRoom = path => `${location.origin}${path}?sala=${encodeURIComponent(room)}${demo ? '&demo' : ''}`;

// ---------- estado y acciones ----------
const publisher = createPublisher(room, {
  getState: () => state,
  onSyncChange(status, message) {
    const dot = $('conn');
    dot.className = 'dot ' + (status === 'ok' ? 'ok' : status === 'demo' ? 'warn' : '');
    dot.title = status === 'ok' ? 'Sincronizado con Supabase' : status === 'demo' ? 'Modo demo: solo esta computadora'
      : 'Sin conexión con Supabase. Las TVs de esta computadora siguen funcionando. ' + (message || '');
  }
});

function commit() {
  state.rev = Math.max(state.rev + 1, Date.now());
  publisher.publish(state);
  render();
}

let overlayTimer;
function showOverlay(tag, title) {
  clearTimeout(overlayTimer);
  if (!state.settings.showBanner || !title) { state.overlay = { ...state.overlay, visible: false }; return; }
  const secs = Number(state.settings.bannerSeconds);
  state.overlay = { visible: true, tag, title, seq: state.overlay.seq + 1, until: secs > 0 ? Date.now() + secs * 1000 : 0 };
  if (secs > 0) overlayTimer = setTimeout(() => { state.overlay = { ...state.overlay, visible: false }; commit(); }, secs * 1000);
}
function hideOverlay() { clearTimeout(overlayTimer); state.overlay = { ...state.overlay, visible: false }; }

const actions = {
  air(ref) {
    const item = catalog?.resolve(ref);
    if (!item) return toast('No se encontró eso en el catálogo.');
    state.item = item; state.index = 0; state.blank = false;
    if (item.kind === 'theme') state.theme = item.banner.title;
    showOverlay(item.banner.tag, item.banner.title);
    const clean = { ...ref }; delete clean.label;
    state.history = [{ ref: clean, label: item.label, at: Date.now() }, ...state.history.filter(h => h.label !== item.label)].slice(0, 30);
    dropWhere(s => s.item.key === item.key);
    commit();
  },
  go(i) {
    if (!state.item) return;
    state.index = Math.max(0, Math.min(state.item.slides.length - 1, i)); state.blank = false; commit();
  },
  next() { if (state.item) actions.go(state.index + 1); },
  prev() { if (state.item) actions.go(state.index - 1); },
  clear() { state.item = null; state.index = 0; state.blank = false; hideOverlay(); commit(); },
  blank() { state.blank = !state.blank; commit(); },
  banner(show) {
    if (show && state.item?.banner) showOverlay(state.item.banner.tag, state.item.banner.title);
    else if (show && state.theme) showOverlay('Tema', state.theme);
    else if (show && state.settings.location) showOverlay('Transmitiendo desde', state.settings.location);
    else hideOverlay();
    commit();
  },
  location() {
    if (!state.settings.location) return toast('Primero escribe la ubicación en Ajustes ⚙', 'info');
    showOverlay('Transmitiendo desde', state.settings.location); commit();
  }
};

// ---------- pintar ----------
function render() {
  const item = state.item;
  $('onairLabel').textContent = item ? item.label + (state.blank ? ' (en fondo)' : '') : state.theme ? 'Fondo con tema: ' + state.theme : 'Nada';
  $('onair').classList.toggle('live', !!item && !state.blank);
  $('btnBlank').classList.toggle('on', state.blank);
  $('btnBanner').classList.toggle('on', state.overlay.visible);
  const os = $('overlayStatus');
  os.textContent = state.overlay.visible ? 'Banner OBS: ' + state.overlay.tag + ' — ' + state.overlay.title
    : state.settings.showBanner ? 'Banner OBS: oculto' : 'Banner OBS: desactivado en Ajustes';
  os.classList.toggle('on', state.overlay.visible);
  if (document.activeElement !== $('theme')) $('theme').value = state.theme || '';

  const list = $('slides'); list.replaceChildren();
  if (item) {
    item.slides.forEach((s, i) => {
      const li = el('li', i === state.index ? 'cur' : '');
      li.append(el('b', '', item.kind === 'bible' ? s.header : s.lines?.length ? (s.label || '') : 'Portada'),
        el('span', '', s.text || (s.lines?.length ? s.lines.join(' / ') : s.title)));
      li.onclick = () => actions.go(i);
      list.append(li);
    });
    $('slidePos').textContent = (state.index + 1) + ' / ' + item.slides.length;
    list.children[state.index]?.scrollIntoView({ block: 'nearest' });
  } else $('slidePos').textContent = '–';

  const h = $('history'); h.replaceChildren();
  for (const entry of state.history) {
    const li = el('li');
    li.append(el('span', 'k', ICON[entry.ref.kind] || '•'), el('span', 't', entry.label), el('span', 'when', ago(entry.at)));
    li.title = 'Volver a poner al aire';
    li.onclick = () => actions.air(entry.ref);
    h.append(li);
  }
}

// ---------- sugerencias ----------
function addSuggestion(item) {
  const now = Date.now();
  if (seen.has(item.key) && now - seen.get(item.key) < 120000) return false;
  if (state.item?.key === item.key) return false;
  seen.set(item.key, now);
  if (item.kind === 'bible' && item.from) {
    dropWhere(s => s.item.kind === 'bible' && !s.item.from && s.item.book === item.book && s.item.chapter === item.chapter && now - s.at < 30000);
  }
  suggestions.unshift({ id: now + Math.random(), item, at: now });
  suggestions = suggestions.slice(0, 8);
  renderSuggestions();
  if (item.kind === 'theme' && !$('theme').value.trim() && document.activeElement !== $('theme')) $('theme').value = item.text;
  return true;
}
function dropWhere(fn) {
  const before = suggestions.length;
  suggestions = suggestions.filter(s => !fn(s));
  if (suggestions.length !== before) renderSuggestions();
}
function accept(s) {
  let ref = s.item;
  if (ref.kind === 'theme') {
    const input = document.querySelector(`[data-sid="${s.id}"] input`);
    ref = { kind: 'theme', text: input ? input.value : ref.text };
  }
  dropWhere(x => x.id === s.id);
  actions.air(ref);
}
function dismiss(s) { seen.set(s.item.key, Date.now()); dropWhere(x => x.id === s.id); }

function renderSuggestions() {
  const ol = $('suggestions'); ol.replaceChildren();
  $('noSuggestions').hidden = suggestions.length > 0;
  suggestions.forEach((s, i) => {
    const li = el('li', 'card' + (i === 0 ? ' first' : ''));
    li.dataset.sid = s.id;
    const label = el('div', 'label');
    if (s.item.kind === 'theme') {
      const input = el('input'); input.value = s.item.text; input.maxLength = 200;
      input.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); accept(s); } };
      label.append(input);
    } else label.textContent = s.item.label;
    const meta = el('div', 'meta');
    const go = el('button', 'primary', i === 0 ? 'Al aire ⏎' : 'Al aire'); go.onclick = () => accept(s);
    const no = el('button', '', '✕'); no.title = 'Descartar'; no.onclick = () => dismiss(s);
    meta.append(el('span', '', KIND[s.item.kind] + ' · ' + ago(s.at)), el('span', 'grow'), go, no);
    li.append(el('span', 'kind', ICON[s.item.kind]), label, meta);
    ol.append(li);
  });
}
setInterval(() => { if (suggestions.length) renderSuggestions(); }, 30000);

// ---------- voz ----------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null, listening = false, lastFinal = '', restartDelay = 250;
const micBtn = $('btnMic'), micStatus = $('micStatus');
const finalsEl = el('div'), interimEl = el('div', 'interim');
$('transcript').append(interimEl, finalsEl);

function setMic(on, text) {
  micBtn.classList.toggle('on', on);
  micBtn.firstChild.textContent = on ? '⏹ Dejar de escuchar ' : '🎙 Escuchar ';
  if (text) micStatus.textContent = text;
}
function startListening() {
  if (!SR) return toast('El reconocimiento de voz solo funciona en Google Chrome o Microsoft Edge.');
  if (!catalog) return toast('Aún se está cargando el catálogo, intenta en un segundo.', 'info');
  listening = true;
  rec = new SR();
  rec.lang = state.settings.voiceLang || 'es-MX';
  rec.continuous = true;
  rec.interimResults = true;
  rec.onstart = () => { restartDelay = 250; setMic(true, 'Escuchando… (usa el micrófono predeterminado del navegador)'); };
  rec.onresult = e => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) heard(r[0].transcript.trim()); else interim += r[0].transcript;
    }
    interimEl.textContent = interim;
  };
  rec.onerror = e => {
    if (e.error === 'no-speech' || e.error === 'aborted') return;
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      listening = false; setMic(false, 'El navegador no tiene permiso para usar el micrófono. Da clic en el candado de la barra de direcciones.');
    } else if (e.error === 'audio-capture') {
      micStatus.textContent = 'No se detecta micrófono. Revisa que el receptor esté conectado.';
    } else if (e.error === 'network') {
      micStatus.textContent = 'Sin internet: el reconocimiento de voz necesita conexión. Reintentando…';
      restartDelay = Math.min(restartDelay * 2, 8000);
    } else micStatus.textContent = 'Error de voz: ' + e.error;
  };
  rec.onend = () => {
    if (listening) setTimeout(() => { if (listening) try { rec.start(); } catch {} }, restartDelay);
    else setMic(false, 'Apagado.');
  };
  try { rec.start(); } catch (err) { toast('No se pudo iniciar el micrófono: ' + err.message); }
}
function stopListening() { listening = false; try { rec?.stop(); } catch {} setMic(false, 'Apagado.'); interimEl.textContent = ''; }
micBtn.onclick = () => listening ? stopListening() : startListening();
if (!SR) { micBtn.disabled = true; micStatus.textContent = 'Abre la cabina en Google Chrome o Edge para usar la voz. El buscador funciona igual.'; }

function heard(text) {
  if (!text || !catalog) return;
  // Se analiza junto con el fragmento anterior para no perder citas partidas en dos.
  const { items, context } = catalog.detector.detect(lastFinal + ' ' + text, { mode: 'speech', context: ctx });
  ctx = context; lastFinal = text;
  const line = el('p'); line.style.margin = '0 0 6px';
  line.append(document.createTextNode(text + ' '));
  for (const it of items) if (addSuggestion(it)) line.append(el('mark', '', ICON[it.kind] + ' ' + it.label), document.createTextNode(' '));
  finalsEl.prepend(line);
  while (finalsEl.children.length > 40) finalsEl.lastChild.remove();
}
window.simularVoz = heard; // para probar sin micrófono desde la consola

// ---------- buscador ----------
const search = $('search');
let searchTimer;
search.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { results = catalog ? catalog.search(search.value) : []; sel = 0; renderResults(); }, 60);
});
search.addEventListener('keydown', e => {
  if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(results.length - 1, sel + 1); renderResults(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); renderResults(); }
  else if (e.key === 'Enter') { e.preventDefault(); if (results[sel]) { actions.air(results[sel]); search.select(); } }
  else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); search.value = ''; results = []; renderResults(); search.blur(); }
});
function renderResults() {
  const ol = $('results'); ol.replaceChildren();
  results.forEach((r, i) => {
    const li = el('li', i === sel ? 'sel' : '');
    li.append(el('span', 'k', ICON[r.kind]), el('span', 't', r.label));
    if (i === sel) li.append(el('kbd', '', 'Enter'));
    li.onclick = () => actions.air(r);
    ol.append(li);
  });
  ol.children[sel]?.scrollIntoView({ block: 'nearest' });
}

// ---------- tema ----------
const themeInput = $('theme');
const airTheme = () => { const text = themeInput.value.trim(); if (text) { actions.air({ kind: 'theme', text }); themeInput.blur(); } };
$('btnTheme').onclick = airTheme;
themeInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); airTheme(); } if (e.key === 'Escape') themeInput.blur(); });

// ---------- botones y teclado ----------
$('btnPrev').onclick = actions.prev;
$('btnNext').onclick = actions.next;
$('btnClear').onclick = actions.clear;
$('btnBlank').onclick = actions.blank;
$('btnBanner').onclick = () => actions.banner(!state.overlay.visible);
$('btnLocation').onclick = actions.location;
// Evita que Enter o Espacio repitan el último botón presionado.
document.addEventListener('click', e => { const b = e.target.closest('button'); if (b && e.detail > 0) b.blur(); });

document.addEventListener('keydown', e => {
  if ($('settings').open || e.target.closest('input, select, textarea')) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const map = {
    Enter: () => suggestions[0] && accept(suggestions[0]),
    Delete: () => suggestions[0] && dismiss(suggestions[0]),
    Backspace: () => suggestions[0] && dismiss(suggestions[0]),
    ArrowRight: actions.next, ' ': actions.next, PageDown: actions.next, ArrowDown: actions.next,
    ArrowLeft: actions.prev, PageUp: actions.prev, ArrowUp: actions.prev,
    Escape: actions.clear,
    b: actions.blank, o: () => $('btnBanner').click(), u: actions.location, m: () => micBtn.click(),
    '/': () => { search.focus(); search.select(); }
  };
  const fn = map[e.key.length === 1 ? e.key.toLowerCase() : e.key] || map[e.key];
  if (fn) { e.preventDefault(); fn(); }
});

// ---------- ajustes ----------
const dlg = $('settings'), form = $('settingsForm');
$('btnSettings').onclick = () => {
  const s = state.settings;
  form.location.value = s.location || '';
  form.bannerSeconds.value = s.bannerSeconds ?? 25;
  form.showBanner.checked = s.showBanner !== false;
  form.voiceLang.value = s.voiceLang || 'es-MX';
  $('urlTv').textContent = withRoom('/pantalla');
  $('urlObs').textContent = withRoom('/overlay');
  dlg.showModal();
};
dlg.addEventListener('close', () => {
  if (dlg.returnValue !== 'save') return;
  const secs = Math.max(0, Math.min(3600, parseInt(form.bannerSeconds.value, 10) || 0));
  state.settings = { ...state.settings, location: form.location.value.trim().slice(0, 120), bannerSeconds: secs,
    showBanner: form.showBanner.checked, voiceLang: form.voiceLang.value };
  if (!state.settings.showBanner) hideOverlay();
  commit();
  if (listening) { stopListening(); setTimeout(startListening, 400); }
});

// ---------- arranque ----------
(async () => {
  await requireSession();
  $('monitor').src = withRoom('/pantalla');
  $('lnkSongs').href = '/cantos' + (demo ? '?demo' : '');
  if (demo) toast('Modo demo: sin base de datos, solo funciona en esta computadora.', 'info');
  try {
    const saved = demo ? null : await loadRoom(room);
    if (!demo && !saved) { toast('Esa sala no existe. Elige una desde el inicio.'); setTimeout(() => location.href = '/', 2500); return; }
    if (saved?.state?.rev) {
      state = { ...state, ...saved.state, settings: { ...DEFAULT_SETTINGS, ...saved.state.settings } };
      state.overlay = { ...state.overlay, visible: state.overlay.visible && (!state.overlay.until || state.overlay.until > Date.now()) };
    }
    document.title = (saved?.name ? saved.name + ' · ' : '') + 'Cabina en Vivo';
    const [songs, bible] = await Promise.all([loadSongs(), loadBible()]);
    catalog = createCatalog({ songs, bible });
    if (!catalog.counts.songs) toast('Aún no tienes cantos. Agrégalos en la página Cantos.', 'info');
    commit();
  } catch (err) { toast(err.message); }
})();
render();
renderSuggestions();
