// Sincroniza lo que está al aire y el diseño de cada sala.
// - Misma computadora (cabina → TVs): BroadcastChannel, instantáneo y sin internet.
// - Otras ventanas o programas (OBS, otra compu): Supabase Realtime.
// Cada estado lleva "rev"; se aplica solo el más nuevo, venga de donde venga.
import { demo, supa } from './db.js';

const channelName = room => 'cabina-en-vivo:' + room;
const DEMO_DESIGN_KEY = room => 'cabina-diseno:' + room;

export function createPublisher(room, { getState, onSyncChange = () => {} }) {
  const bc = 'BroadcastChannel' in window ? new BroadcastChannel(channelName(room)) : null;
  bc?.addEventListener('message', e => { if (e.data?.type === 'hello') bc.postMessage({ type: 'state', state: getState() }); });
  let pending = null, writing = false;

  async function flush() {
    if (writing || !pending) return;
    writing = true;
    const state = pending; pending = null;
    let failed = false;
    try {
      const sb = await supa();
      const { error } = await sb.from('rooms').update({ state }).eq('id', room);
      if (error) throw error;
      onSyncChange('ok');
    } catch (err) {
      failed = true;
      onSyncChange('error', err.message);
      pending ??= state; // se reintenta con el temporizador
    } finally {
      writing = false;
      if (pending && !failed) setTimeout(flush, 0);
    }
  }
  setInterval(() => { if (pending) flush(); }, 5000);

  return {
    publish(state) {
      bc?.postMessage({ type: 'state', state });
      if (demo) return onSyncChange('demo');
      pending = state;
      flush();
    }
  };
}

export async function loadRoom(room) {
  if (demo) {
    let design = {};
    try { design = JSON.parse(localStorage.getItem(DEMO_DESIGN_KEY(room)) || '{}'); } catch {}
    return { id: room, name: 'Sala demo', state: {}, design, team_id: 'demo' };
  }
  const sb = await supa();
  const { data, error } = await sb.from('rooms').select('id, name, state, design, team_id').eq('id', room).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function saveDesign(room, design) {
  if ('BroadcastChannel' in window) new BroadcastChannel(channelName(room)).postMessage({ type: 'design', design });
  if (demo) {
    try { localStorage.setItem(DEMO_DESIGN_KEY(room), JSON.stringify(design)); }
    catch { throw new Error('En modo demo las imágenes muy pesadas no caben en el navegador.'); }
    return;
  }
  const sb = await supa();
  const { error } = await sb.from('rooms').update({ design }).eq('id', room);
  if (error) throw new Error(error.message);
}

export function subscribe(room, onState, onDesign = () => {}) {
  let rev = -1, designJson = null;
  const apply = state => {
    if (!state || typeof state.rev !== 'number' || state.rev <= rev) return;
    rev = state.rev;
    onState(state);
  };
  const applyDesign = design => {
    const json = JSON.stringify(design || {});
    if (json === designJson) return;
    designJson = json;
    onDesign(design || {});
  };
  if ('BroadcastChannel' in window) {
    const bc = new BroadcastChannel(channelName(room));
    bc.addEventListener('message', e => {
      if (e.data?.type === 'state') apply(e.data.state);
      else if (e.data?.type === 'design') applyDesign(e.data.design);
    });
    bc.postMessage({ type: 'hello' });
  }
  const refresh = () => loadRoom(room).then(r => { if (r) { applyDesign(r.design); apply(r.state); } }).catch(() => {});
  refresh();
  if (!demo) {
    supa().then(sb => sb.channel('sala-' + room)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: 'id=eq.' + room }, p => {
        if (p.new?.design) applyDesign(p.new.design);
        apply(p.new?.state);
      })
      .subscribe(status => { if (status === 'SUBSCRIBED') refresh(); }));
    // Red de seguridad por si se cae el realtime un rato.
    setInterval(refresh, 15000);
  }
}

// Ajusta la letra al tamaño más grande que quepa en su caja.
export function fitText(el, { min = 18, max = 160 } = {}) {
  const box = el.parentElement;
  const fits = () => el.scrollHeight <= box.clientHeight && el.scrollWidth <= box.clientWidth;
  let lo = min, hi = max;
  el.style.fontSize = hi + 'px';
  if (fits()) return;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    el.style.fontSize = mid + 'px';
    if (fits()) lo = mid; else hi = mid;
  }
  el.style.fontSize = lo + 'px';
}
