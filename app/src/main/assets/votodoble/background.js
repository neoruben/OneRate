/* Fondo: busca la película en la otra web y coordina el voto en una pestaña en segundo plano.
   Funciona en Firefox (página de fondo) y en Chrome (service worker, sin DOMParser). */
'use strict';

const api = globalThis.browser || globalThis.chrome;
const FA = 'https://www.filmaffinity.com/es';

const norm = s => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').replace(/^(the|el|la|los|las|le|les|il|der|die|das) /, '').trim();

const decode = s => String(s || '')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();

function titleScore(cand, movie) {
  const c = norm(cand);
  const opts = [movie.original, movie.title].map(norm).filter(Boolean);
  if (opts.includes(c)) return 3;
  if (opts.some(o => o && c && (o.includes(c) || c.includes(o)))) return 1;
  return 0;
}

function yearScore(y, movie) {
  const a = parseInt(y, 10), b = parseInt(movie.year, 10);
  if (!a || !b) return 0;
  if (a === b) return 3;
  if (Math.abs(a - b) === 1) return 1;
  return -3;
}

function rank(cands) {
  cands.sort((a, b) => b.score - a.score);
  const confident = cands.length > 0 && cands[0].score >= 6 && (cands.length === 1 || cands[0].score - cands[1].score >= 2);
  return { candidates: cands, confident };
}

// ---------------------------------------------------------------- IMDb
async function imdbSuggest(q) {
  q = String(q || '').trim().toLowerCase();
  if (!q) return [];
  const r = await fetch(`https://v3.sg.media-imdb.com/suggestion/x/${encodeURIComponent(q)}.json?includeVideos=0`, { credentials: 'omit' });
  if (!r.ok) throw new Error(`IMDb respondió ${r.status}`);
  return ((await r.json()).d || []).filter(d => /^tt\d+$/.test(d.id || ''));
}

async function findImdb(movie) {
  const seen = new Map();
  // Título original, español y, si no sale nada, versiones recortadas (sin subtítulo, primeras palabras)
  const short = t => String(t || '').split(/\s[:\-–(]\s?|:\s/)[0].trim();
  const words = t => String(t || '').split(/\s+/).slice(0, 4).join(' ');
  const queries = [...new Set([movie.original, movie.title, short(movie.original), short(movie.title),
    words(movie.original), words(movie.title)].map(q => String(q || '').trim()).filter(q => q.length > 1))];
  for (const [i, q] of queries.entries()) {
    if (i >= 2 && seen.size) break;           // los recortes solo si no ha salido nada
    if (seen.size >= 8) break;
    for (const d of await imdbSuggest(q)) if (!seen.has(d.id)) seen.set(d.id, d);
  }
  const isSeries = /serie/i.test(movie.kind || '');
  const cands = [...seen.values()].map(d => {
    const kind = d.q || '';
    let score = titleScore(d.l, movie) + yearScore(d.y, movie);
    if (isSeries === /series/i.test(kind)) score += 1;
    return {
      id: d.id, title: d.l, year: d.y ? String(d.y) : '', score,
      extra: [kind, d.s].filter(Boolean).join(' · ').slice(0, 70),
      url: `https://www.imdb.com/title/${d.id}/`,
    };
  });
  const q = movie.original || movie.title;
  return { ...rank(cands), searchUrl: `https://www.imdb.com/find/?q=${encodeURIComponent(q)}&s=tt` };
}

// ---------------------------------------------------------------- FilmAffinity
// Lectura del HTML con expresiones regulares (el service worker de Chrome no tiene DOMParser)
function parseFaSearch(html, finalUrl) {
  if (/<title>[^<]*(attention required|you have been blocked)/i.test(html)) {
    throw new Error('FilmAffinity (Cloudflare) ha bloqueado la búsqueda');
  }
  const out = [];
  const starts = [...html.matchAll(/class="[^"]*\bmovie-card\b[^"]*"\s+data-movie-id="(\d+)"/g)];
  starts.forEach((m, i) => {
    const chunk = html.slice(m.index, i + 1 < starts.length ? starts[i + 1].index : m.index + 8000);
    const title = (chunk.match(/class="[^"]*\bmc-title\b[^"]*">\s*<a[^>]*>([^<]+)<\/a>/) || [])[1];
    if (!title) return;
    const dirBlock = (chunk.match(/class="[^"]*\bmc-director\b[^"]*">([\s\S]*?)<\/div>\s*<\/div>/) || [])[1] || '';
    out.push({
      id: m[1],
      title: decode(title),
      year: (chunk.match(/class="[^"]*\bmc-year\b[^"]*">\s*(\d{4})/) || [])[1] || '',
      directors: [...dirBlock.matchAll(/title="([^"]+)"/g)].map(x => decode(x[1])),
      image: ((chunk.match(/(?:data-src|src|data-srcset|srcset)="(https:\/\/pics\.filmaffinity\.com\/[^" ]+)/) || [])[1] || ''),
    });
  });
  // Versión móvil (m.filmaffinity.com, p. ej. desde Firefox para Android)
  if (!out.length) {
    const ms = [...html.matchAll(/class="media mc[^"]*"\s+data-movie-id="?(\d+)/g)];
    ms.forEach((m, i) => {
      const chunk = html.slice(m.index, i + 1 < ms.length ? ms[i + 1].index : m.index + 6000);
      const t = chunk.match(/class="mc-title[^"]*">\s*([^<]+?)\s*<small>\s*\((\d{4})\)/);
      if (!t) return;
      const dir = (chunk.match(/class="mc-director">(?:<img[^>]*>)?([^<]+)</) || [])[1] || '';
      out.push({
        id: m[1], title: decode(t[1]), year: t[2],
        directors: decode(dir).replace(/\.\.\.\s*$/, '').split(',').map(s => s.trim()).filter(Boolean),
        image: ((chunk.match(/(?:data-src|src|data-srcset|srcset)="(https:\/\/pics\.filmaffinity\.com\/[^" ]+)/) || [])[1] || ''),
      });
    });
  }
  // Un único resultado: FilmAffinity redirige directamente a la ficha
  const film = (finalUrl || '').match(/film(\d+)\.html/);
  if (!out.length && film) {
    out.push({
      id: film[1],
      title: decode((html.match(/<h1 id="main-title">\s*<span itemprop="name">([^<]+)/)
        || html.match(/class="main-movie-title" itemprop="name">([^<]+)/) || [])[1]),
      year: (html.match(/itemprop="datePublished">\s*(\d{4})/) || [])[1] || '',
      directors: [...new Set([...html.matchAll(/itemprop="director"[\s\S]{0,400}?itemprop="name">(?:<img[^>]*>)?([^<]+)</g)]
        .map(x => decode(x[1])))],
      image: ((html.match(/(?:data-src|src)="(https:\/\/pics\.filmaffinity\.com\/[^"]+-(?:mmed|large|msmall)\.jpg)"/) || [])[1] || ''),
    });
  }
  return out;
}

async function faSearch(q) {
  const url = `${FA}/search.php?stype=title&stext=${encodeURIComponent(q)}`;
  const r = await fetch(url, { credentials: 'include' });
  if (r.status === 403) throw new Error('FilmAffinity (Cloudflare) ha bloqueado la búsqueda');
  if (!r.ok) throw new Error(`FilmAffinity respondió ${r.status}`);
  return parseFaSearch(await r.text(), r.url);
}

async function findFa(movie) {
  const seen = new Map();
  for (const q of [movie.original, movie.title]) {
    if (!q || seen.size) continue;
    for (const c of await faSearch(q)) if (!seen.has(c.id)) seen.set(c.id, c);
  }
  const dirs = (movie.directors || []).map(norm);
  const cands = [...seen.values()].map(c => {
    let score = titleScore(c.title, movie) + yearScore(c.year, movie);
    if (dirs.length && c.directors.some(d => dirs.includes(norm(d)))) score += 4;
    return {
      id: c.id, title: c.title, year: c.year, score,
      extra: c.directors.slice(0, 2).join(', '),
      image: c.image || '',
      url: `${FA}/film${c.id}.html`,
    };
  });
  return { ...rank(cands), searchUrl: faSearchUrl(movie) };
}

const faSearchUrl = movie => `${FA}/search.php?stype=title&stext=${encodeURIComponent(movie.original || movie.title || '')}`;

// ---------------------------------------------------------------- buscador propio (search.html)
async function searchImdb(q) {
  const small = u => u ? u.replace(/\._V1_.*(\.\w+)$/, '._V1_UX150_$1') : '';
  return { items: (await imdbSuggest(q)).filter(d => d.q || d.qid).map(d => ({
    id: d.id, title: d.l, year: d.y ? String(d.y) : '', kind: d.q || '', cast: d.s || '',
    image: small(d.i && d.i.imageUrl), url: `https://www.imdb.com/title/${d.id}/`,
  })) };
}

// Estado de sesión: IMDb por su cookie de usuario; FilmAffinity mirando si la portada ofrece cerrar o iniciar sesión
async function loginStatus() {
  const imdb = await api.cookies.getAll({ domain: 'imdb.com' })
    .then(cs => cs.some(c => c.name === 'at-main' || c.name === 'sess-at-main'))
    .catch(() => null);
  // La portada móvil (m.filmaffinity.com/es/main.html) da 404, así que se usa la búsqueda, que existe en las dos versiones.
  // Sin sesión, FilmAffinity siempre muestra el enlace «Iniciar sesión» (login.php / class="sign-in").
  let fa = null;
  try {
    const r = await fetch(`${FA}/search.php?stype=title&stext=matrix`, { credentials: 'include' });
    const h = await r.text();
    if (r.ok && /filmaffinity/i.test(h)) {
      if (/logout/i.test(h)) fa = true;
      else if (/login\.php|class="[^"]*\bsign-in\b/i.test(h)) fa = false;
      else fa = true;
    }
  } catch (e) { /* sin conexión: desconocido */ }
  // Letterboxd: primero la cookie de sesión (letterboxd.user.CURRENT); si no está, su portada,
  // que marca el <body> con la clase logged-in o logged-out
  let lb = null, lbWhy = '';
  const lbCookies = await api.cookies.getAll({ domain: 'letterboxd.com' }).catch(() => null);
  if (lbCookies && lbCookies.some(c => /^letterboxd\.user/i.test(c.name))) lb = true;
  if (lb === null) {
    try {
      const r = await fetch('https://letterboxd.com/', { credentials: 'include' });
      const h = await r.text();
      const cls = (h.match(/<body[^>]*\sclass="([^"]*)"/) || [])[1] || '';
      if (/\blogged-in\b/.test(cls)) lb = true;
      else if (/\blogged-out\b/.test(cls)) lb = false;
      else lbWhy = `HTTP ${r.status}${/just a moment|challenge/i.test(h) ? ', bloqueo anti-bots' : ''}`;
    } catch (e) { lbWhy = e.message || String(e); }
  }
  // Si la portada no respondió pero tenemos las cookies y no hay ninguna de sesión, es que no hay sesión
  if (lb === null && lbCookies) lb = false;
  if (lbCookies) lbWhy += ` · cookies: ${lbCookies.map(c => c.name).join(', ') || 'ninguna'}`;
  return { imdb, fa, lb, lbWhy };
}

// ---------------------------------------------------------------- Letterboxd
// Puntúa en medias estrellas: nota 1-10 = 0,5-5 estrellas, que es justo el valor que espera su formulario.
// Se ejecuta en el contexto de la página para usar su sesión y su token CSRF.
async function lbRate(tabId, rating) {
  const [res] = await api.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    args: [Number(rating)],
    func: async n => {
      const el = document.querySelector('[data-rate-action]');
      let action = el && el.getAttribute('data-rate-action');
      if (!action) {
        // La ficha lleva el identificador interno como data-production-uid="film:51518"
        const u = document.querySelector('[data-production-uid^="film:"]');
        const uid = (u && u.getAttribute('data-production-uid'))
          || (document.documentElement.innerHTML.match(/viewingable\.uid = '(film:\d+)'/) || [])[1];
        if (uid) action = `/s/${uid}/rate/`;
      }
      const csrf = window.supermodelCSRF
        || (document.cookie.match(/com\.xk72\.webparts\.csrf=([^;]+)/) || [])[1]
        || (document.querySelector('input[name="__csrf"]') || {}).value;
      const signedIn = document.body.classList.contains('logged-in') || !document.body.classList.contains('logged-out');
      if (!signedIn) return { ok: false, msg: 'Tienes que iniciar sesión en Letterboxd' };
      if (!action) return { ok: false, msg: 'No encuentro la película en Letterboxd' };
      if (!csrf) return { ok: false, msg: signedIn ? 'Letterboxd no dio el token para votar' : 'Tienes que iniciar sesión en Letterboxd' };
      const r = await fetch(action, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' },
        body: `rating=${n}&__csrf=${encodeURIComponent(csrf)}`,
      });
      let j = null;
      try { j = await r.json(); } catch (e) { /* no es JSON */ }
      if (r.ok && j && j.result !== false) return { ok: true };
      const why = j && (j.messages || j.errorCodes);
      return { ok: false, msg: (why && [].concat(why).join(' ')) || `Letterboxd respondió ${r.status}` };
    },
  });
  return (res && res.result) || { ok: false, msg: 'No se pudo ejecutar el voto en Letterboxd' };
}

// Ficha de Letterboxd a partir del código de IMDb: título y carátula (para mostrarlos en el buscador)
async function lbInfo(imdbId) {
  const r = await fetch(`https://letterboxd.com/imdb/${imdbId}/`, { credentials: 'include' });
  if (r.status === 404) return { found: false };
  if (!r.ok) throw new Error(`Letterboxd respondió ${r.status}`);
  const h = await r.text();
  const title = decode((h.match(/<meta property="og:title" content="([^"]+)"/) || [])[1] || '');
  const image = (h.match(/"image":"(https:\/\/a\.ltrbxd\.com\/resized\/film-poster\/[^"]+)"/) || [])[1] || '';
  return { found: !!title, title, image: image.replace(/-0-600-0-900-crop/, '-0-140-0-210-crop'), url: r.url, avg: parseLbAvg(h) };
}

// ---------------------------------------------------------------- notas medias
// Cada función devuelve { avg, max, count } o null si no se encuentra la nota (p. ej. película sin votos)
const toNum = s => { const n = parseFloat(String(s == null ? '' : s).replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? n : null; };
const mkAvg = (avg, max, count) => (avg != null && avg > 0 && avg <= max) ? { avg, max, count: count != null ? Math.round(count) : null } : null;

// IMDb: JSON-LD de la ficha (aggregateRating) y, si no, los datos internos de la página
function parseImdbAvg(h) {
  let m = h.match(/"aggregateRating"\s*:\s*\{[^}]*?"ratingValue"\s*:\s*"?([\d.]+)/);
  if (m) {
    const c = (h.match(/"aggregateRating"\s*:\s*\{[^}]*?"ratingCount"\s*:\s*"?(\d+)/) || [])[1];
    return mkAvg(toNum(m[1]), 10, toNum(c));
  }
  m = h.match(/"ratingsSummary"\s*:\s*\{\s*"aggregateRating"\s*:\s*([\d.]+)\s*,\s*"voteCount"\s*:\s*(\d+)/);
  return m ? mkAvg(toNum(m[1]), 10, toNum(m[2])) : null;
}

// FilmAffinity: <div id="movie-rat-avg" itemprop="ratingValue" content="7.5">7,5</div>
function parseFaAvg(h) {
  const m = h.match(/itemprop="ratingValue"[^>]*content="([\d.,]+)"/)
    || h.match(/content="([\d.,]+)"[^>]*itemprop="ratingValue"/)
    || h.match(/id="movie-rat-avg"[^>]*>\s*([\d.,]+)\s*</);
  const c = (h.match(/itemprop="ratingCount"[^>]*content="(\d+)"/) || h.match(/content="(\d+)"[^>]*itemprop="ratingCount"/) || [])[1];
  return m ? mkAvg(toNum(m[1]), 10, toNum(c)) : null;
}

// Letterboxd (sobre 5): JSON-LD de la ficha o la etiqueta twitter:data2 («4.20 out of 5»)
function parseLbAvg(h) {
  let m = h.match(/"aggregateRating"\s*:\s*\{[^}]*?"ratingValue"\s*:\s*"?([\d.]+)/);
  if (m) {
    const c = (h.match(/"aggregateRating"\s*:\s*\{[^}]*?"ratingCount"\s*:\s*"?(\d+)/) || [])[1];
    return mkAvg(toNum(m[1]), 5, toNum(c));
  }
  m = h.match(/name="twitter:data2"\s+content="([\d.]+) out of 5"/);
  return m ? mkAvg(toNum(m[1]), 5, null) : null;
}

async function avgFromPage(url, parse, site) {
  const r = await fetch(url, { credentials: 'include' });
  if (!r.ok) throw new Error(`${site} respondió ${r.status}`);
  return { avg: parse(await r.text()) };
}
const imdbAvg = id => avgFromPage(`https://www.imdb.com/title/${encodeURIComponent(id)}/`, parseImdbAvg, 'IMDb');
const faAvg = id => avgFromPage(`${FA}/film${encodeURIComponent(id)}.html`, parseFaAvg, 'FilmAffinity');

// ---------------------------------------------------------------- vuelta tras iniciar sesión
// El buscador avisa de que abres una web para iniciar sesión; returner.js pregunta desde esa web
let loginWatch = null;   // { site, until }
async function loginReturnCheck(site, tabId) {
  if (!loginWatch || loginWatch.site !== site || Date.now() > loginWatch.until || pending.has(tabId)) {
    return { go: false, watching: false };
  }
  const st = await loginStatus();
  if (st[site] === true) { loginWatch = null; return { go: true }; }
  return { go: false, watching: true };
}

// ---------------------------------------------------------------- votar en otra pestaña
const pending = new Map();   // tabId -> { site, rating, resolve, timer }

function finish(tabId, result) {
  const p = pending.get(tabId);
  if (!p) return;
  pending.delete(tabId);
  clearTimeout(p.timer);
  p.resolve(result);
  if (result.ok) api.tabs.remove(tabId).catch(() => {});
  else api.tabs.update(tabId, { active: true }).catch(() => {});
}

async function startVote({ site, url, rating }) {
  if (!/^https:\/\/(www\.filmaffinity\.com|m\.filmaffinity\.com|www\.imdb\.com|m\.imdb\.com|letterboxd\.com)\//.test(url)) return { ok: false, msg: 'URL no válida' };
  const tab = await api.tabs.create({ url, active: false });
  return new Promise(resolve => {
    const timer = setTimeout(() => finish(tab.id, { ok: false, msg: 'La página no respondió a tiempo' }), 60000);
    pending.set(tab.id, { site, rating, resolve, timer });
  });
}

// Plan B de FilmAffinity: usar su propio selector (jQuery + bootstrap-select) en el contexto de la página
async function faPageSelect(tabId, rating) {
  await api.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    args: [String(rating)],
    func: n => {
      const $ = window.jQuery;
      if ($) $('.rate-movie-box select').selectpicker('val', n).trigger('change');
    },
  });
  return true;
}

// Si IMDb o FilmAffinity mandan a la página de inicio de sesión
api.tabs.onUpdated.addListener((tabId, info) => {
  if (!pending.has(tabId) || !info.url) return;
  if (/\/ap\/signin|registration\/signin|\/login\.php|letterboxd\.com\/sign-in/.test(info.url)) {
    const site = { imdb: 'IMDb', fa: 'FilmAffinity', lb: 'Letterboxd' }[pending.get(tabId).site];
    finish(tabId, { ok: false, msg: `Tienes que iniciar sesión en ${site}` });
  }
});
api.tabs.onRemoved.addListener(tabId => finish(tabId, { ok: false, msg: 'Se cerró la pestaña' }));

// Sin permiso de acceso a las webs, fetch falla con un error de red: mensaje claro
const NO_PERM = 'La extensión no tiene permiso para acceder a FilmAffinity/IMDb. Pulsa su botón (en la barra) y luego «Dar permisos».';
async function explain(e) {
  const origins = api.runtime.getManifest().host_permissions;
  const ok = await api.permissions.contains({ origins }).catch(() => true);
  return ok ? (e.message || String(e)) : NO_PERM;
}

// Al instalar o actualizar: si faltan permisos (Firefox), abre los ajustes para darlos
api.runtime.onInstalled.addListener(async () => {
  const ok = await api.permissions.contains({ origins: api.runtime.getManifest().host_permissions }).catch(() => true);
  if (!ok) api.runtime.openOptionsPage();
});

// sendResponse + return true: funciona igual en Chrome y en Firefox
api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = sender.tab && sender.tab.id;
  const reply = p => { Promise.resolve(p).then(sendResponse, e => sendResponse({ error: e.message || String(e) })); return true; };
  switch (msg && msg.type) {
    case 'findImdb': return reply(findImdb(msg.movie).catch(async e => ({ error: await explain(e),
      searchUrl: `https://www.imdb.com/find/?q=${encodeURIComponent(msg.movie.original || msg.movie.title || '')}&s=tt` })));
    case 'findFa': return reply(findFa(msg.movie).catch(async e => ({ error: await explain(e), searchUrl: faSearchUrl(msg.movie) })));
    case 'startVote': return reply(startVote(msg));
    case 'lbRate': return reply(tabId ? lbRate(tabId, msg.rating) : { ok: false, msg: 'Sin pestaña' });
    case 'lbInfo': return reply(lbInfo(msg.id).catch(e => ({ error: e.message || String(e) })));
    case 'avgImdb': return reply(imdbAvg(msg.id).catch(e => ({ error: e.message || String(e) })));
    case 'avgFa': return reply(faAvg(msg.id).catch(e => ({ error: e.message || String(e) })));
    case 'watchLogin': loginWatch = { site: msg.site, until: Date.now() + 10 * 60 * 1000 }; return reply(true);
    case 'loginReturnCheck': return reply(loginReturnCheck(msg.site, tabId));
    case 'loginStatus': return reply(loginStatus());
    case 'searchImdb': return reply(searchImdb(msg.q).catch(async e => ({ error: await explain(e) })));
    case 'getPending': {
      const p = pending.get(tabId);
      return reply(p ? { site: p.site, rating: p.rating } : null);
    }
    case 'faPageSelect': return reply(tabId ? faPageSelect(tabId, msg.rating) : false);
    case 'voteResult': finish(tabId, { ok: !!msg.ok, msg: msg.msg || '' }); return reply(true);
  }
  return false;
});

// Para las pruebas con node
if (typeof module !== 'undefined') module.exports = { parseFaSearch, findImdb, findFa, parseImdbAvg, parseFaAvg, parseLbAvg };
