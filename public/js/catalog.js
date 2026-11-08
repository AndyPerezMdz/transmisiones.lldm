// Catálogo en memoria: cantos (de Supabase) + Biblia (archivo estático).
// Busca, detecta y arma las diapositivas que se mandan a las pantallas.
import { createDetector, norm } from './detector.js';

const MAX_LINES = 6;
// Palabras demasiado comunes para buscar un versículo por su texto.
const STOP = new Set(('a al ante bajo con contra de del desde el en entre hacia hasta la las le les lo los mas me mi mis '
  + 'no nos o os para pero por que se si sin sobre su sus te ti tu tus un una uno unos y ya yo es era fue son ha he '
  + 'han como cual cuando donde este esta esto ese esa eso aquel').split(' '));
const toWords = text => norm(text).replace(/[^a-z0-9ñ ]/g, ' ').split(/\s+/).filter(Boolean);

export function createCatalog({ songs = [], bible }) {
  const books = new Map(bible.books.map(b => [b.name, b.chapters]));
  const bibleMeta = Object.fromEntries(bible.books.map(b => [b.name, b.chapters.map(c => c.length)]));
  const hymns = songs.filter(s => s.kind === 'hymn' && s.number);
  const coros = songs.filter(s => s.kind === 'coro' && s.number);
  const slim = list => list.map(s => ({ number: s.number, title: s.title }));
  const detector = createDetector({ hymns: slim(hymns), coros: slim(coros), bible: bibleMeta });
  const byNum = { hymn: new Map(hymns.map(s => [s.number, s])), coro: new Map(coros.map(s => [s.number, s])) };
  const index = songs.map(s => ({ s, title: norm(s.title), body: norm((s.sections || []).map(x => x.lines.join(' ')).join(' ')) }));
  const kindName = { hymn: 'Himno', coro: 'Coro' };

  function songLabel(s) { return (s.number ? kindName[s.kind] + ' ' + s.number + ' · ' : kindName[s.kind] + ' · ') + s.title; }
  function songRef(s) { return { kind: s.kind, id: s.id, number: s.number, key: (s.kind === 'hymn' ? 'h|' : 'c|') + (s.number || s.id), label: songLabel(s) }; }

  function songItem(ref) {
    const s = (ref.id && songs.find(x => x.id === ref.id)) || byNum[ref.kind]?.get(Number(ref.number));
    if (!s) return null;
    const head = s.number ? kindName[s.kind] + ' ' + s.number : kindName[s.kind];
    const slides = [{ header: head, title: s.title, lines: [] }];
    for (const sec of s.sections || []) {
      const lines = sec.lines.filter(l => l.trim());
      if (!lines.length) continue;
      const size = Math.ceil(lines.length / Math.ceil(lines.length / MAX_LINES));
      for (let i = 0; i < lines.length; i += size) {
        slides.push({ header: s.title, label: sec.label, lines: lines.slice(i, i + size), chorus: sec.type === 'chorus' });
      }
    }
    return { kind: s.kind, key: songRef(s).key, label: songLabel(s), banner: { tag: head, title: s.title }, slides };
  }

  function bibleItem({ book, chapter, from, to }) {
    const ch = books.get(book)?.[Number(chapter) - 1];
    if (!ch) return null;
    const hasFrom = Number(from) > 0;
    from = hasFrom ? Number(from) : 1;
    to = Math.min(Math.max(Number(to) || (hasFrom ? from : ch.length), from), ch.length);
    if (from > ch.length) return null;
    const ref = `${book} ${chapter}:${from}${to > from ? '-' + to : ''}`;
    const slides = [];
    for (let v = from; v <= to; v++) slides.push({ header: `${book} ${chapter}:${v}`, text: ch[v - 1], verse: v });
    return { kind: 'bible', key: 'b|' + ref, label: ref, banner: { tag: 'Lectura', title: ref }, slides, version: bible.name };
  }

  function resolve(ref) {
    switch (ref?.kind) {
      case 'hymn': case 'coro': return songItem(ref);
      case 'bible': return bibleItem(ref);
      case 'theme': {
        const text = String(ref.text || '').trim().slice(0, 200);
        return text ? { kind: 'theme', key: 'Tema|' + norm(text), label: 'Tema: ' + text, banner: { tag: 'Tema', title: text },
          slides: [{ header: 'Tema', title: text, lines: [] }] } : null;
      }
      default: return null;
    }
  }

  // ---------- Buscar versículos por lo que dicen (sin la referencia) ----------
  // Índice de palabras → versículos. Se arma la primera vez que se necesita.
  let verseIndex = null;
  function buildVerseIndex() {
    const verses = [], inv = new Map();
    for (const b of bible.books) {
      b.chapters.forEach((ch, ci) => ch.forEach((text, vi) => {
        const words = toWords(text);
        const id = verses.length;
        verses.push({ book: b.name, chapter: ci + 1, verse: vi + 1, words, text });
        for (const w of new Set(words)) {
          if (STOP.has(w) || w.length < 3) continue;
          let list = inv.get(w);
          if (!list) inv.set(w, list = []);
          list.push(id);
        }
      }));
    }
    return { verses, inv };
  }
  // Cuántas palabras de "needle" aparecen en "hay", en el mismo orden.
  function inOrder(needle, hay) {
    let j = 0, n = 0, content = 0;
    for (const w of needle) {
      const k = hay.indexOf(w, j);
      if (k < 0) continue;
      n++; if (!STOP.has(w)) content++; j = k + 1;
    }
    return { n, content };
  }
  // phrase: lo que se escribe en el buscador debe estar dentro del versículo.
  // speech: el principio del versículo debe estar dentro de lo que se escuchó.
  function findVerses(text, { mode = 'phrase', limit = 3 } = {}) {
    const words = toWords(text);
    const keys = [...new Set(words.filter(w => !STOP.has(w) && w.length >= 3))];
    if (words.length < 3 || !keys.length) return [];
    verseIndex ??= buildVerseIndex();
    const { verses, inv } = verseIndex;
    const usable = keys.map(w => inv.get(w) || []).filter(l => l.length && l.length < 3500);
    if (!usable.length) return [];
    const hits = new Map();
    for (const list of usable) for (const id of list) hits.set(id, (hits.get(id) || 0) + 1);
    const need = Math.min(mode === 'speech' ? 3 : 2, usable.length);
    const candidates = [...hits].filter(([, c]) => c >= need).sort((a, b) => b[1] - a[1]).slice(0, 400);
    const scored = [];
    for (const [id] of candidates) {
      const v = verses[id];
      let score, ok;
      if (mode === 'speech') {
        const head = v.words.slice(0, 16);
        const m = inOrder(head, words);
        score = m.n / head.length;
        ok = score >= 0.75 && m.content >= 4;
      } else {
        const m = inOrder(words, v.words);
        score = m.n / words.length;
        ok = score >= 0.8 && m.content >= 1;
      }
      if (ok) scored.push({ v, score });
    }
    scored.sort((a, b) => b.score - a.score || a.v.words.length - b.v.words.length);
    return scored.slice(0, limit).map(({ v, score }) => {
      const ref = `${v.book} ${v.chapter}:${v.verse}`;
      const snippet = v.text.length > 70 ? v.text.slice(0, 68).replace(/\s+\S*$/, '') + '…' : v.text;
      return { kind: 'bible', key: 'b|' + ref, book: v.book, chapter: v.chapter, from: v.verse, to: null,
        label: ref, snippet, byText: true, score };
    });
  }

  function search(q) {
    q = String(q || '').trim();
    if (!q) return [];
    const theme = q.match(/^t(?:ema)?\s*[:\s]\s*(\S.*)$/i);
    if (theme) return [{ kind: 'theme', text: theme[1], key: 'Tema|' + norm(theme[1]), label: 'Tema: ' + theme[1] }];
    const results = detector.detect(q, { mode: 'manual' }).items.filter(i => i.kind !== 'theme');
    const nq = norm(q).replace(/[^a-z0-9ñ ]/g, ' ').replace(/\s+/g, ' ').trim();
    if (nq.length >= 3) {
      const words = nq.split(' ');
      const scored = [];
      for (const e of index) {
        const score = e.title.includes(nq) ? 3 : e.body.includes(nq) ? 2
          : words.length > 1 && words.every(w => e.title.includes(w) || e.body.includes(w)) ? 1 : 0;
        if (score) scored.push({ score, s: e.s });
      }
      scored.sort((a, b) => b.score - a.score || (a.s.number || 1e9) - (b.s.number || 1e9));
      // Si no escribieron una referencia, también se busca el texto dentro de la Biblia.
      const verses = results.some(r => r.kind === 'bible') ? [] : findVerses(q, { mode: 'phrase', limit: 4 })
        .map(v => ({ ...v, label: v.label + ' · ' + v.snippet }));
      const add = r => { if (!results.some(x => x.key === r.key)) results.push(r); };
      for (const { s } of scored.filter(x => x.score === 3).slice(0, 4)) add(songRef(s));
      for (const v of verses) add(v);
      for (const { s } of scored.slice(0, 12)) add(songRef(s));
    }
    return results.slice(0, 15);
  }

  return { detector, resolve, search, findVerses, warmUp: () => { verseIndex ??= buildVerseIndex(); }, counts: { hymns: hymns.length, coros: coros.length, songs: songs.length } };
}
