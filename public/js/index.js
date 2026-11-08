// Inicio: entrar y elegir sala, con pasos guiados.
import { demo, supa, qs, acceptInvites, myTeams, pickTeam, rememberTeam } from './db.js';
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
        el('div', { class: 'acciones' }, el('a', { class: 'btn btn-sec', href: withDemo('/diseno', { sala: room.id }), text: 'Abrir Diseño', 'data-icon': 'paleta' })))),
    el('details', { class: 'opcional' },
      el('summary', { text: 'Opcional: letra completa de cantos y versículos' }),
      el('p', { class: 'ayuda', text: 'Si quieren mostrar la letra completa, agreguen este enlace en OBS como otra fuente de Navegador (por ejemplo, en una escena “Letra”).' }),
      copyBox(absolute('/pantalla', { sala: room.id }))),
    el('div', { class: 'sala-pie' },
      el('a', { class: 'btn btn-mini', href: withDemo('/cantos'), text: 'Cantos', 'data-icon': 'himno' }),
      demo ? null : rename));
}

let team = null;

async function showHome(sb) {
  $('login').hidden = true; $('home').hidden = false;
  if (!document.querySelector('.nav')) mountNav('salas');
  const list = $('rooms'); list.replaceChildren();
  if (demo) {
    list.append(roomCard({ id: 'demo', name: 'Sala de prueba' }, sb));
    $('newRoomBox').hidden = true;
    return;
  }
  // Entrar acepta las invitaciones pendientes a tu correo.
  const joined = await acceptInvites().catch(() => 0);
  if (joined) toast(joined === 1 ? 'Ya eres parte del equipo. ¡Bienvenido!' : `Te uniste a ${joined} equipos.`, 'ok');
  let teams = [];
  try { teams = await myTeams(); } catch (err) { return toast(err.message); }
  team = pickTeam(teams);
  if (!team) return showNoTeam(sb);
  rememberTeam(team.id);
  $('noTeam').hidden = true; $('rooms').hidden = false;

  const bar = $('teamBar'); bar.replaceChildren();
  if (teams.length > 1) {
    const sel = el('select', { class: 'campo', title: 'Equipo' }, teams.map(t => el('option', { value: t.id, text: t.name, selected: t.id === team.id })));
    sel.onchange = () => { rememberTeam(sel.value); showHome(sb); };
    bar.append(sel);
  } else bar.append(el('span', { class: 'chico', text: 'Equipo: ' + team.name }));
  bar.append(el('a', { class: 'btn btn-sec', href: '/equipo', text: 'Personas del equipo', 'data-icon': 'personas' }));

  $('newRoomBox').hidden = team.role !== 'admin';
  const { data, error } = await sb.from('rooms').select('id, name').eq('team_id', team.id).order('created_at');
  if (error) return toast(error.message);
  if (!data.length) list.append(el('div', { class: 'vacio', text: team.role === 'admin' ? 'Todavía no hay salas. Crea la primera aquí abajo.' : 'Todavía no hay salas en este equipo. Pídele a un administrador que cree una.' }));
  data.forEach(r => list.append(roomCard(r, sb)));
}

// Cuenta nueva, todavía sin equipo: esperar invitación o crear el suyo.
async function showNoTeam(sb) {
  const { data: { user } } = await sb.auth.getUser();
  $('rooms').hidden = true; $('newRoomBox').hidden = true; $('teamBar').replaceChildren();
  $('homeAyuda').textContent = 'Para ver las salas y los cantos necesitas estar en un equipo (tu congregación).';
  const box = $('noTeam'); box.hidden = false; box.replaceChildren();
  const check = el('button', { class: 'btn btn-primario', type: 'button', text: 'Ya me invitaron, revisar' });
  check.onclick = () => showHome(sb);
  const form = el('form', { class: 'fila' },
    el('input', { class: 'campo crece', name: 'name', maxlength: 80, required: true, placeholder: 'Nombre del equipo, ej. Templo Central' }),
    el('button', { class: 'btn btn-sec', text: 'Crear equipo' }));
  form.onsubmit = async e => {
    e.preventDefault();
    const { error } = await sb.from('teams').insert({ name: form.name.value.trim() });
    if (error) return toast(error.message);
    toast('Equipo creado. Ya puedes crear salas e invitar personas.', 'ok');
    showHome(sb);
  };
  box.append(
    el('h2', { class: 'titulo', style: 'font-size:22px', text: 'Todavía no estás en un equipo' }),
    el('p', { class: 'ayuda' }, 'Pídele a quien administra la cabina que te invite con este correo: ', el('b', { text: user.email }),
      '. Cuando lo haga, presiona el botón y listo.'),
    el('div', {}, check),
    el('details', {}, el('summary', { class: 'chico', style: 'cursor:pointer', text: '¿Eres el encargado y quieres empezar un equipo nuevo?' }),
      el('div', { style: 'margin-top:10px' }, form)));
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

  const show = which => {
    $('loginForm').hidden = which !== 'login';
    $('registerForm').hidden = which !== 'register';
    $('registerDone').hidden = which !== 'done';
    document.querySelector('.auth-caja .sub').textContent = which === 'register' ? 'Crea tu cuenta para unirte al equipo' : 'Proyección y transmisión del templo';
  };
  $('toRegister').onclick = () => { show('register'); $('registerForm').name.focus(); };
  $('toLogin').onclick = () => show('login');

  $('loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target, msg = $('loginMsg'), btn = $('loginBtn');
    btn.disabled = true; btn.textContent = 'Entrando…'; msg.hidden = true;
    const { error } = await sb.auth.signInWithPassword({ email: f.email.value.trim(), password: f.password.value });
    btn.disabled = false; btn.textContent = 'Entrar';
    if (error) {
      msg.textContent = /confirm/i.test(error.message) ? 'Primero confirma tu correo: abre el mensaje que te enviamos al registrarte.'
        : /invalid/i.test(error.message) ? 'Correo o contraseña incorrectos.' : 'No se pudo entrar: ' + error.message;
      msg.hidden = false; return;
    }
    after();
  });

  $('registerForm').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target, msg = $('registerMsg'), btn = $('registerBtn');
    btn.disabled = true; btn.textContent = 'Creando…'; msg.hidden = true;
    const email = f.email.value.trim().toLowerCase();
    const { data: res, error } = await sb.auth.signUp({ email, password: f.password.value,
      options: { data: { name: f.name.value.trim() }, emailRedirectTo: location.origin + '/' } });
    btn.disabled = false; btn.textContent = 'Crear mi cuenta';
    if (error) {
      msg.textContent = /registered|already/i.test(error.message) ? 'Ese correo ya tiene cuenta. Entra con tu contraseña.'
        : /password/i.test(error.message) ? 'La contraseña debe tener al menos 8 caracteres.' : 'No se pudo crear la cuenta: ' + error.message;
      msg.hidden = false; return;
    }
    if (res.session) return after(); // si Supabase no pide confirmar el correo
    const done = $('registerDone');
    done.replaceChildren('Te enviamos un correo a ', el('b', { text: email }), '. Ábrelo para confirmar tu cuenta y luego entra aquí.');
    const back = el('button', { type: 'button', class: 'btn btn-sec', style: 'margin-top:12px', text: 'Ir a entrar' });
    back.onclick = () => show('login');
    done.append(el('br'), back);
    show('done');
  });

  $('newRoom').addEventListener('submit', async e => {
    e.preventDefault();
    const name = e.target.name.value.trim() || 'Templo';
    const { error } = await sb.from('rooms').insert({ name, team_id: team.id });
    if (error) return toast(error.message);
    e.target.reset(); toast('Sala creada', 'ok'); showHome(sb);
  });
})();
