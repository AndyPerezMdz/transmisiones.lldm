// Detector de citas bíblicas, himnos, coros y tema en texto hablado o escrito.
// Módulo ES: lo usan la cabina (voz y buscador) y las pruebas en Node.

const strip = s => s.replace(/[\u0300-\u036f]/g, '');
// Quita acentos carácter por carácter para conservar la misma longitud que el original.
const fold = s => Array.from(s, c => strip(c.normalize('NFD')).toLowerCase().charAt(0) || c).join('');
const norm = s => strip(String(s).normalize('NFD')).toLowerCase();

// ---------- Números en palabras ----------
const UNITS = { cero: 0, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
  diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17,
  dieciocho: 18, diecinueve: 19, veinte: 20, veintiuno: 21, veintiun: 21, veintidos: 22, veintitres: 23,
  veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29 };
const TENS = { treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90 };
const HUNDREDS = { cien: 100, ciento: 100, doscientos: 200, trescientos: 300, cuatrocientos: 400, quinientos: 500,
  seiscientos: 600, setecientos: 700, ochocientos: 800, novecientos: 900 };

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
function wordsToDigits(text) {
  const w = text.split(/\s+/);
  const out = [];
  for (let i = 0; i < w.length;) {
    let v = 0, j = i;
    if (has(HUNDREDS, w[j])) { v += HUNDREDS[w[j]]; j++; }
    if (has(TENS, w[j])) {
      v += TENS[w[j]]; j++;
      if (w[j] === 'y' && has(UNITS, w[j + 1]) && UNITS[w[j + 1]] > 0 && UNITS[w[j + 1]] < 10) { v += UNITS[w[j + 1]]; j += 2; }
    } else if (has(UNITS, w[j])) { v += UNITS[w[j]]; j++; }
    if (j === i) { out.push(w[i]); i++; } else { out.push(String(v)); i = j; }
  }
  return out.join(' ');
}

// ---------- Libros ----------
const EXTRA_ALIASES = {
  'Salmos': ['salmo', 'salmos'], 'Cantares': ['cantar de los cantares', 'cantares'],
  'Hechos': ['hechos de los apostoles', 'hechos'], 'Apocalipsis': ['apocalipsis', 'revelacion'],
  'Proverbios': ['proverbios', 'proverbio'], 'Lamentaciones': ['lamentaciones de jeremias', 'lamentaciones'],
  'Santiago': ['santiago', 'epistola de santiago']
};
// Abreviaturas solo para el buscador manual (en voz chocarían con palabras comunes como "mi" o "he").
const ABBREV = { gn: 'Génesis', gen: 'Génesis', ex: 'Éxodo', lv: 'Levítico', nm: 'Números', dt: 'Deuteronomio',
  jos: 'Josué', jue: 'Jueces', rt: 'Rut', '1s': '1 Samuel', '2s': '2 Samuel', '1r': '1 Reyes', '2r': '2 Reyes',
  '1cr': '1 Crónicas', '2cr': '2 Crónicas', esd: 'Esdras', neh: 'Nehemías', est: 'Ester', sal: 'Salmos', sl: 'Salmos',
  pr: 'Proverbios', prov: 'Proverbios', ec: 'Eclesiastés', ecl: 'Eclesiastés', cnt: 'Cantares', is: 'Isaías',
  jer: 'Jeremías', lm: 'Lamentaciones', ez: 'Ezequiel', dn: 'Daniel', os: 'Oseas', jl: 'Joel', am: 'Amós',
  abd: 'Abdías', jon: 'Jonás', mi: 'Miqueas', nah: 'Nahúm', hab: 'Habacuc', sof: 'Sofonías', hag: 'Hageo',
  zac: 'Zacarías', mal: 'Malaquías', mt: 'Mateo', mr: 'Marcos', mc: 'Marcos', lc: 'Lucas', jn: 'Juan',
  hch: 'Hechos', ro: 'Romanos', rom: 'Romanos', '1co': '1 Corintios', '2co': '2 Corintios', ga: 'Gálatas',
  gal: 'Gálatas', ef: 'Efesios', fil: 'Filipenses', flp: 'Filipenses', col: 'Colosenses', '1ts': '1 Tesalonicenses',
  '2ts': '2 Tesalonicenses', '1ti': '1 Timoteo', '2ti': '2 Timoteo', tit: 'Tito', flm: 'Filemón', he: 'Hebreos',
  heb: 'Hebreos', stg: 'Santiago', '1p': '1 Pedro', '2p': '2 Pedro', '1jn': '1 Juan', '2jn': '2 Juan',
  '3jn': '3 Juan', jud: 'Judas', ap: 'Apocalipsis', apoc: 'Apocalipsis' };

const ORDINAL = '(?:(1|2|3|i{1,3}|primera?|primero|segunda?|segundo|tercera?|tercero)\\s+(?:(?:carta|epistola)\\s+)?(?:(?:de|a)\\s+(?:los\\s+|san\\s+)?)?)';
const ORD_VALUE = { 1: 1, i: 1, primer: 1, primera: 1, primero: 1, 2: 2, ii: 2, segunda: 2, segundo: 2, segund: 2, 3: 3, iii: 3, tercer: 3, tercera: 3, tercero: 3 };

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function createDetector({ hymns = [], coros = [], bible = {} } = {}) {
  // bible: { "Juan": [versos por capítulo...] }
  const bookNames = Object.keys(bible);
  const plain = new Map();   // alias normalizado -> libro (sin número)
  const numbered = new Map(); // nombre base normalizado -> {1: libro, 2: libro}
  for (const name of bookNames) {
    const m = name.match(/^([123]) (.+)$/);
    if (m) {
      const base = norm(m[2]);
      if (!numbered.has(base)) numbered.set(base, {});
      numbered.get(base)[m[1]] = name;
    } else {
      for (const alias of EXTRA_ALIASES[name] || [norm(name)]) plain.set(alias, name);
      plain.set(norm(name), name);
    }
  }
  const plainAlt = [...plain.keys()].sort((a, b) => b.length - a.length).map(escapeRe).join('|');
  const numAlt = [...numbered.keys()].sort((a, b) => b.length - a.length).map(escapeRe).join('|');
  const abbrAlt = Object.keys(ABBREV).sort((a, b) => b.length - a.length).map(escapeRe).join('|');

  const VERSE_WORD = '(?:(?:del?|el|los)\\s+)?(?:versiculos?|versos?|vers|vs?)\\.?';
  const RANGE = '(?:\\s*(?:-|al?|hasta(?:\\s+el)?|y)\\s*(?:' + VERSE_WORD + '\\s*)?(\\d{1,3}))?';
  const CHAPTER_VERSE = '\\s*,?\\s*(?:(?:en\\s+)?(?:el\\s+)?capitulos?\\s*)?(\\d{1,3})(?:\\s*(?::|\\.|,|\\s)\\s*(?:' + VERSE_WORD + '\\s*|del?\\s+)?(\\d{1,3})' + RANGE + ')?';

  const reNumbered = new RegExp('\\b' + ORDINAL + '(?:san\\s+)?(' + numAlt + ')\\b' + CHAPTER_VERSE, 'g');
  const rePlain = new RegExp('\\b(?:(?:san|evangelio\\s+(?:de|segun)(?:\\s+san)?)\\s+)?(' + plainAlt + ')\\b' + CHAPTER_VERSE, 'g');
  const reAbbr = new RegExp('(?:^|\\s)(' + abbrAlt + ')\\.?\\s*' + CHAPTER_VERSE.replace('\\s*,?\\s*', ''), 'g');
  const reRelVerse = new RegExp('\\b(?:capitulos?\\s+(\\d{1,3})\\s*,?\\s*)?' + VERSE_WORD + '\\s*(\\d{1,3})' + RANGE, 'g');
  const reHymn = /\b(?:himnos?|himnario|h)\s*(?:numero\s+|no\.?\s*|#\s*)?(\d{1,3})\b/g;
  const reCoro = /\b(?:coros?|c)\s*(?:numero\s+|no\.?\s*|#\s*)?(\d{1,3})\b/g;
  const reTheme = /\btema\s+(?:(?:de\s+(?:hoy|esta\s+(?:noche|manana|tarde)|este\s+(?:culto|servicio|dia)|la\s+ensenanza|nuestra\s+ensenanza)|del\s+(?:culto|dia|servicio))\s+)?(?:es|sera|se\s+titula|se\s+llama|lleva\s+por\s+(?:titulo|nombre)|titulado)\s*:?\s*(.+)/;
  const SONG_TRIGGER = /\b(himnos?|coros?|canto|cantemos|cantaremos|entonemos|alabemos|alabanza|cancion)\b/;

  const hymnByNum = new Map(hymns.map(h => [h.number, h]));
  const coroByNum = new Map(coros.map(c => [c.number, c]));
  const titleIndex = [];
  for (const [kind, list] of [['hymn', hymns], ['coro', coros]]) {
    for (const s of list) {
      const t = norm(s.title).replace(/[^a-z0-9ñ ]/g, ' ').replace(/\s+/g, ' ').trim();
      if (t.length >= 10 && t.split(' ').length >= 2) titleIndex.push({ kind, t, song: s });
    }
  }
  titleIndex.sort((a, b) => b.t.length - a.t.length);

  function bibleRef(book, chapter, from, to) {
    const chapters = bible[book];
    chapter = Number(chapter);
    if (!chapters || !(chapter >= 1 && chapter <= chapters.length)) return null;
    const max = chapters[chapter - 1];
    from = from ? Number(from) : null;
    to = to ? Number(to) : null;
    if (from && (from < 1 || from > max)) return null;
    if (to && (to <= (from || 0))) to = null;
    if (to && to > max) to = max;
    const label = book + ' ' + chapter + (from ? ':' + from + (to ? '-' + to : '') : '');
    return { kind: 'bible', key: 'b|' + label, book, chapter, from, to, label };
  }

  function detect(raw, { mode = 'speech', context = {} } = {}) {
    const found = [];
    const ctx = { ...context };
    const original = String(raw);
    const folded = fold(original);
    let text = ' ' + wordsToDigits(norm(original).replace(/[¿?¡!;"“”()]/g, ' ').replace(/\s+/g, ' ')) + ' ';
    // "1 de corintios" -> "1 corintios"
    const push = (item, at) => { if (item && !found.some(f => f.key === item.key)) found.push({ ...item, at }); };
    const spans = [];
    const used = (a, b) => spans.some(([x, y]) => a < y && b > x);

    for (const m of text.matchAll(reNumbered)) {
      const n = ORD_VALUE[m[1]];
      const book = numbered.get(m[2])?.[n];
      if (!book) continue;
      const ref = bibleRef(book, m[3], m[4], m[5]);
      if (ref) { push(ref, m.index); spans.push([m.index, m.index + m[0].length]); ctx.book = book; ctx.chapter = ref.chapter; }
    }
    for (const m of text.matchAll(rePlain)) {
      if (used(m.index, m.index + m[0].length)) continue;
      // "1 juan" ya se tomó arriba; evita que "juan" suelto lo repita
      const before = text.slice(Math.max(0, m.index - 12), m.index);
      if (/(?:^|\s)(?:1|2|3|primera?|segunda?|tercera?)\s+(?:de\s+)?(?:san\s+)?$/.test(before) && numbered.has(m[1])) continue;
      const book = plain.get(m[1]);
      const ref = bibleRef(book, m[2], m[3], m[4]);
      if (ref) { push(ref, m.index); spans.push([m.index, m.index + m[0].length]); ctx.book = book; ctx.chapter = ref.chapter; }
    }
    if (mode === 'manual') {
      for (const m of text.matchAll(reAbbr)) {
        if (used(m.index, m.index + m[0].length)) continue;
        const ref = bibleRef(ABBREV[m[1]], m[2], m[3], m[4]);
        if (ref) { push(ref, m.index); spans.push([m.index, m.index + m[0].length]); ctx.book = ref.book; ctx.chapter = ref.chapter; }
      }
    }
    // "versículo 18" sin libro: usa el último libro y capítulo mencionados
    if (ctx.book) {
      for (const m of text.matchAll(reRelVerse)) {
        if (used(m.index, m.index + m[0].length)) continue;
        const chapter = m[1] || ctx.chapter;
        const ref = bibleRef(ctx.book, chapter, m[2], m[3]);
        if (ref) { push(ref, m.index); spans.push([m.index, m.index + m[0].length]); ctx.chapter = ref.chapter; }
      }
    }

    for (const m of text.matchAll(reHymn)) {
      if (mode !== 'manual' && /^\s*h/.test(m[0]) && !/himn/.test(m[0])) continue;
      const h = hymnByNum.get(Number(m[1]));
      if (h) push({ kind: 'hymn', key: 'h|' + h.number, number: h.number, title: h.title, label: 'Himno ' + h.number + ' · ' + h.title }, m.index);
    }
    for (const m of text.matchAll(reCoro)) {
      if (mode !== 'manual' && !/coro/.test(m[0])) continue;
      const c = coroByNum.get(Number(m[1]));
      if (c) push({ kind: 'coro', key: 'c|' + c.number, number: c.number, title: c.title, label: 'Coro ' + c.number + ' · ' + c.title }, m.index);
    }
    // Canto por título: en voz exige una palabra como "cantemos", "himno" o "coro" cerca.
    const plainText = text.replace(/[^a-z0-9ñ ]/g, ' ').replace(/\s+/g, ' ');
    if (mode === 'manual' || SONG_TRIGGER.test(plainText)) {
      const triggerKind = /\bcoros?\b/.test(plainText) ? 'coro' : /\bhimn/.test(plainText) ? 'hymn' : null;
      const hits = [];
      for (const entry of titleIndex) {
        const at = plainText.indexOf(' ' + entry.t + ' ');
        if (at < 0 || hits.some(h => at >= h.at && at < h.at + h.t.length + 1 && h.t.length > entry.t.length)) continue;
        hits.push({ ...entry, at });
      }
      hits.sort((a, b) => (b.kind === triggerKind) - (a.kind === triggerKind));
      for (const h of hits.slice(0, 3)) {
        const s = h.song;
        const kind = h.kind;
        push({ kind, key: (kind === 'hymn' ? 'h|' : 'c|') + s.number, number: s.number, title: s.title,
          label: (kind === 'hymn' ? 'Himno ' : 'Coro ') + s.number + ' · ' + s.title }, h.at);
      }
    }

    const t = folded.match(reTheme);
    if (t) {
      const start = t.index + t[0].length - t[1].length;
      let phrase = original.slice(start).split(/[.?!\n]/)[0].trim().split(/\s+/).slice(0, 14).join(' ');
      phrase = phrase.replace(/^["“«]|["”»,;:]$/g, '').trim();
      if (phrase.length >= 3) {
        phrase = phrase.charAt(0).toUpperCase() + phrase.slice(1);
        push({ kind: 'theme', key: 'Tema|' + norm(phrase), text: phrase, label: phrase }, t.index);
      }
    }
    found.sort((a, b) => a.at - b.at);
    return { items: found.map(({ at, ...rest }) => rest), context: ctx };
  }

  return { detect, books: bookNames };
}

export { createDetector, wordsToDigits, norm };
