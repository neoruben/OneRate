/* Ficha de FilmAffinity (web normal y móvil m.filmaffinity.com): detecta tu voto y,
   si la abrió la extensión, vota. */
'use strict';

(async () => {
  const MOBILE = location.hostname.startsWith('m.');

  // ---- lectura de la nota y datos de la película (dos maquetas)
  const desk = {
    box: () => document.querySelector('.rate-movie-box'),
    current() {
      const v = parseInt(this.box()?.getAttribute('data-user-rating'), 10);
      return v >= 1 && v <= 10 ? v : 0;
    },
  };
  const mob = {
    current() {
      const el = document.querySelector('#wr-rat');
      if (!el || el.classList.contains('no-rate')) return 0;
      const v = parseInt(el.querySelector('.avgrat-box')?.textContent, 10);
      return v >= 1 && v <= 10 ? v : 0;
    },
  };
  const current = () => (MOBILE ? mob.current() : desk.current());

  const info = () => {
    let original = '';
    document.querySelectorAll('dt').forEach(dt => {
      if (!original && /t[ií]tulo original/i.test(dt.textContent)) {
        const dd = dt.nextElementSibling?.cloneNode(true);
        if (dd) { dd.querySelectorAll('.show-akas, .akas, ul').forEach(x => x.remove()); original = dd.textContent.trim(); }
      }
    });
    let year = '';
    for (const el of document.querySelectorAll('[itemprop="datePublished"]')) {
      const m = (el.getAttribute('content') || el.textContent || '').match(/^\s*(\d{4})\s*$/);
      if (m) { year = m[1]; break; }
    }
    const title = (document.querySelector('h1#main-title [itemprop="name"], .main-movie-title')?.textContent
      || document.querySelector('h1')?.textContent || '').trim();
    return {
      title, original, year,
      directors: [...new Set([...document.querySelectorAll('[itemprop="director"] [itemprop="name"]')].map(x => x.textContent.trim()))],
      kind: (document.querySelector('h1 .movie-type')?.textContent || '').trim(),
    };
  };

  // ---- votar (pestaña abierta por la extensión)
  async function voteDesktop(n) {
    const sel = await VD.waitFor(() => desk.box()?.querySelector('select'), 15000);
    if (!sel) throw new Error(desk.box() ? 'No has iniciado sesión en FilmAffinity' : 'No encuentro el cuadro de votar');
    sel.value = String(n);
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    let ok = await VD.waitFor(() => current() === n, 8000);
    if (!ok) {
      // Plan B: el selector de FilmAffinity (bootstrap-select) desde la propia página
      await VD.send({ type: 'faPageSelect', rating: n }).catch(() => null);
      ok = await VD.waitFor(() => current() === n, 8000);
    }
    return ok;
  }

  async function voteMobile(n) {
    const link = await VD.waitFor(() => document.querySelector('#wr-rat, #wr-rat-nolg'), 15000);
    if (!link || link.id === 'wr-rat-nolg') throw new Error('No has iniciado sesión en FilmAffinity');
    const option = () => document.querySelector(`#r-modal .rate-list .list-rat[data-rate-value="${n}"]`);
    if (!option()) link.click();                  // abre la ventana de votar (carga la lista)
    const opt = await VD.waitFor(option, 10000);
    if (!opt) throw new Error('No se abrió la ventana de votar');
    opt.click();
    return VD.waitFor(() => current() === n, 10000);
  }

  let busy = false;
  const job = await VD.send({ type: 'getPending' }).catch(() => null);
  if (job && job.site === 'fa') {
    busy = true;
    const n = job.rating;
    let result;
    try {
      await VD.sleep(500);
      if (current() === n) result = { ok: true, msg: 'Ya tenía esa nota' };
      else {
        const ok = MOBILE ? await voteMobile(n) : await voteDesktop(n);
        result = ok ? { ok: true } : { ok: false, msg: 'FilmAffinity no confirmó el voto' };
      }
    } catch (e) {
      result = { ok: false, msg: e.message };
    }
    await VD.send({ type: 'voteResult', ...result });
    busy = false;
  }

  // ---- votas tú aquí
  let last = current();
  const changed = () => {
    const v = current();
    if (v === last) return;
    last = v;
    if (v && !busy) VD.offerVote({ rating: v, movie: info(), target: 'imdb', targetName: 'IMDb' });
  };
  if (!MOBILE) {
    const b = desk.box();
    if (b) new MutationObserver(changed).observe(b, { attributes: true, attributeFilter: ['data-user-rating'] });
  } else {
    // En móvil FilmAffinity reescribe el recuadro de tu nota tras votar
    let t;
    new MutationObserver(() => { clearTimeout(t); t = setTimeout(changed, 400); })
      .observe(document.body, { childList: true, subtree: true, characterData: true });
  }
})();
