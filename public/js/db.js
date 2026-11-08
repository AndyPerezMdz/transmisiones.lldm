// Acceso a Supabase. Sin configuración, todo funciona en modo demo local.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';

const SUPABASE_JS = '/vendor/supabase.js'; // npm run vendor
export const demo = !SUPABASE_URL || !SUPABASE_ANON_KEY || new URLSearchParams(location.search).has('demo');

let clientPromise = null;
export function supa() {
  if (demo) return Promise.resolve(null);
  clientPromise ??= import(SUPABASE_JS).then(({ createClient }) =>
    createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } }));
  return clientPromise;
}

// Páginas privadas (cabina y cantos): sin sesión te manda a iniciar sesión.
export async function requireSession() {
  if (demo) return { user: { id: 'demo', email: 'demo' } };
  const sb = await supa();
  const { data } = await sb.auth.getSession();
  if (!data.session) {
    location.href = '/?volver=' + encodeURIComponent(location.pathname + location.search);
    return new Promise(() => {});
  }
  return data.session;
}

export async function loadBible() {
  const res = await fetch('/data/rv1909.json');
  if (!res.ok) throw new Error('No se pudo cargar la Biblia.');
  return res.json();
}

// Cantos de ejemplo para el modo demo. No son letras reales.
const DEMO_SONGS = [
  { id: 'demo-1', kind: 'hymn', number: 1, title: 'Canto de prueba', sections: [
    { type: 'verse', label: 'Estrofa 1', lines: ['Esta es la primera línea', 'de un canto de ejemplo,', 'sirve para probar', 'cómo se ve en las pantallas.'] },
    { type: 'chorus', label: 'Coro', lines: ['Aquí iría el coro,', 'se marca en cursiva', 'para que se distinga.'] },
    { type: 'verse', label: 'Estrofa 2', lines: ['Segunda estrofa de prueba,', 'captura los cantos reales', 'en la página de Cantos.'] }] },
  { id: 'demo-2', kind: 'hymn', number: 2, title: 'Himno de muestra', sections: [
    { type: 'verse', label: 'Estrofa 1', lines: ['Otra letra inventada', 'para revisar el buscador.'] }] },
  { id: 'demo-3', kind: 'coro', number: 1, title: 'Coro de ejemplo', sections: [
    { type: 'chorus', label: 'Coro', lines: ['Un coro corto de prueba', 'con dos líneas nada más.'] }] }
];

export async function loadSongs(teamId) {
  if (demo) return DEMO_SONGS;
  const sb = await supa();
  const all = [];
  for (let from = 0; ; from += 1000) {
    let q = sb.from('songs').select('id, kind, number, title, sections');
    if (teamId) q = q.eq('team_id', teamId);
    const { data, error } = await q
      .order('kind').order('number', { nullsFirst: false }).order('title').range(from, from + 999);
    if (error) throw new Error('No se pudieron cargar los cantos: ' + error.message);
    all.push(...data);
    if (data.length < 1000) break;
  }
  return all;
}

export const qs = new URLSearchParams(location.search);
export const roomId = () => qs.get('sala') || 'demo';

// ---------- Equipos ----------
// Todo (cantos, salas, diseños) pertenece a un equipo: la congregación.
const TEAM_KEY = 'cabina-equipo';
export async function acceptInvites() {
  if (demo) return 0;
  const sb = await supa();
  const { data } = await sb.rpc('accept_invites');
  return data || 0;
}
export async function myTeams() {
  if (demo) { let theme = {}; try { theme = JSON.parse(localStorage.getItem('cabina-demo-paleta') || '{}'); } catch {} return [{ id: 'demo', name: 'Equipo de prueba', role: 'admin', theme }]; }
  const sb = await supa();
  const { data: { user } } = await sb.auth.getUser();
  const { data, error } = await sb.from('team_members').select('role, team:teams(id, name, theme)').eq('user_id', user.id);
  if (error) throw new Error(error.message);
  return data.filter(m => m.team).map(m => ({ id: m.team.id, name: m.team.name, theme: m.team.theme || {}, role: m.role }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
export function pickTeam(teams) {
  let saved = null;
  try { saved = localStorage.getItem(TEAM_KEY); } catch {}
  return teams.find(t => t.id === saved) || teams[0] || null;
}
export function rememberTeam(id) { try { localStorage.setItem(TEAM_KEY, id); } catch {} }
// Equipo actual de quien está usando la app (o null si todavía no lo invitan).
export async function currentTeam() { return pickTeam(await myTeams()); }
