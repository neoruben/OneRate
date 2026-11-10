/* Ficha de IMDb: detecta tu voto y, si la abrió la extensión, vota. */
'use strict';

(async () => {
  const BAR = '[data-testid="hero-rating-bar__user-rating"]';

  // Nota actual (0 = sin votar). Hay dos barras (móvil/escritorio); vale la que tenga nota.
  const current = () => {
    for (const el of document.querySelectorAll(BAR)) {
      if (el.querySelector('[data-testid$="__unrated"]')) continue;
      const s = el.querySelector('[data-testid$="__score"]') || el.querySelector('button');
      const m = (s?.textContent || '').match(/\b(10|[1-9])\b/);
      if (m) return parseInt(m[1], 10);
    }
    return 0;
  };
  const rateButton = () => [...document.querySelectorAll(`${BAR} button`)].find(b => b.offsetParent !== null)
    || document.querySelector(`${BAR} button`);

  const info = () => {
    let ld = {};
    try { ld = JSON.parse(document.querySelector('script[type="application/ld+json"]')?.textContent || '{}'); } catch (e) { /* sin datos */ }
    const year = String(ld.datePublished || '').slice(0, 4) || (document.title.match(/\((?:[^)]*?)(\d{4})/) || [])[1] || '';
    const dirs = [].concat(ld.director || ld.creator || []).filter(d => d && d['@type'] === 'Person').map(d => d.name);
    return {
      title: ld.alternateName || ld.name || document.title.replace(/\s*\(.*$/, ''),
      original: ld.name || '',
      year, directors: dirs,
      kind: /series/i.test(ld['@type'] || '') ? 'serie' : 'película',
    };
  };

  let busy = false;

  // ---- modo destino
  const job = await VD.send({ type: 'getPending' }).catch(() => null);
  if (job && job.site === 'imdb') {
    busy = true;
    const n = job.rating;
    let result;
    try {
      const btn = await VD.waitFor(rateButton, 20000);
      if (!btn) throw new Error('No encuentro el botón de calificar');
      await VD.sleep(800);   // deja que IMDb cargue tu nota actual
      if (current() === n) {
        result = { ok: true, msg: 'Ya tenía esa nota' };
      } else {
        rateButton().click();
        const stars = await VD.waitFor(() => {
          const s = document.querySelectorAll('.ipc-starbar__rating__button');
          return s.length >= 10 ? s : null;
        }, 10000);
        if (!stars) throw new Error('No se abrió la ventana de calificar (¿sesión iniciada en IMDb?)');
        stars[n - 1].click();
        const submit = await VD.waitFor(() => {
          const s = document.querySelector('.ipc-rating-prompt__rate-button');
          return s && !s.disabled ? s : null;
        }, 5000);
        if (!submit) throw new Error('No se activó el botón «Calificar»');
        submit.click();
        const ok = await VD.waitFor(() => current() === n, 10000);
        result = ok ? { ok: true } : { ok: false, msg: 'IMDb no confirmó el voto (¿sesión iniciada?)' };
      }
    } catch (e) {
      result = { ok: false, msg: e.message };
    }
    await VD.send({ type: 'voteResult', ...result });
    busy = false;
  }

  // ---- modo origen: solo cuenta si has pulsado tú en la puntuación (IMDb carga tu nota con retraso)
  let touched = 0;
  document.addEventListener('click', ev => {
    if (!busy && ev.isTrusted && ev.target.closest && ev.target.closest(`${BAR}, .ipc-starbar, .ipc-rating-prompt__rate-button`)) touched = Date.now();
  }, true);

  await VD.sleep(1500);
  let last = current();
  let t;
  new MutationObserver(() => {
    clearTimeout(t);
    t = setTimeout(() => {
      const v = current();
      if (v === last) return;
      last = v;
      if (v && !busy && Date.now() - touched < 30000) {
        touched = 0;
        VD.offerVote({ rating: v, movie: info(), target: 'fa', targetName: 'FilmAffinity' });
      }
    }, 400);
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
})();
