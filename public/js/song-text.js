// Formato de texto para capturar cantos a mano o importarlos.
//
//   [Estrofa 1]
//   Primera línea
//   Segunda línea
//
//   [Coro]
//   Línea del coro
//
// Las estrofas se separan con una línea en blanco. La etiqueta entre corchetes
// es opcional; sin ella se numera sola. "Coro" o "Estribillo" marcan el coro.

const CHORUS = /^(coro|estribillo|chorus)\b/i;

export function parseSongText(text) {
  const blocks = String(text || '').replace(/\r\n?/g, '\n').split(/\n\s*\n/);
  const sections = [];
  let verse = 0;
  for (const block of blocks) {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) continue;
    let label = null;
    const m = lines[0].match(/^\[(.{1,40})\]$/);
    if (m) { label = m[1].trim(); lines.shift(); }
    if (!lines.length) continue;
    const type = label && CHORUS.test(label) ? 'chorus' : 'verse';
    if (type === 'verse') verse++;
    sections.push({ type, label: label || 'Estrofa ' + verse, lines: lines.map(l => l.slice(0, 200)) });
  }
  return sections;
}

export function songToText(sections) {
  return (sections || []).map(s => `[${s.label || (s.type === 'chorus' ? 'Coro' : 'Estrofa')}]\n${(s.lines || []).join('\n')}`).join('\n\n');
}

// Archivo con varios cantos: cada uno empieza con "# número Título".
//   # 12 Mi canto
//   [Estrofa 1]
//   ...
export function parseSongBook(text) {
  const songs = [];
  let current = null;
  for (const line of String(text || '').replace(/\r\n?/g, '\n').split('\n')) {
    const head = line.match(/^#\s*(\d{1,4})?\s*[.\-–—]?\s*(.+?)\s*$/);
    if (head) {
      if (current) songs.push(current);
      current = { number: head[1] ? Number(head[1]) : null, title: head[2], body: [] };
    } else if (current) current.body.push(line);
  }
  if (current) songs.push(current);
  return songs.map(s => ({ number: s.number, title: s.title, sections: parseSongText(s.body.join('\n')) }))
    .filter(s => s.title && s.sections.length);
}

// Acepta varios nombres de campos comunes en archivos JSON de cantos.
export function normalizeSong(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const title = String(raw.title ?? raw.titulo ?? raw.nombre ?? '').trim();
  const number = Number(raw.number ?? raw.numero ?? raw.num) || null;
  let sections = raw.sections ?? raw.estrofas ?? raw.secciones;
  if (typeof sections === 'string') sections = parseSongText(sections);
  else if (typeof raw.letra === 'string' || typeof raw.lyrics === 'string') sections = parseSongText(raw.letra ?? raw.lyrics);
  if (!Array.isArray(sections)) return null;
  let verse = 0;
  sections = sections.map(s => {
    if (typeof s === 'string') s = { lines: s.split('\n') };
    const lines = (s.lines ?? s.lineas ?? []).map(l => String(l).trim()).filter(Boolean).map(l => l.slice(0, 200));
    const label = String(s.label ?? s.etiqueta ?? '').trim();
    const chorus = /chorus|coro|estribillo/i.test(String(s.type ?? s.tipo ?? '')) || CHORUS.test(label);
    if (!chorus) verse++;
    return { type: chorus ? 'chorus' : 'verse', label: label || (chorus ? 'Coro' : 'Estrofa ' + verse), lines };
  }).filter(s => s.lines.length);
  if (!title || !sections.length) return null;
  return { number, title: title.slice(0, 200), sections };
}
