// Cabina: escucha al expositor, sugiere lo que dijo y controla TVs y OBS.
import { demo, requireSession, loadSongs, loadBible, roomId } from './db.js';
import { createCatalog } from './catalog.js';
import { createPublisher, loadRoom } from './live.js';
import { createTurno } from './turno.js';
import { $, toast, mountNav, absolute, withDemo, modal } from './ui.js';
import { icon } from './icons.js';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const ICON_NAME = { bible: 'biblia', hymn: 'himno', coro: 'coro', theme: 'tema' };
const kindIcon = (kind, size = 18) => icon(ICON_NAME[kind] || 'texto', { size });
const KIND = { bible: 'Cita', hymn: 'Himno', coro: 'Coro', theme: 'Tema' };
const DEFAULT_SETTINGS = { bannerSeconds: 25, speakerSeconds: 0, location: '', showBanner: true, voiceLang: 'es-MX' };

const room = roomId();
let catalog = null, ctx = {};
let suggestions = [];
const seen = new Map();
let results = [], sel = 0;
let state = { rev: 0, item: null, index: 0, blank: false, theme: '', overlay: { visible: false, tag: '', title: '', seq: 0, until: 0 },
  speaker: { visible: false, tag: '', title: '', seq: 0, until: 0 }, speakers: [],
  settings: { ...DEFAULT_SETTINGS }, history: [] };

// ---------- utilidades ----------
const ago = t => { const s = Math.round((Date.now() - t) / 1000); return s < 60 ? 'ahora' : 'hace ' + Math.round(s / 60) + ' min'; };

// ---------- estado y acciones ----------
const publisher = createPublisher(room, {
  getState: () => state,
  onSyncChange(status, message) {
    const s = $('navSala');
    if (!s) return;
    s.dataset.sync = status;
    s.title = status === 'ok' ? 'Conectado: la transmisión recibe los cambios' : status === 'demo' ? 'Modo de prueba: solo esta computadora'
      : 'Sin internet: las TVs de esta laptop siguen funcionando, pero OBS no recibe cambios. ' + (message || '');
  }
});

function commit() {
  state.rev = Math.max(state.rev + 1, Date.now());
  publisher.publish(state);
  render();
}

let overlayTimer;
const TYPE_OF = { bible: 'lectura', hymn: 'himno', coro: 'coro', theme: 'tema' };
function showOverlay(tag, title, type = 'lectura') {
  clearTimeout(overlayTimer);
  if (!state.settings.showBanner || !title) { state.overlay = { ...state.overlay, visible: false }; return; }
  const secs = Number(state.settings.bannerSeconds);
  state.overlay = { visible: true, tag, title, type, seq: state.overlay.seq + 1, until: secs > 0 ? Date.now() + secs * 1000 : 0 };
  if (secs > 0) overlayTimer = setTimeout(() => { state.overlay = { ...state.overlay, visible: false }; commit(); }, secs * 1000);
}
function hideOverlay() { clearTimeout(overlayTimer); state.overlay = { ...state.overlay, visible: false }; }

let speakerTimer;
function showSpeaker(name, role) {
  clearTimeout(speakerTimer);
  const secs = Number(state.settings.speakerSeconds) || 0;
  state.speaker = { visible: true, tag: role, title: name, seq: state.speaker.seq + 1, until: secs > 0 ? Date.now() + secs * 1000 : 0 };
  state.speakers = [{ name, role }, ...state.speakers.filter(p => p.name !== name)].slice(0, 6);
  if (secs > 0) speakerTimer = setTimeout(() => { state.speaker = { ...state.speaker, visible: false }; commit(); }, secs * 1000);
  commit();
}
function hideSpeaker() { clearTimeout(speakerTimer); state.speaker = { ...state.speaker, visible: false }; commit(); }

const actions = {
  air(ref) {
    const item = catalog?.resolve(ref);
    if (!item) return toast('No se encontró eso en el catálogo.');
    state.item = item; state.index = 0; state.blank = false;
    if (item.kind === 'theme') state.theme = item.banner.title;
    showOverlay(item.banner.tag, item.banner.title, TYPE_OF[item.kind]);
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
    if (show && state.item?.banner) showOverlay(state.item.banner.tag, state.item.banner.title, TYPE_OF[state.item.kind]);
    else if (show && state.theme) showOverlay('Tema', state.theme, 'tema');
    else if (show && state.settings.location) showOverlay('Transmitiendo desde', state.settings.location, 'ubicacion');
    else hideOverlay();
    commit();
  },
  location() {
    if (!state.settings.location) return toast('Primero escribe la ubicación en Ajustes.', 'info');
    showOverlay('Transmitiendo desde', state.settings.location, 'ubicacion'); commit();
  }
};

// ---------- pintar ----------
const KIND_LONG = { bible: 'Lectura', hymn: 'Himno', coro: 'Coro', theme: 'Tema del culto' };
function render() {
  const item = state.item;
  const est = $('estado');
  est.className = 'estado' + (item && !state.blank ? ' vivo' : item ? ' pausa' : '');
  $('estadoTxt').textContent = item && !state.blank ? 'En pantalla' : item ? 'Texto oculto' : 'Nada en pantalla';
  if (item) {
    $('onairLabel').textContent = item.label;
    const slide = item.slides[state.index];
    const part = item.slides.length > 1 ? `Parte ${state.index + 1} de ${item.slides.length}` : KIND_LONG[item.kind];
    const name = item.kind === 'bible' ? slide?.header : slide?.lines?.length ? slide.label : item.slides.length > 1 ? 'Portada' : '';
    $('onairSub').textContent = [part, name].filter(Boolean).join(' · ') + (state.blank ? ' · las TVs muestran solo el fondo' : '');
  } else {
    $('onairLabel').textContent = state.theme ? 'Solo el tema' : 'Nada al aire';
    $('onairSub').textContent = state.theme ? state.theme : 'Cuando pongas algo, aparecerá aquí.';
  }
  $('btnPrev').disabled = !item || state.index === 0;
  $('mPrev').disabled = !item || state.index === 0;
  $('mNext').disabled = !item || state.index >= item.slides.length - 1;
  $('mClear').disabled = !item && !state.overlay.visible;
  $('btnNext').disabled = !item || state.index >= item.slides.length - 1;
  $('btnBlank').disabled = !item;
  $('btnBlank').textContent = state.blank ? 'Mostrar texto' : 'Ocultar texto';
  $('btnBlank').classList.toggle('activo', state.blank);
  $('btnBanner').textContent = state.overlay.visible ? 'Ocultar letrero' : 'Mostrar letrero';
  $('btnBanner').classList.toggle('activo', state.overlay.visible);
  const os = $('overlayStatus');
  os.textContent = state.overlay.visible ? 'En la transmisión: ' + state.overlay.tag + ' · ' + state.overlay.title
    : state.settings.showBanner ? 'Letrero de la transmisión: oculto' : 'Letrero de la transmisión: apagado en Ajustes';
  os.classList.toggle('on', state.overlay.visible);
  if (document.activeElement !== $('theme')) $('theme').value = state.theme || '';

  const sp = state.speaker;
  $('btnSpeaker').textContent = sp.visible ? 'Ocultar nombre' : 'Mostrar nombre';
  $('btnSpeaker').className = 'btn ' + (sp.visible ? 'btn-sec activo' : 'btn-oro');
  if (sp.visible && document.activeElement !== $('spName') && document.activeElement !== $('spRole')) { $('spName').value = sp.title; $('spRole').value = sp.tag || ''; }
  const rec = $('spRecent'); rec.replaceChildren();
  for (const p of state.speakers) {
    const chip = el('span', 'chip chip-nombre');
    const use = el('button', 'usar', p.name + (p.role ? ' · ' + p.role : '')); use.type = 'button'; use.title = 'Poner este nombre';
    use.onclick = () => { $('spName').value = p.name; $('spRole').value = p.role || ''; showSpeaker(p.name, p.role || ''); };
    const del = el('button', 'quitar'); del.append(icon('cerrar', { size: 14 })); del.type = 'button'; del.title = 'Quitar de la lista'; del.setAttribute('aria-label', 'Quitar ' + p.name);
    del.onclick = () => { state.speakers = state.speakers.filter(x => x.name !== p.name || x.role !== p.role); commit(); };
    chip.append(use, del);
    rec.append(chip);
  }

  const list = $('slides'); list.replaceChildren();
  if (item && item.slides.length > 1) {
    item.slides.forEach((s, i) => {
      const li = el('li', i === state.index ? 'cur' : '');
      li.append(el('b', '', item.kind === 'bible' ? s.header : s.lines?.length ? (s.label || 'Parte ' + (i + 1)) : 'Portada'),
        el('span', '', s.text || (s.lines?.length ? s.lines.join(' / ') : s.title)));
      li.onclick = () => actions.go(i);
      li.title = 'Poner esta parte';
      list.append(li);
    });
    list.children[state.index]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  const h = $('history'); h.replaceChildren();
  $('noHistory').hidden = state.history.length > 0;
  $('clearHistory').hidden = !state.history.length;
  for (const entry of state.history.slice(0, 12)) {
    const li = el('li');
    const del = el('button', 'quitar'); del.append(icon('cerrar', { size: 14 })); del.type = 'button'; del.title = 'Quitar de la lista'; del.setAttribute('aria-label', 'Quitar de la lista');
    del.onclick = e => { e.stopPropagation(); state.history = state.history.filter(x => x !== entry); commit(); };
    const k = el('span', 'k'); k.append(kindIcon(entry.ref.kind));
    li.append(k, el('span', 't', entry.label), el('span', 'when', ago(entry.at)), del);
    li.title = 'Volver a ponerlo en pantalla';
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
      const input = el('input', 'campo'); input.value = s.item.text; input.maxLength = 200; input.title = 'Puedes corregirlo antes de ponerlo';
      input.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); accept(s); } };
      label.append(input);
    } else {
      label.textContent = s.item.label;
      if (s.item.snippet) label.append(el('span', 'snip', '“' + s.item.snippet + '”'));
    }
    const go = el('button', 'btn btn-primario', 'Poner en pantalla'); go.type = 'button'; go.onclick = () => accept(s);
    if (i === 0) go.title = 'Tecla Enter';
    const no = el('button', 'btn btn-mini'); no.append(icon('cerrar', { size: 16 })); no.setAttribute('aria-label', 'Descartar'); no.type = 'button'; no.title = 'Descartar (Supr)'; no.onclick = () => dismiss(s);
    const acc = el('div', 'acc'); acc.append(go, no);
    const k = el('span', 'kind'); k.append(kindIcon(s.item.kind, 24));
    li.append(k, label, acc,
      el('div', 'meta', KIND[s.item.kind] + (s.item.byText ? ' · lo leyó sin decir la cita · ' + ago(s.at) : ' · se dijo ' + ago(s.at))
        + (s.item.kind === 'theme' ? ' · puedes corregirlo' : '')));
    ol.append(li);
  });
}
setInterval(() => { if (suggestions.length) renderSuggestions(); }, 30000);

// ---------- voz ----------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null, listening = false, lastFinal = '', heardWords = '', restartDelay = 250;
const micBtn = $('btnMic'), micStatus = $('micStatus');
const finalsEl = el('div'), interimEl = el('div', 'interim');
$('transcript').append(interimEl, finalsEl);

function setMic(on, text) {
  micBtn.classList.toggle('on', on);
  micBtn.replaceChildren(icon(on ? 'detener' : 'mic'), on ? 'Dejar de escuchar' : 'Escuchar');
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
  rec.onstart = () => { restartDelay = 250; setMic(true, 'Escuchando… Habla cerca del micrófono para probar: di “Juan tres dieciséis”.'); };
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
    else setMic(false, 'El micrófono está apagado. Presiona Escuchar para volver a empezar.');
  };
  try { rec.start(); } catch (err) { toast('No se pudo iniciar el micrófono: ' + err.message); }
}
function stopListening() { listening = false; try { rec?.stop(); } catch {} setMic(false, 'El micrófono está apagado. Presiona Escuchar para volver a empezar.'); interimEl.textContent = ''; }
micBtn.onclick = () => listening ? stopListening() : startListening();
micBtn.replaceChildren(icon('mic'), 'Escuchar');
if (!SR) { micBtn.disabled = true; micStatus.textContent = 'Abre la cabina en Google Chrome o Edge para usar la voz. El buscador funciona igual.'; }

function heard(text) {
  if (!text || !catalog) return;
  // Se analiza junto con el fragmento anterior para no perder citas partidas en dos.
  const { items, context } = catalog.detector.detect(lastFinal + ' ' + text, { mode: 'speech', context: ctx });
  ctx = context; lastFinal = text;
  // Si leyó el versículo sin decir la cita, se busca por lo que dijo.
  heardWords = (heardWords + ' ' + text).split(/\s+/).slice(-60).join(' ');
  const [verse] = catalog.findVerses(heardWords, { mode: 'speech', limit: 1 });
  if (verse && !items.some(i => i.key === verse.key)) { items.push(verse); ctx = { ...ctx, book: verse.book, chapter: verse.chapter }; }
  const line = el('p'); line.style.margin = '0 0 6px';
  line.append(document.createTextNode(text + ' '));
  // Durante la prueba de micrófono no se llenan las sugerencias de la cabina.
  if (micTest) { micTestHeard(text, items); return; }
  for (const it of items) if (addSuggestion(it)) { const mk = el('mark'); mk.append(kindIcon(it.kind, 13), ' ' + it.label); line.append(mk, document.createTextNode(' ')); }
  finalsEl.prepend(line);
  while (finalsEl.children.length > 40) finalsEl.lastChild.remove();
}
window.simularVoz = heard; // para probar sin micrófono desde la consola

// ---------- Prueba de micrófono ----------
const PHRASES = [
  { say: 'Juan capítulo tres, versículo dieciséis', expect: 'Juan 3:16', ok: i => i.kind === 'bible' && i.label === 'Juan 3:16' },
  { say: 'Cantemos el himno número uno', expect: 'Himno 1', ok: i => i.kind === 'hymn' && i.number === 1 },
  { say: 'El tema de hoy es la fe que vence al mundo', expect: 'Tema', ok: i => i.kind === 'theme' },
  { say: 'Jehová es mi pastor, nada me faltará, en lugares de delicados pastos', expect: 'Salmos 23:1 (sin decir la cita)', ok: i => i.kind === 'bible' && i.byText && i.label === 'Salmos 23:1' }
];
let micTest = null;
function micTestHeard(text, items) {
  if (!micTest) return;
  $('micHeard').textContent = text;
  PHRASES.forEach((p, n) => { if (items.some(p.ok)) micTest.done.add(n); });
  renderPhrases();
}
function renderPhrases() {
  $('micPhrases').replaceChildren(...PHRASES.map((p, n) => {
    const li = el('li', micTest?.done.has(n) ? 'hecho' : '');
    const txt = el('span', '', '“' + p.say + '”'); txt.append(el('small', '', 'Debe aparecer: ' + p.expect));
    const ok = el('span', 'ok'); ok.append(icon('ok', { size: 14 }));
    li.append(ok, txt);
    return li;
  }));
}
async function openMicTest() {
  micTest = { done: new Set(), startedListening: false };
  renderPhrases();
  $('micHeard').textContent = '—';
  $('micTest').showModal();
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const track = stream.getAudioTracks()[0];
    $('micName').textContent = track?.label || 'Micrófono predeterminado';
    const ctxA = new (window.AudioContext || window.webkitAudioContext)();
    const an = ctxA.createAnalyser(); an.fftSize = 1024;
    ctxA.createMediaStreamSource(stream).connect(an);
    const buf = new Float32Array(an.fftSize);
    let quiet = 0;
    const loop = () => {
      if (!micTest) return;
      an.getFloatTimeDomainData(buf);
      const rms = Math.sqrt(buf.reduce((a, v) => a + v * v, 0) / buf.length);
      const pct = Math.min(100, Math.round(rms * 400));
      $('micLevel').style.width = pct + '%';
      quiet = pct < 3 ? quiet + 1 : 0;
      $('micHint').textContent = quiet > 240 ? 'No se oye nada. Revisa que el micrófono esté encendido y sea el correcto.' : 'Habla: la barra debe moverse con tu voz.';
      micTest.raf = requestAnimationFrame(loop);
    };
    Object.assign(micTest, { stream, ctxA });
    loop();
  } catch (err) {
    $('micName').textContent = 'No hay permiso para usar el micrófono';
    $('micHint').textContent = 'Da clic en el candado de la barra de direcciones y permite el micrófono.';
  }
  if (!listening && SR) { micTest.startedListening = true; startListening(); }
}
function closeMicTest() {
  if (!micTest) return;
  cancelAnimationFrame(micTest.raf);
  micTest.stream?.getTracks().forEach(t => t.stop());
  micTest.ctxA?.close();
  if (micTest.startedListening) stopListening();
  micTest = null;
}
$('btnMicTest').onclick = openMicTest;
$('micTestClose').onclick = () => $('micTest').close();
$('micTest').addEventListener('close', closeMicTest);

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
    const k = el('span', 'k'); k.append(kindIcon(r.kind));
    li.append(k, el('span', 't', r.label));
    if (i === sel) li.append(el('span', 'hint', 'Enter para poner'));
    li.title = 'Poner en pantalla';
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
$('mPrev').onclick = actions.prev;
$('mNext').onclick = actions.next;
$('mClear').onclick = actions.clear;
$('btnNext').onclick = actions.next;
$('btnClear').onclick = actions.clear;
$('btnBlank').onclick = actions.blank;
$('btnBanner').onclick = () => actions.banner(!state.overlay.visible);
$('btnLocation').onclick = actions.location;
// Evita que Enter o Espacio repitan el último botón presionado.
document.addEventListener('click', e => { const b = e.target.closest('button'); if (b && e.detail > 0) b.blur(); });

document.addEventListener('keydown', e => {
  if (document.querySelector('dialog[open]') || e.target.closest('input, select, textarea')) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const map = {
    Enter: () => suggestions[0] && accept(suggestions[0]),
    Delete: () => suggestions[0] && dismiss(suggestions[0]),
    Backspace: () => suggestions[0] && dismiss(suggestions[0]),
    ArrowRight: actions.next, ' ': actions.next, PageDown: actions.next, ArrowDown: actions.next,
    ArrowLeft: actions.prev, PageUp: actions.prev, ArrowUp: actions.prev,
    Escape: actions.clear,
    b: actions.blank, o: () => $('btnBanner').click(), u: actions.location, m: () => micBtn.click(),
    n: () => state.speaker.visible ? hideSpeaker() : $('spForm').requestSubmit(),
    '/': () => { search.focus(); search.select(); }
  };
  const fn = map[e.key.length === 1 ? e.key.toLowerCase() : e.key] || map[e.key];
  if (fn) { e.preventDefault(); fn(); }
});

$('clearHistory').onclick = async () => {
  if (await modal({ title: 'Borrar lo último que pusiste', text: 'Se borra la lista. Lo que está en pantalla no cambia.', ok: 'Sí, borrar', danger: true })) { state.history = []; commit(); }
};

// ---------- expositor ----------
$('spForm').addEventListener('submit', e => {
  e.preventDefault();
  const name = $('spName').value.trim(), role = $('spRole').value.trim();
  if (state.speaker.visible && (!name || (name === state.speaker.title && role === (state.speaker.tag || '')))) return hideSpeaker();
  if (!name) { $('spName').focus(); return toast('Escribe el nombre de quien expone.', 'info'); }
  showSpeaker(name, role);
  document.activeElement?.blur();
});
for (const id of ['spName', 'spRole']) $(id).addEventListener('input', () => {
  const changedName = state.speaker.visible && ($('spName').value.trim() !== state.speaker.title || $('spRole').value.trim() !== (state.speaker.tag || ''));
  $('btnSpeaker').textContent = changedName ? 'Cambiar nombre' : state.speaker.visible ? 'Ocultar nombre' : 'Mostrar nombre';
});

// ---------- ajustes ----------
const dlg = $('settings'), form = $('settingsForm');
$('btnSettings').onclick = () => {
  const s = state.settings;
  form.location.value = s.location || '';
  form.bannerSeconds.value = s.bannerSeconds ?? 25;
  form.showBanner.checked = s.showBanner !== false;
  form.voiceLang.value = s.voiceLang || 'es-MX';
  form.speakerSeconds.value = s.speakerSeconds ?? 0;
  $('urlTv').textContent = absolute('/pantalla', { sala: room });
  $('urlObs').textContent = absolute('/overlay', { sala: room });
  dlg.showModal();
};
dlg.addEventListener('close', () => {
  if (dlg.returnValue !== 'save') return;
  const secs = Math.max(0, Math.min(3600, parseInt(form.bannerSeconds.value, 10) || 0));
  const spSecs = Math.max(0, Math.min(3600, parseInt(form.speakerSeconds.value, 10) || 0));
  state.settings = { ...state.settings, location: form.location.value.trim().slice(0, 120), bannerSeconds: secs, speakerSeconds: spSecs,
    showBanner: form.showBanner.checked, voiceLang: form.voiceLang.value };
  if (!state.settings.showBanner) hideOverlay();
  commit();
  if (listening) { stopListening(); setTimeout(startListening, 400); }
});

// ---------- ayuda ----------
function setupGuide() {
  const guia = $('guia');
  const open = () => { guia.showModal(); try { localStorage.setItem('cabina-guia-vista', '1'); } catch {} $('primeraVez').hidden = true; };
  $('cerrarGuia').onclick = () => guia.close();
  $('verGuia').onclick = open;
  $('cerrarPrimera').onclick = () => { $('primeraVez').hidden = true; try { localStorage.setItem('cabina-guia-vista', '1'); } catch {} };
  const help = $('navAyuda'); if (help) { help.hidden = false; help.onclick = open; }
  let seen = false; try { seen = !!localStorage.getItem('cabina-guia-vista'); } catch {}
  $('primeraVez').hidden = seen;
}
for (const chip of document.querySelectorAll('#ejemplos .chip')) {
  chip.onclick = () => { search.value = chip.dataset.q; search.dispatchEvent(new Event('input')); search.focus(); };
}

// ---------- arranque ----------
(async () => {
  const session = await requireSession();
  mountNav('cabina');
  // Aviso si alguien más tiene abierta la cabina de esta sala (no bloquea: solo avisa).
  const meta = session.user.user_metadata || {};
  createTurno('cabina-' + room, { id: session.user.id, name: demo ? 'Otra pestaña' : (meta.name || session.user.email || 'Alguien') }, st => {
    const names = [...new Set(st.others.map(o => o.name))];
    $('otrosBar').hidden = !names.length;
    $('otrosTxt').textContent = names.length ? `${names.join(', ')} también ${names.length > 1 ? 'tienen' : 'tiene'} abierta esta cabina. Pónganse de acuerdo: lo que uno ponga reemplaza lo del otro.` : '';
  });
  setupGuide();
  $('monitor').src = withDemo('/overlay', { sala: room, preview: 'cam' });
  if (demo) toast('Modo de prueba: no se guarda nada y solo funciona en esta computadora.', 'info');
  try {
    const saved = demo ? null : await loadRoom(room);
    if (!demo && !saved) { toast('Esa sala no existe. Elige una desde el inicio.'); setTimeout(() => location.href = '/', 2500); return; }
    if (saved?.state?.rev) {
      state = { ...state, ...saved.state, settings: { ...DEFAULT_SETTINGS, ...saved.state.settings } };
      state.overlay = { ...state.overlay, visible: state.overlay.visible && (!state.overlay.until || state.overlay.until > Date.now()) };
      state.speaker = { visible: false, tag: '', title: '', seq: 0, until: 0, ...state.speaker };
      state.speaker.visible = state.speaker.visible && (!state.speaker.until || state.speaker.until > Date.now());
      state.speakers ??= [];
    }
    document.title = (saved?.name ? saved.name + ' · ' : '') + 'Cabina en Vivo';
    if ($('navSala')) $('navSala').textContent = saved?.name || 'Sala de prueba';
    const [songs, bible] = await Promise.all([loadSongs(saved?.team_id), loadBible()]);
    catalog = createCatalog({ songs, bible });
    setTimeout(() => catalog.warmUp(), 300); // arma el índice de versículos antes de que se necesite
    if (!catalog.counts.songs) toast('Aún no hay cantos. Agrégalos en la pestaña Cantos (arriba).', 'info');
    commit();
  } catch (err) { toast(err.message); }
})();
render();
renderSuggestions();
