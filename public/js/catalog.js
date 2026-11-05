// Catálogo en memoria: cantos (de Supabase) + Biblia (archivo estático).
// Busca, detecta y arma las diapositivas que se mandan a las pantallas.
import { createDetector, norm } from './detector.js';

const MAX_LINES = 6;

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
      for (const { s } of scored.slice(0, 12)) {
        const r = songRef(s);
        if (!results.some(x => x.key === r.key)) results.push(r);
      }
    }
    return results.slice(0, 15);
  }

  return { detector, resolve, search, counts: { hymns: hymns.length, coros: coros.length, songs: songs.length } };
}
