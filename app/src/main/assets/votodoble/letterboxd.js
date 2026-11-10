/* Letterboxd: cuando la extensión abre la ficha para votar, pide al fondo que envíe la nota. */
'use strict';
(async () => {
  const job = await VD.send({ type: 'getPending' }).catch(() => null);
  if (!job || job.site !== 'lb') return;
  await VD.sleep(500);
  const r = await VD.send({ type: 'lbRate', rating: job.rating }).catch(e => ({ ok: false, msg: e.message }));
  await VD.send({ type: 'voteResult', ...(r || { ok: false, msg: 'Sin respuesta' }) });
})();
