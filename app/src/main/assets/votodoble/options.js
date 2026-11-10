'use strict';
const api = globalThis.browser || globalThis.chrome;

const cb = document.getElementById('askFirst');
api.storage.local.get({ askFirst: true }).then(s => { cb.checked = s.askFirst; });
cb.addEventListener('change', () => api.storage.local.set({ askFirst: cb.checked }));

// Permisos de acceso a las webs (en Firefox hay que darlos a mano la primera vez)
const ORIGINS = api.runtime.getManifest().host_permissions;
const box = document.getElementById('perm');
async function showPerm() {
  const ok = await api.permissions.contains({ origins: ORIGINS });
  box.className = ok ? 'ok' : 'no';
  if (ok) {
    box.replaceChildren('✔ Tiene permiso para FilmAffinity e IMDb.');
    return;
  }
  const b = document.createElement('button');
  b.textContent = 'Dar permisos';
  b.onclick = async () => { await api.permissions.request({ origins: ORIGINS }); showPerm(); };
  box.replaceChildren('✘ Falta el permiso para acceder a FilmAffinity e IMDb: sin él no puede buscar ni votar.',
    document.createElement('br'), b);
}
showPerm();
