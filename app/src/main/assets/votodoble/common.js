/* Utilidades compartidas por fa.js e imdb.js: aviso flotante, esperas y normalización. */
'use strict';

// Firefox usa browser.*, Chrome chrome.* (los dos con promesas en Manifest V3)
const api = globalThis.browser || globalThis.chrome;
const VD = {};

VD.norm = s => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').replace(/^(the|el|la|los|las|le|les|il|der|die|das) /, '').trim();

VD.sleep = ms => new Promise(r => setTimeout(r, ms));

VD.waitFor = async (fn, timeout = 15000, step = 250) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const v = fn();
    if (v) return v;
    await VD.sleep(step);
  }
  return null;
};

VD.send = msg => api.runtime.sendMessage(msg);

// Crea elementos sin innerHTML: h('a', {href, class}, 'texto', otroNodo)
VD.h = (tag, attrs = {}, ...children) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v);
  }
  for (const c of children.flat(Infinity)) if (c != null && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
};
VD.link = (href, text) => VD.h('a', { href, target: '_blank', rel: 'noopener' }, text);

// Aviso flotante (shadow DOM para no mezclarse con los estilos de la web)
VD.toast = (() => {
  const h = VD.h;
  const CSS = `
    .c{font:14px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;background:#1c252b;color:#e8eef1;border-radius:12px;
       padding:12px 14px;box-shadow:0 8px 30px rgba(0,0,0,.45);border:1px solid #2f3d46}
    .h{font-weight:700;margin-bottom:6px;display:flex;gap:8px;align-items:center}
    .h .x{margin-left:auto;cursor:pointer;opacity:.6;background:none;border:0;color:inherit;font-size:16px;padding:0}
    .m{color:#c3d0d6} .m a{color:#7fb7ff}
    select{width:100%;margin-top:8px;padding:6px;border-radius:6px;background:#24313a;color:#e8eef1;border:1px solid #2f3d46;font:inherit}
    .b{display:flex;gap:8px;margin-top:10px}
    button.p,button.s{font:inherit;border-radius:8px;padding:7px 12px;cursor:pointer;border:1px solid #2f3d46}
    button.p{background:#2fbf71;color:#06210f;font-weight:700;border-color:#2fbf71}
    button.s{background:#24313a;color:#e8eef1}`;
  let host, box, timer;
  function ensure() {
    if (host && document.body.contains(host)) return;
    host = h('div');
    host.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;max-width:min(380px,calc(100vw - 32px));';
    const root = host.attachShadow({ mode: 'closed' });
    const style = h('style');
    style.textContent = CSS;
    box = h('div', { class: 'c' });
    root.append(style, box);
    document.body.appendChild(host);
  }

  /** show({title, body: [nodos o texto], choices:[{label,value}], buttons:[{label, primary, onClick(choice)}], autoClose}) */
  function show({ title, body = [], choices = null, buttons = [], autoClose = 0 }) {
    ensure();
    clearTimeout(timer);
    const sel = choices && choices.length > 1
      ? h('select', {}, choices.map((c, i) => h('option', { value: String(i) }, c.label)))
      : null;
    const pick = () => (choices ? choices[sel ? +sel.value : 0].value : null);
    box.replaceChildren(
      h('div', { class: 'h' }, '🎬 ', h('span', {}, title), h('button', { class: 'x', title: 'Cerrar', onclick: hide }, '✕')),
      h('div', { class: 'm' }, body),
      sel,
      buttons.length ? h('div', { class: 'b' }, buttons.map(b =>
        h('button', { class: b.primary ? 'p' : 's', onclick: () => b.onClick && b.onClick(pick()) }, b.label))) : null,
    );
    if (autoClose) timer = setTimeout(hide, autoClose);
  }
  function hide() { if (host) host.remove(); host = null; }
  return { show, hide };
})();

/**
 * Flujo común cuando el usuario vota en una web (origen):
 * busca la película en la otra web, pregunta (o no) y pide al fondo que vote allí.
 */
VD.offerVote = async ({ rating, movie, target, targetName }) => {
  const { h, link } = VD;
  VD.toast.show({ title: `Has votado ${rating}`, body: [`Buscando la película en ${targetName}…`] });
  let res;
  try {
    res = await VD.send({ type: target === 'imdb' ? 'findImdb' : 'findFa', movie });
  } catch (e) {
    res = { error: String(e) };
  }
  if (!res || res.error || !res.candidates || !res.candidates.length) {
    VD.toast.show({
      title: `No la encuentro en ${targetName}`,
      body: [
        res && res.error ? [res.error, h('br')] : null,
        h('small', {}, `He buscado: «${movie.original || movie.title}»${movie.year ? ` (${movie.year})` : ''}`), h('br'),
        res && res.searchUrl ? link(res.searchUrl, 'Buscar a mano ↗') : null,
      ],
    });
    return;
  }
  const cands = res.candidates;
  const label = c => `${c.title}${c.year ? ` (${c.year})` : ''}${c.extra ? ' · ' + c.extra : ''}`;
  const doVote = async c => {
    VD.toast.show({ title: `Votando ${rating} en ${targetName}…`, body: [label(c)] });
    const r = await VD.send({ type: 'startVote', site: target, id: c.id, url: c.url, rating, label: label(c) });
    if (r && r.ok) {
      VD.toast.show({ title: `✔ Votado ${rating} en ${targetName}`, body: [link(c.url, `${label(c)} ↗`), r.msg ? [h('br'), r.msg] : null], autoClose: 8000 });
    } else {
      VD.toast.show({ title: `✘ No se pudo votar en ${targetName}`, body: [(r && r.msg) || 'error desconocido', h('br'), 'He dejado abierta la pestaña para que votes a mano.'] });
    }
  };
  const { askFirst } = await api.storage.local.get({ askFirst: true });
  if (!askFirst && res.confident) return doVote(cands[0]);
  VD.toast.show({
    title: `¿Votar ${rating} también en ${targetName}?`,
    body: [link(cands[0].url, `${label(cands[0])} ↗`),
      res.confident ? null : [h('br'), h('small', {}, 'Coincidencia dudosa: comprueba que es la misma.')]],
    choices: cands.slice(0, 8).map(c => ({ label: label(c), value: c })),
    buttons: [
      { label: `Votar ${rating}`, primary: true, onClick: c => doVote(c || cands[0]) },
      { label: 'No', onClick: () => VD.toast.hide() },
    ],
  });
};
