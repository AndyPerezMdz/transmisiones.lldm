import { demo, supa, qs } from './db.js';

const $ = id => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
function toast(text, kind = 'error') {
  const t = $('toast'); t.textContent = text; t.className = 'toast show ' + kind;
  setTimeout(() => t.className = 'toast', 3500);
}
const link = (path, id) => `${location.origin}${path}?sala=${encodeURIComponent(id)}${demo ? '&demo' : ''}`;

function roomCard(room) {
  const card = el('div', 'room');
  const links = el('div', 'links');
  const open = el('a', 'btn', 'Abrir cabina'); open.href = link('/control', room.id); open.classList.add('primary');
  const tv = el('a', 'btn', 'Pantalla (TVs)'); tv.href = link('/pantalla', room.id); tv.target = '_blank';
  const songs = el('a', 'btn', 'Cantos'); songs.href = '/cantos' + (demo ? '?demo' : '');
  links.append(open, tv, songs);
  const url = el('div', 'url');
  const obs = link('/overlay', room.id);
  const copy = el('button', '', 'Copiar');
  copy.onclick = async () => { try { await navigator.clipboard.writeText(obs); toast('Dirección de OBS copiada', 'info'); } catch { toast('No se pudo copiar; selecciónala a mano.'); } };
  url.append(el('span', '', 'OBS:'), el('code', '', obs), copy);
  card.append(el('div', 'name', room.name), links, url);
  return card;
}

async function showHome(sb) {
  $('login').hidden = true; $('home').hidden = false;
  const list = $('rooms'); list.replaceChildren();
  if (demo) {
    list.append(roomCard({ id: 'demo', name: 'Sala demo (sin base de datos)' }));
    $('newRoom').hidden = true; $('logout').hidden = true;
    return;
  }
  const { data, error } = await sb.from('rooms').select('id, name').eq('owner', (await sb.auth.getUser()).data.user.id).order('created_at');
  if (error) return toast(error.message);
  if (!data.length) list.append(el('p', 'muted', 'Todavía no tienes salas. Crea la primera abajo.'));
  data.forEach(r => list.append(roomCard(r)));
}

(async () => {
  const sb = await supa();
  if (demo) return showHome(null);
  const { data } = await sb.auth.getSession();
  const after = () => {
    const back = qs.get('volver');
    if (back && back.startsWith('/') && !back.startsWith('//')) location.href = back; else showHome(sb);
  };
  if (data.session) after(); else $('login').hidden = false;

  $('loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    $('loginMsg').textContent = 'Entrando…';
    const { error } = await sb.auth.signInWithPassword({ email: f.email.value.trim(), password: f.password.value });
    if (error) { $('loginMsg').textContent = 'No se pudo entrar: ' + error.message; return; }
    $('loginMsg').textContent = '';
    after();
  });
  $('logout').onclick = async () => { await sb.auth.signOut(); location.href = '/'; };
  $('newRoom').addEventListener('submit', async e => {
    e.preventDefault();
    const name = e.target.name.value.trim() || 'Templo';
    const { error } = await sb.from('rooms').insert({ name });
    if (error) return toast(error.message);
    e.target.reset(); showHome(sb);
  });
})();
