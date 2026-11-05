// Inicio: entrar y elegir sala, con pasos guiados.
import { demo, supa, qs } from './db.js';
import { $, el, toast, mountNav, themeButton, withDemo, absolute, modal } from './ui.js';

function copyBox(url) {
  const copy = el('button', { class: 'btn btn-sec', type: 'button', text: 'Copiar' });
  copy.onclick = async () => {
    try { await navigator.clipboard.writeText(url); toast('Enlace copiado. Pégalo en OBS.', 'ok'); }
    catch { toast('No se pudo copiar. Selecciona el enlace y cópialo a mano.'); }
  };
  return el('div', { class: 'enlace-obs' }, el('code', { text: url, title: url }), copy);
}

function roomCard(room, sb) {
  const rename = el('button', { class: 'btn btn-mini', type: 'button', text: 'Cambiar nombre' });
  rename.onclick = async () => {
    const name = await modal({ title: 'Cambiar nombre', input: { label: 'Nombre de la sala', value: room.name, maxLength: 80 }, ok: 'Guardar' });
    if (!name || name === room.name || demo) return;
    const { error } = await sb.from('rooms').update({ name: name.slice(0, 80) }).eq('id', room.id);
    if (error) return toast(error.message);
    showHome(sb);
  };
  return el('section', { class: 'tarjeta sala' },
    el('h2', { text: room.name }),
    el('div', { class: 'pasos' },
      el('div', { class: 'paso-fila' },
        el('span', { class: 'paso', text: '1' }), el('b', { text: 'Pon los gráficos en OBS (una sola vez)' }),
        el('p', { class: 'ayuda', text: 'En OBS: Fuentes → + → Navegador → pega este enlace, ancho 1920 y alto 1080. Ponla arriba de las cámaras. Trae los logos, el letrero y el nombre del expositor; como las TVs muestran lo de OBS, también salen ahí.' }),
        copyBox(absolute('/overlay', { sala: room.id }))),
      el('div', { class: 'paso-fila' },
        el('span', { class: 'paso', text: '2' }), el('b', { text: 'Abre la cabina en esta laptop' }),
        el('p', { class: 'ayuda', text: 'Desde ahí pones citas, himnos, el tema y el nombre del expositor. Usa Chrome o Edge para que funcione el micrófono.' }),
        el('div', { class: 'acciones' }, el('a', { class: 'btn btn-primario', href: withDemo('/control', { sala: room.id }), text: 'Abrir la cabina' }))),
      el('div', { class: 'paso-fila' },
        el('span', { class: 'paso', text: '3' }), el('b', { text: 'Ajusta el diseño a su letrero' }),
        el('p', { class: 'ayuda', text: 'Sube sus logos y su letrero, y acomoda los textos para que todo quede en su lugar.' }),
        el('div', { class: 'acciones' }, el('a', { class: 'btn btn-sec', href: withDemo('/diseno', { sala: room.id }), text: '🎨 Abrir Diseño' })))),
    el('details', { class: 'opcional' },
      el('summary', { text: 'Opcional: letra completa de cantos y versículos' }),
      el('p', { class: 'ayuda', text: 'Si quieren mostrar la letra completa, agreguen este enlace en OBS como otra fuente de Navegador (por ejemplo, en una escena “Letra”).' }),
      copyBox(absolute('/pantalla', { sala: room.id }))),
    el('div', { class: 'sala-pie' },
      el('a', { class: 'btn btn-mini', href: withDemo('/cantos'), text: '🎵 Cantos' }),
      demo ? null : rename));
}

async function showHome(sb) {
  $('login').hidden = true; $('home').hidden = false;
  if (!document.querySelector('.nav')) mountNav('salas');
  const list = $('rooms'); list.replaceChildren();
  if (demo) {
    list.append(roomCard({ id: 'demo', name: 'Sala de prueba' }, sb));
    $('newRoomBox').hidden = true;
    return;
  }
  const { data: { user } } = await sb.auth.getUser();
  const { data, error } = await sb.from('rooms').select('id, name').eq('owner', user.id).order('created_at');
  if (error) return toast(error.message);
  if (!data.length) list.append(el('div', { class: 'vacio', text: 'Todavía no tienes salas. Crea la primera aquí abajo.' }));
  data.forEach(r => list.append(roomCard(r, sb)));
}

(async () => {
  const sb = await supa();
  if (demo) return showHome(null);
  $('temaLogin').replaceWith(themeButton('auth-tema'));
  const { data } = await sb.auth.getSession();
  const after = () => {
    const back = qs.get('volver');
    if (back && back.startsWith('/') && !back.startsWith('//')) location.href = back; else showHome(sb);
  };
  if (data.session) after(); else $('login').hidden = false;

  $('loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target, msg = $('loginMsg'), btn = $('loginBtn');
    btn.disabled = true; btn.textContent = 'Entrando…'; msg.hidden = true;
    const { error } = await sb.auth.signInWithPassword({ email: f.email.value.trim(), password: f.password.value });
    btn.disabled = false; btn.textContent = 'Entrar';
    if (error) {
      msg.textContent = /invalid/i.test(error.message) ? 'Correo o contraseña incorrectos.' : 'No se pudo entrar: ' + error.message;
      msg.hidden = false; return;
    }
    after();
  });
  $('newRoom').addEventListener('submit', async e => {
    e.preventDefault();
    const name = e.target.name.value.trim() || 'Templo';
    const { error } = await sb.from('rooms').insert({ name });
    if (error) return toast(error.message);
    e.target.reset(); toast('Sala creada', 'ok'); showHome(sb);
  });
})();
