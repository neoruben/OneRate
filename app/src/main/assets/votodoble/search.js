/* Buscador propio: busca en IMDb, empareja con FilmAffinity y vota en las dos webs a la vez.
   Reutiliza el background.js de la extensión (searchImdb, findFa, startVote). */
'use strict';

const api = globalThis.browser || globalThis.chrome;
const send = msg => api.runtime.sendMessage(msg);
const $ = sel => document.querySelector(sel);
const main = $('#main');

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const poster = url => `<div class="poster" style="${url ? `background-image:url('${esc(url)}')` : ''}"></div>`;

const thumb = url => `<div class="thumb" style="${url ? `background-image:url('${esc(url)}')` : ''}"></div>`;

// ---------------------------------------------------------------- idioma
// Inglés por defecto; español solo si el móvil está en español
const LANG = /^es\b/i.test(navigator.language || '') ? 'es' : 'en';
document.documentElement.lang = LANG;
const TEXT = {
  en: {
    menu: 'Menu', searchPh: 'Search for a movie or series', search: 'Search', navSearch: 'Search movie',
    accounts: 'Your accounts', checking: 'Checking…', support: 'Support the project',
    coffee: 'Buy me a coffee', opensBrowser: 'Opens in your browser',
    hint: 'Tap an account to open the site and sign in or out. Come back here with the back gesture.',
    legal: 'Unofficial app. Not affiliated with, sponsored or endorsed by FilmAffinity, IMDb or Letterboxd. Those service names are trademarks of their respective owners and are used only to indicate compatibility. Ratings are sent with your own account on each site.',
    intro: 'Type a title and rate it on FilmAffinity, IMDb and Letterboxd at once.',
    searching: 'Searching', noResults: 'Nothing found with that title.',
    checkingAccounts: 'Checking your accounts', back: '‹ Results',
    noAccounts: 'You are not signed in to any site.<br>Open the ☰ menu and sign in to FilmAffinity, IMDb or Letterboxd.',
    where3: 'on all three sites', where2: 'on both sites', where1: s => `on ${s}`,
    findingMovie: 'Finding the movie', yourRating: 'Your rating', pickRating: 'Pick a rating',
    faMissing: 'Choose the movie on FilmAffinity', rate: (n, w) => `Rate ${n} ${w}`,
    notOnLb: 'This movie is not on Letterboxd', sameAsImdb: 'Same movie as on IMDb',
    notOnFa: 'Can’t find it on FilmAffinity.', notSure: 'Not sure which one it is:', pickMovie: 'Choose the movie',
    voting: 'Rating', waiting: 'Waiting', done: 'Rated', error: 'Error',
    signedIn: 'Signed in', signedOut: 'Not signed in', unknown: 'Couldn’t check',
  },
  es: {
    menu: 'Menú', searchPh: 'Busca una película o serie', search: 'Buscar', navSearch: 'Buscar película',
    accounts: 'Tus cuentas', checking: 'Comprobando…', support: 'Apoya el proyecto',
    coffee: 'Invítame a un café', opensBrowser: 'Se abre en tu navegador',
    hint: 'Toca una cuenta para abrir la web e iniciar o cerrar sesión. Vuelve aquí con el gesto de atrás.',
    legal: 'App no oficial. No está afiliada, patrocinada ni respaldada por FilmAffinity, IMDb ni Letterboxd. Los nombres de esos servicios son marcas de sus respectivos propietarios y se usan solo para indicar compatibilidad. Los votos se envían con tu propia sesión en cada web.',
    intro: 'Escribe un título y vota a la vez en FilmAffinity, IMDb y Letterboxd.',
    searching: 'Buscando', noResults: 'No he encontrado nada con ese título.',
    checkingAccounts: 'Comprobando tus cuentas', back: '‹ Resultados',
    noAccounts: 'No tienes sesión iniciada en ninguna web.<br>Abre el menú ☰ e inicia sesión en FilmAffinity, IMDb o Letterboxd.',
    where3: 'en las tres webs', where2: 'en las dos webs', where1: s => `en ${s}`,
    findingMovie: 'Buscando la película', yourRating: 'Tu nota', pickRating: 'Elige una nota',
    faMissing: 'Falta la película en FilmAffinity', rate: (n, w) => `Votar ${n} ${w}`,
    notOnLb: 'Esta película no está en Letterboxd', sameAsImdb: 'Misma película que en IMDb',
    notOnFa: 'No la encuentro en FilmAffinity.', notSure: 'No estoy seguro de cuál es:', pickMovie: 'Elige la película',
    voting: 'Votando', waiting: 'Esperando', done: 'Votado', error: 'Error',
    signedIn: 'Sesión iniciada', signedOut: 'Sin iniciar sesión', unknown: 'No se pudo comprobar',
  },
}[LANG];
const T = (k, ...a) => (typeof TEXT[k] === 'function' ? TEXT[k](...a) : TEXT[k]);

// Mensajes que llegan en español desde la extensión (fondo y webs): se traducen si la app va en inglés
const MSG_EN = [
  [/^Tienes que iniciar sesión en (.+)$/, 'You need to sign in to $1'],
  [/^No has iniciado sesión en FilmAffinity$/, 'You are not signed in to FilmAffinity'],
  [/^(\S+) respondió (\d+)$/, '$1 returned error $2'],
  [/^FilmAffinity \(Cloudflare\) ha bloqueado la búsqueda$/, 'FilmAffinity (Cloudflare) blocked the search'],
  [/^No encuentro la película en Letterboxd$/, 'Can’t find the movie on Letterboxd'],
  [/^No se pudo ejecutar el voto en Letterboxd$/, 'Couldn’t send the rating to Letterboxd'],
  [/^Letterboxd no dio el token para votar$/, 'Letterboxd didn’t provide a rating token'],
  [/^URL no válida$/, 'Invalid URL'],
  [/^La página no respondió a tiempo$/, 'The page didn’t respond in time'],
  [/^Se cerró la pestaña$/, 'The tab was closed'],
  [/^Sin pestaña$/, 'No tab'],
  [/^Sin respuesta$/, 'No response'],
  [/^Ya tenía esa nota$/, 'Already had that rating'],
  [/^No se abrió la ventana de votar$/, 'The rating window didn’t open'],
  [/^FilmAffinity no confirmó el voto$/, 'FilmAffinity didn’t confirm the rating'],
  [/^No encuentro el botón de calificar$/, 'Can’t find the rate button'],
  [/^No se abrió la ventana de calificar.*$/, 'The rating window didn’t open (signed in to IMDb?)'],
  [/^No se activó el botón «Calificar»$/, 'The “Rate” button didn’t activate'],
  [/^IMDb no confirmó el voto.*$/, 'IMDb didn’t confirm the rating (signed in?)'],
  [/^La extensión no tiene permiso.*$/, 'The app doesn’t have permission to access these sites'],
];
const tmsg = m => {
  if (!m || LANG === 'es') return m;
  for (const [re, en] of MSG_EN) if (re.test(m)) return m.replace(re, en);
  return m;
};

// Textos fijos de la página
document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = T(el.dataset.i18n); });
document.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = T(el.dataset.i18nPh); });
document.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', T(el.dataset.i18nAria)); });

let results = [];
let searchSeq = 0;

// ---------------------------------------------------------------- búsqueda
const INTRO = `<div class="msg">${T('intro')}</div>`;
main.innerHTML = INTRO;
// Al abrir, la caja de búsqueda está más abajo; sube en cuanto hay resultados o una ficha
const setHome = on => document.body.classList.toggle('home', on);

async function doSearch(q, { quiet = false } = {}) {
  const seq = ++searchSeq;
  if (!quiet) { main.className = ''; main.innerHTML = `<div class="msg">${T('searching')} ${DOTS}</div>`; }
  const r = await send({ type: 'searchImdb', q }).catch(e => ({ error: e.message }));
  if (seq !== searchSeq) return;          // ya se escribió otra cosa
  setHome(false);
  main.className = '';
  if (r.error) { main.innerHTML = `<div class="msg err">${esc(tmsg(r.error))}</div>`; return; }
  results = r.items || [];
  if (!results.length) { main.innerHTML = `<div class="msg">${T('noResults')}</div>`; return; }
  showList();
}

// Resultados mientras escribes (con una pequeña pausa para no buscar en cada letra)
let typingTimer = null;
$('#q').addEventListener('input', () => {
  clearTimeout(typingTimer);
  const q = $('#q').value.trim();
  if (q.length < 2) {
    ++searchSeq;
    if (!q) { results = []; main.className = ''; main.innerHTML = INTRO; setHome(true); }
    return;
  }
  typingTimer = setTimeout(() => doSearch(q, { quiet: results.length > 0 }), 300);
});

$('#f').addEventListener('submit', ev => {
  ev.preventDefault();
  clearTimeout(typingTimer);
  const q = $('#q').value.trim();
  if (!q) return;
  $('#q').blur();
  doSearch(q);
});

function showList() {
  main.className = '';
  main.innerHTML = results.map((it, i) => `
    <div class="item" data-i="${i}">
      ${poster(it.image)}
      <div>
        <div class="t">${esc(it.title)}</div>
        <div class="s">${esc([it.year, it.kind].filter(Boolean).join(' · '))}</div>
        <div class="s">${esc(it.cast || '')}</div>
      </div>
    </div>`).join('');
  main.querySelectorAll('.item').forEach(el =>
    el.addEventListener('click', () => showMovie(results[+el.dataset.i])));
  main.scrollTop = 0;
}

// ---------------------------------------------------------------- ficha y voto
// Puntitos animados de "cargando"
const DOTS = '<span class="dots"><i></i><i></i><i></i></span>';
const NAMES = { imdb: 'IMDb', fa: 'FilmAffinity', lb: 'Letterboxd' };

// Estado de sesión, consultado una vez y reutilizado (el menú lo refresca al abrirse)
let loginPromise = null, loginAt = 0;
const getLogins = (fresh = false) => {
  // Se vuelve a consultar si se pide o si han pasado más de 30 s (p. ej. al volver de iniciar sesión)
  if (!loginPromise || fresh || Date.now() - loginAt > 30000) {
    loginAt = Date.now();
    loginPromise = send({ type: 'loginStatus' }).catch(() => ({}));
  }
  return loginPromise;
};
addEventListener('pageshow', () => getLogins(true));
getLogins();

async function showMovie(it) {
  let rating = 0;
  let faChoice = null;
  main.className = 'dv';
  setHome(false);
  main.innerHTML = `<div class="msg">${T('checkingAccounts')} ${DOTS}</div>`;

  // Solo se muestran (y se vota en) las webs donde tienes sesión iniciada
  const st = await getLogins();
  const on = ['imdb', 'fa', 'lb'].filter(k => st[k] !== false);   // si no se pudo comprobar, se muestra igual
  if (!on.length) {
    main.innerHTML = `<button class="ghost" id="back">${T('back')}</button>
      <div class="msg">${T('noAccounts')}</div>`;
    $('#back').addEventListener('click', showList);
    return;
  }
  const has = k => on.includes(k);
  const where = on.length === 3 ? T('where3') : on.length === 2 ? T('where2') : T('where1', NAMES[on[0]]);

  main.innerHTML = `
    <button class="ghost" id="back">${T('back')}</button>
    <div class="detail">
      ${poster(it.image)}
      <div>
        <h2>${esc(it.title)}</h2>
        <div class="s">${esc([it.year, it.kind].filter(Boolean).join(' · '))}</div>
        <div class="s">${esc(it.cast || '')}</div>
      </div>
    </div>
    ${has('imdb') ? `<div class="site imdb"><div class="lbl">IMDb</div><div class="row">${thumb(it.image)}<div class="m">${esc(it.title)} (${esc(it.year || '?')})</div></div><div class="st" id="st-imdb"></div></div>` : ''}
    ${has('fa') ? `<div class="site fa"><div class="lbl">FilmAffinity</div><div class="m" id="fa-m">${T('findingMovie')} ${DOTS}</div><div class="st" id="st-fa"></div></div>` : ''}
    ${has('lb') ? `<div class="site lb"><div class="lbl">Letterboxd</div><div class="m" id="lb-m">${T('findingMovie')} ${DOTS}</div><div class="m"><span class="lbstars" id="lb-stars"></span></div><div class="st" id="st-lb"></div></div>` : ''}
    <h3>${T('yourRating')}</h3>
    <div class="grid">${[...Array(10)].map((_, i) => `<button data-n="${i + 1}">${i + 1}</button>`).join('')}</div>
    <button class="primary vote" id="vote" disabled>${T('pickRating')}</button>`;
  main.scrollTop = 0;

  $('#back').addEventListener('click', showList);
  const voteBtn = $('#vote');
  let voting = false;
  const refresh = () => {
    if (voting) return;
    const faMissing = has('fa') && !faChoice;
    voteBtn.disabled = !rating || faMissing;
    voteBtn.textContent = !rating ? T('pickRating')
      : faMissing ? T('faMissing')
      : T('rate', rating, where);
  };

  main.querySelectorAll('.grid button').forEach(b => b.addEventListener('click', () => {
    rating = +b.dataset.n;
    if (has('lb')) $('#lb-stars').textContent = '★'.repeat(Math.floor(rating / 2)) + (rating % 2 ? '½' : '');
    main.querySelectorAll('.grid button').forEach(x => x.classList.toggle('sel', x === b));
    refresh();
  }));

  // Letterboxd: la ficha se abre directamente con el código de IMDb (sin buscar por título)
  if (has('lb')) send({ type: 'lbInfo', id: it.id }).then(lb => {
    const el = $('#lb-m');
    if (!el) return;
    if (lb && lb.found) el.innerHTML = `<div class="row">${thumb(lb.image)}<div>${esc(lb.title)}</div></div>`;
    else if (lb && lb.found === false) el.innerHTML = `<span class="err">${T('notOnLb')}</span>`;
    else el.textContent = T('sameAsImdb');
  }, () => { const el = $('#lb-m'); if (el) el.textContent = T('sameAsImdb'); });

  // FilmAffinity: empareja por título y año
  if (has('fa')) {
    const movie = { title: it.title, original: it.title, year: it.year, kind: it.kind };
    const fa = await send({ type: 'findFa', movie }).catch(e => ({ error: e.message }));
    const faM = $('#fa-m');
    if (!faM) return;   // ya se salió de la ficha
    if (fa.error || !fa.candidates || !fa.candidates.length) {
      faM.innerHTML = `<span class="err">${esc(tmsg(fa.error) || T('notOnFa'))}</span>`;
    } else {
      const cands = fa.candidates.slice(0, 8);
      faChoice = fa.confident ? cands[0] : null;
      const label = c => `${c.title} (${c.year || '?'})${c.extra ? ' · ' + c.extra : ''}`;
      if (fa.confident) {
        faM.innerHTML = `<div class="row">${thumb(cands[0].image)}<div>${esc(label(cands[0]))}</div></div>`;
      } else {
        // Desplegable propio (con carátulas): cerrado muestra la elegida; al tocarlo se abre la lista
        faM.innerHTML = `${T('notSure')}
          <button class="dd" id="fa-dd"><span id="fa-cur">${T('pickMovie')}</span><span class="arrow">▾</span></button>
          <div class="choices" id="fa-list" hidden>${cands.map((c, i) => `<button class="choice" data-i="${i}">${thumb(c.image)}<span>${esc(label(c))}</span></button>`).join('')}</div>`;
        const dd = $('#fa-dd'), list = $('#fa-list');
        const toggle = open => { list.hidden = !open; dd.classList.toggle('open', open); };
        dd.addEventListener('click', () => toggle(list.hidden));
        faM.querySelectorAll('.choice').forEach(b => b.addEventListener('click', () => {
          faChoice = cands[+b.dataset.i];
          faM.querySelectorAll('.choice').forEach(x => x.classList.toggle('sel', x === b));
          $('#fa-cur').innerHTML = `<span class="row">${thumb(faChoice.image)}<span>${esc(label(faChoice))}</span></span>`;
          toggle(false);
          refresh();
        }));
      }
    }
  }
  refresh();

  voteBtn.addEventListener('click', async () => {
    voting = true;
    voteBtn.disabled = true;
    voteBtn.innerHTML = `${T('voting')} ${DOTS}`;
    const sites = on.map(k => ({ k, el: $(`#st-${k}`) }));
    sites.forEach(({ el }) => { el.className = 'st'; el.innerHTML = `${T('waiting')} ${DOTS}`; });
    const show = (el, r) => {
      el.className = 'st ' + (r && r.ok ? 'ok' : 'bad');
      el.textContent = r && r.ok ? `✔ ${tmsg(r.msg) || T('done')}` : `✖ ${tmsg(r && (r.msg || r.error)) || T('error')}`;
    };
    const urls = { imdb: it.url, fa: faChoice && faChoice.url, lb: `https://letterboxd.com/imdb/${it.id}/` };
    // Una después de otra: así solo hay una pestaña oculta a la vez
    for (const { k, el } of sites) {
      el.innerHTML = `${T('voting')} ${DOTS}`;
      show(el, await send({ type: 'startVote', site: k, url: urls[k], rating }).catch(e => ({ error: e.message })));
    }
    voting = false;
    refresh();
  });
}

// ---------------------------------------------------------------- menú lateral
const drawer = $('#drawer'), scrim = $('#scrim');
function setDrawer(open) {
  drawer.classList.toggle('open', open);
  drawer.setAttribute('aria-hidden', String(!open));
  scrim.hidden = !open;
  if (open) checkLogins();
}
$('#burger').addEventListener('click', () => setDrawer(true));
scrim.addEventListener('click', () => setDrawer(false));
$('#nv-search').addEventListener('click', () => { setDrawer(false); if (/^#signedin=/.test(location.hash)) {
  history.replaceState(null, '', location.pathname);
  setDrawer(true);
} else {
  $('#q').focus();
} });
// Abrir una cuenta: si no tenías sesión, la app vuelve sola aquí en cuanto la inicies
async function openAccount(site, url) {
  const st = await getLogins();
  if (st[site] !== true) await send({ type: 'watchLogin', site }).catch(() => {});
  location.href = url;
}
$('#nv-fa').addEventListener('click', () => openAccount('fa', 'https://www.filmaffinity.com/es/main.html'));
$('#nv-imdb').addEventListener('click', () => openAccount('imdb', 'https://www.imdb.com/'));
$('#nv-lb').addEventListener('click', () => openAccount('lb', 'https://letterboxd.com/'));
// Ko-fi: la app lo abre fuera, en el navegador del móvil
$('#nv-kofi').addEventListener('click', () => { location.href = 'https://ko-fi.com/onerate'; });


async function checkLogins() {
  const st = await getLogins(true);
  const put = (el, v) => {
    el.className = 'lg ' + (v === true ? 'on' : v === false ? 'off' : '');
    el.textContent = v === true ? T('signedIn') : v === false ? T('signedOut') : T('unknown');
  };
  put($('#lg-fa'), st.fa);
  put($('#lg-imdb'), st.imdb);
  put($('#lg-lb'), st.lb);
}

$('#q').focus();
