// Editor e importador de cantos.
import { demo, supa, requireSession, loadSongs, currentTeam } from './db.js';
import { norm } from './detector.js';
import { parseSongText, songToText, parseSongBook, normalizeSong } from './song-text.js';

import { $, toast, mountNav, modal } from './ui.js';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

let songs = [], kind = 'hymn', current = null, sb = null, team = null;
const form = $('editor');

function renderList() {
  const q = norm($('filter').value.trim());
  const list = $('list'); list.replaceChildren();
  const mine = songs.filter(s => s.kind === kind);
  const shown = mine.filter(s => !q || String(s.number) === q || norm(s.title).includes(q)
    || (q.length > 3 && norm(s.sections.map(x => x.lines.join(' ')).join(' ')).includes(q)));
  $('count').textContent = `${shown.length} de ${mine.length}`;
  for (const s of shown.slice(0, 300)) {
    const li = el('li', current?.id === s.id ? 'sel' : '');
    li.append(el('span', 'n', s.number ?? '–'), el('span', 't', s.title));
    li.onclick = () => edit(s);
    list.append(li);
  }
}

function edit(s) {
  current = s;
  form.kind.value = s?.kind || kind;
  form.number.value = s?.number ?? '';
  form.title.value = s?.title || '';
  form.lyrics.value = s ? songToText(s.sections) : '';
  $('editTitle').textContent = s ? 'Editando: ' + s.title : 'Canto nuevo';
  $('btnDelete').hidden = !s;
  renderList();
}

form.addEventListener('submit', async e => {
  e.preventDefault();
  const row = { kind: form.kind.value, number: Number(form.number.value) || null, title: form.title.value.trim(), sections: parseSongText(form.lyrics.value) };
  if (!row.title || !row.sections.length) return toast('Falta el título o la letra.');
  const dup = songs.find(s => s.kind === row.kind && row.number && s.number === row.number && s.id !== current?.id);
  if (dup) return toast(`Ya existe el ${row.kind === 'hymn' ? 'himno' : 'coro'} ${row.number}: ${dup.title}`);
  if (demo) {
    const saved = { ...row, id: current?.id || 'demo-' + Date.now() };
    songs = current ? songs.map(s => s.id === current.id ? saved : s) : [...songs, saved];
    toast('Modo demo: el cambio no se guarda en ningún lado.', 'info');
    kind = row.kind; return edit(saved);
  }
  const query = current ? sb.from('songs').update(row).eq('id', current.id) : sb.from('songs').insert({ ...row, team_id: team.id });
  const { data, error } = await query.select('id, kind, number, title, sections').single();
  if (error) return toast('No se guardó: ' + error.message);
  songs = current ? songs.map(s => s.id === data.id ? data : s) : [...songs, data];
  sortSongs(); kind = data.kind; setTab(); edit(data);
  toast('Canto guardado', 'ok');
});

$('btnDelete').onclick = async () => {
  if (!current || !(await modal({ title: 'Borrar canto', text: `¿Seguro que quieres borrar "${current.title}"? No se puede deshacer.`, ok: 'Sí, borrar', danger: true }))) return;
  if (!demo) {
    const { error } = await sb.from('songs').delete().eq('id', current.id);
    if (error) return toast('No se borró: ' + error.message);
  }
  songs = songs.filter(s => s.id !== current.id);
  edit(null);
};
$('btnNew').onclick = () => { edit(null); form.title.focus(); };
$('filter').addEventListener('input', renderList);

function setTab() { for (const b of $('tabs').children) b.classList.toggle('activo', b.dataset.kind === kind); }
$('tabs').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  kind = b.dataset.kind; setTab(); edit(null);
});
const sortSongs = () => songs.sort((a, b) => a.kind.localeCompare(b.kind) || (a.number ?? 1e9) - (b.number ?? 1e9) || a.title.localeCompare(b.title));

// ---------- Bienvenida: equipo sin cantos ----------
function showWelcome() { $('bienvenida').hidden = songs.length > 0; }
const PLANTILLA = `# 1 Título del primer canto
[Estrofa 1]
Primera línea de la estrofa
Segunda línea de la estrofa

[Coro]
Primera línea del coro
Segunda línea del coro

[Estrofa 2]
Primera línea
Segunda línea

# 2 Título del segundo canto
Si no le pones etiqueta, cada bloque se numera solo como estrofa.
Deja una línea en blanco entre estrofas.

[Coro]
Las partes que se llamen "Coro" se marcan como coro.
`;
$('plantilla').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([PLANTILLA], { type: 'text/plain;charset=utf-8' }));
  a.download = 'plantilla-cantos.txt';
  document.body.append(a); a.click(); a.remove();
};
$('empezarManual').onclick = () => { edit(null); form.title.focus(); form.scrollIntoView({ behavior: 'smooth', block: 'start' }); };

// ---------- importar ----------
$('importFile').addEventListener('change', async e => {
  const file = e.target.files[0]; e.target.value = '';
  if (!file) return;
  let parsed = [];
  try {
    const text = await file.text();
    if (/\.json$/i.test(file.name) || /^\s*[[{]/.test(text)) {
      const data = JSON.parse(text);
      const arr = Array.isArray(data) ? data : data.songs ?? data.cantos ?? [];
      parsed = arr.map(normalizeSong).filter(Boolean);
    } else parsed = parseSongBook(text);
  } catch (err) { return toast('No se pudo leer el archivo: ' + err.message); }
  if (!parsed.length) return toast('No encontré cantos en ese archivo. Revisa el formato en el LEEME.');
  const target = kind === 'hymn' ? 'Himnario' : 'Coros';
  if (!(await modal({ title: 'Importar cantos', text: `Se encontraron ${parsed.length} cantos. ¿Agregarlos a "${target}"? Los que tengan el mismo número se reemplazan.`, ok: 'Importar' }))) return;
  const rows = parsed.map(s => ({ ...s, kind, team_id: team?.id }));
  if (demo) {
    songs = [...songs.filter(s => s.kind !== kind || !rows.some(r => r.number && r.number === s.number)),
      ...rows.map((r, i) => ({ ...r, id: 'demo-imp-' + i }))];
    sortSongs(); renderList();
    return toast(`Modo demo: ${rows.length} cantos cargados solo en esta pestaña.`, 'info');
  }
  const numbered = rows.filter(r => r.number), loose = rows.filter(r => !r.number);
  let done = 0;
  try {
    for (let i = 0; i < numbered.length; i += 200) {
      const { error } = await sb.from('songs').upsert(numbered.slice(i, i + 200), { onConflict: 'team_id,kind,number' });
      if (error) throw error;
      done += Math.min(200, numbered.length - i);
      $('count').textContent = `Importando… ${done} de ${rows.length}`;
    }
    for (let i = 0; i < loose.length; i += 200) {
      const { error } = await sb.from('songs').insert(loose.slice(i, i + 200));
      if (error) throw error;
      done += Math.min(200, loose.length - i);
    }
    toast(`Listo: ${done} cantos importados.`, 'ok');
  } catch (err) { toast(`Se importaron ${done}; falló el resto: ${err.message}`); }
  songs = await loadSongs(team?.id); renderList(); showWelcome();
});

(async () => {
  await requireSession();
  mountNav('cantos');
  sb = await supa();
  try {
    team = await currentTeam();
    if (!team) { toast('Todavía no estás en ningún equipo. Ve a Salas para unirte o crear uno.'); return; }
    document.querySelector('.pagina-cabeza .ayuda').textContent = `Himnario y coros de “${team.name}”. Todo el equipo los ve y los puede editar; lo que agregues aparece al instante en el buscador de la cabina.`;
    songs = await loadSongs(team.id);
  } catch (err) { toast(err.message); }
  sortSongs(); edit(null); showWelcome();
})();
