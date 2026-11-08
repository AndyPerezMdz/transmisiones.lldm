// Personas del equipo: invitar, cambiar permisos, quitar o salirse.
import { demo, supa, requireSession, currentTeam } from './db.js';
import { $, el, toast, mountNav, modal } from './ui.js';

let sb = null, team = null, me = null;
const isAdmin = () => team?.role === 'admin';
const ROLE = { admin: 'Administrador', miembro: 'Miembro' };

function person({ name, email, role, you, actions }) {
  const label = name || email || 'Sin nombre';
  return el('li', { class: 'persona' },
    el('span', { class: 'inicial', text: label.trim().charAt(0).toUpperCase() || '?' }),
    el('div', {}, el('b', { text: label + (you ? ' (tú)' : '') }), el('span', { class: 'chico', text: name ? email || '' : '' })),
    el('div', { class: 'acc' }, actions || el('span', { class: 'rol ' + role, text: ROLE[role] || role })));
}

async function load() {
  if (demo) {
    $('teamName').textContent = 'Equipo de prueba';
    $('members').replaceChildren(person({ name: 'Tú', email: 'demo', role: 'admin', you: true }), person({ name: 'Hno. de ejemplo', email: 'ejemplo@correo.com', role: 'miembro' }));
    $('count').textContent = '2 personas';
    $('inviteBox').hidden = false;
    return;
  }
  team = await currentTeam();
  if (!team) { $('teamName').textContent = 'Sin equipo'; return toast('Todavía no estás en un equipo. Ve a Salas.'); }
  $('teamName').textContent = team.name;
  $('inviteBox').hidden = !isAdmin();
  renderActions();
  const { data: members, error } = await sb.from('team_members').select('user_id, role, email, name').eq('team_id', team.id).order('added_at');
  if (error) return toast(error.message);
  const admins = members.filter(m => m.role === 'admin').length;
  $('count').textContent = members.length === 1 ? '1 persona' : members.length + ' personas';
  $('members').replaceChildren(...members.map(m => {
    const you = m.user_id === me.id;
    let actions = null;
    if (isAdmin() && !you) {
      const sel = el('select', { class: 'campo', title: 'Permisos' }, Object.entries(ROLE).map(([v, n]) => el('option', { value: v, text: n, selected: v === m.role })));
      sel.onchange = async () => {
        const { error } = await sb.from('team_members').update({ role: sel.value }).eq('team_id', team.id).eq('user_id', m.user_id);
        if (error) { toast(error.message); sel.value = m.role; } else toast('Permisos actualizados', 'ok');
      };
      const del = el('button', { type: 'button', class: 'btn btn-mini', text: 'Quitar' });
      del.onclick = async () => {
        if (!(await modal({ title: 'Quitar del equipo', text: `${m.name || m.email} ya no podrá ver las salas ni los cantos.`, ok: 'Sí, quitar', danger: true }))) return;
        const { error } = await sb.from('team_members').delete().eq('team_id', team.id).eq('user_id', m.user_id);
        if (error) return toast(error.message);
        load();
      };
      actions = el('span', { class: 'acc' }, sel, del);
    } else if (you && !(isAdmin() && admins === 1)) {
      const leave = el('button', { type: 'button', class: 'btn btn-mini', text: 'Salir del equipo' });
      leave.onclick = async () => {
        if (!(await modal({ title: 'Salir del equipo', text: 'Ya no verás las salas ni los cantos de este equipo, hasta que te vuelvan a invitar.', ok: 'Salir', danger: true }))) return;
        const { error } = await sb.from('team_members').delete().eq('team_id', team.id).eq('user_id', me.id);
        if (error) return toast(error.message);
        location.href = '/';
      };
      actions = el('span', { class: 'acc' }, el('span', { class: 'rol ' + m.role, text: ROLE[m.role] }), leave);
    }
    return person({ ...m, you, actions });
  }));
  if (isAdmin()) {
    const { data: invites } = await sb.from('team_invites').select('email, role, created_at').eq('team_id', team.id).order('created_at');
    $('pendingBox').hidden = !invites?.length;
    $('invites').replaceChildren(...(invites || []).map(i => {
      const cancel = el('button', { type: 'button', class: 'btn btn-mini', text: 'Cancelar' });
      cancel.onclick = async () => {
        const { error } = await sb.from('team_invites').delete().eq('team_id', team.id).eq('email', i.email);
        if (error) return toast(error.message);
        load();
      };
      return person({ name: i.email, email: 'Esperando a que se registre · ' + ROLE[i.role], role: i.role, actions: cancel });
    }));
  }
}

function renderActions() {
  const box = $('teamActions'); box.replaceChildren();
  if (!isAdmin()) return;
  const rename = el('button', { type: 'button', class: 'btn btn-sec', text: 'Cambiar nombre del equipo' });
  rename.onclick = async () => {
    const name = await modal({ title: 'Nombre del equipo', input: { label: 'Nombre', value: team.name, maxLength: 80 }, ok: 'Guardar' });
    if (!name || name === team.name) return;
    const { error } = await sb.from('teams').update({ name }).eq('id', team.id);
    if (error) return toast(error.message);
    load();
  };
  box.append(rename);
}

$('inviteForm').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target, email = f.email.value.trim().toLowerCase();
  if (demo) { f.reset(); return toast('Modo de prueba: no se envía ninguna invitación.', 'info'); }
  const { data: exists } = await sb.from('team_members').select('user_id').eq('team_id', team.id).eq('email', email);
  if (exists?.length) return toast('Esa persona ya está en el equipo.', 'info');
  const { error } = await sb.from('team_invites').insert({ team_id: team.id, email, role: f.role.value });
  if (error) return toast(error.code === '23505' ? 'Ya habías invitado a ese correo; sigue pendiente.' : error.message, error.code === '23505' ? 'info' : 'error');
  f.reset();
  toast(`Listo. Dile a ${email} que se registre con ese correo.`, 'ok');
  load();
});

(async () => {
  const session = await requireSession();
  me = session.user;
  mountNav('equipo');
  sb = await supa();
  $('siteUrl').textContent = location.host;
  try { await load(); } catch (err) { toast(err.message); }
})();
