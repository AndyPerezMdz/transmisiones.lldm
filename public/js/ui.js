// Piezas de interfaz compartidas: tema claro/oscuro, barra de navegación y avisos.
import { demo, supa, qs } from './db.js';

export const $ = id => document.getElementById(id);
export function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) e.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return e;
}

let toastTimer;
export function toast(text, kind = 'error') {
  let t = $('toast');
  if (!t) { t = el('div', { id: 'toast', class: 'toast', role: 'status' }); document.body.append(t); }
  t.textContent = text; t.className = 'toast show ' + kind;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.className = 'toast ' + kind, kind === 'error' ? 5000 : 3200);
}

// ---------- Tema ----------
export const isDark = () => document.documentElement.classList.contains('dark');
const SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const MOON = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
export function themeButton(extraClass = '') {
  const b = el('button', { type: 'button', class: 'nav-boton ' + extraClass });
  const paint = () => {
    b.innerHTML = isDark() ? SUN : MOON;
    b.title = isDark() ? 'Tema claro' : 'Tema oscuro';
    b.setAttribute('aria-label', b.title);
  };
  b.onclick = () => {
    const dark = !isDark();
    document.documentElement.classList.toggle('dark', dark);
    try { localStorage.setItem('tema', dark ? 'oscuro' : 'claro'); } catch {}
    paint();
  };
  paint();
  return b;
}

// ---------- Navegación ----------
export function withDemo(path, params = {}) {
  const parts = Object.entries(params).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v)}`);
  if (demo) parts.push('demo');
  return path + (parts.length ? '?' + parts.join('&') : '');
}
export const absolute = (path, params) => location.origin + withDemo(path, params);

export function mountNav(active, { roomName = '' } = {}) {
  const sala = qs.get('sala');
  const links = [
    { id: 'salas', n: 'Salas', href: withDemo('/') },
    ...(sala ? [
      { id: 'cabina', n: 'Cabina', href: withDemo('/control', { sala }) },
      { id: 'diseno', n: 'Diseño', href: withDemo('/diseno', { sala }) }
    ] : []),
    { id: 'cantos', n: 'Cantos', href: withDemo('/cantos', { sala }) },
    { id: 'equipo', n: 'Equipo', href: withDemo('/equipo', { sala }) }
  ];
  const linkList = () => el('nav', { class: 'nav-links' },
    links.map(l => el('a', { href: l.href, class: l.id === active ? 'activo' : null, text: l.n })));
  const salir = el('button', { type: 'button', class: 'nav-boton', text: 'Salir', title: 'Cerrar sesión' });
  salir.onclick = async () => { const sb = await supa(); await sb?.auth.signOut(); location.href = '/'; };
  const help = el('button', { type: 'button', class: 'nav-boton', id: 'navAyuda', title: 'Cómo se usa', text: '?' });
  help.hidden = true;
  const header = el('header', { class: 'nav' },
    el('div', { class: 'nav-in' },
      el('a', { class: 'nav-marca', href: withDemo('/') },
        el('img', { src: '/img/antorcha-clara.png', alt: '' }),
        el('span', {}, el('b', { text: 'Cabina en Vivo' }), el('small', { text: 'La Luz del Mundo' }))),
      linkList(),
      el('div', { class: 'nav-der' },
        roomName ? el('span', { class: 'nav-sala', id: 'navSala', text: roomName }) : el('span', { class: 'nav-sala', id: 'navSala' }),
        help, themeButton(), demo ? el('span', { class: 'nav-boton', title: 'Sin base de datos', text: 'Demo' }) : salir)),
    el('div', { class: 'nav-movil' }, linkList()));
  document.body.prepend(header);
  return header;
}

// Evita que Enter o Espacio repitan el último botón que se presionó con el mouse.
document.addEventListener('click', e => { const b = e.target.closest?.('button'); if (b && e.detail > 0) b.blur(); });

// ---------- Ventanas propias (en lugar de confirm/prompt del navegador) ----------
// Devuelve true/false, o el texto escrito si se pide un campo (null si cancelan).
export function modal({ title, text = '', ok = 'Aceptar', cancel = 'Cancelar', danger = false, input = null }) {
  return new Promise(resolve => {
    const field = input ? el('input', { class: 'campo', value: input.value ?? '', placeholder: input.placeholder || '', maxlength: input.maxLength || 200 }) : null;
    const okBtn = el('button', { class: 'btn ' + (danger ? 'btn-rojo' : 'btn-primario'), value: 'ok', text: ok });
    const form = el('form', { method: 'dialog', class: 'dialogo' },
      el('h2', { class: 'titulo', style: 'font-size:21px', text: title }),
      text ? el('p', { class: 'ayuda', style: 'font-size:15px', text }) : null,
      field ? el('label', { class: 'etiqueta' }, input.label || '', field) : null,
      el('div', { class: 'dialogo-pie' },
        cancel ? el('button', { class: 'btn btn-sec', value: 'cancel', formnovalidate: true, text: cancel }) : null, okBtn));
    const dlg = el('dialog', {}, form);
    document.body.append(dlg);
    dlg.addEventListener('close', () => {
      const yes = dlg.returnValue === 'ok';
      dlg.remove();
      resolve(field ? (yes ? field.value.trim() : null) : yes);
    });
    dlg.showModal();
    (field || okBtn).focus();
    if (field) field.select();
  });
}
