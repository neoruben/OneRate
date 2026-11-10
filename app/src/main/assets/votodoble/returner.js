/* Vuelta automática a OneRate después de iniciar sesión.
   Si la app está esperando a que inicies sesión en esta web, en cuanto la sesión existe
   (lo comprueba el fondo por la cookie / la página) vuelve al buscador. */
'use strict';
(() => {
  const ext = globalThis.browser || globalThis.chrome;
  const host = location.hostname;
  const site = /(^|\.)imdb\.com$/.test(host) ? 'imdb'
    : /(^|\.)filmaffinity\.com$/.test(host) ? 'fa'
    : /(^|\.)letterboxd\.com$/.test(host) ? 'lb' : null;
  if (!site) return;

  let tries = 0, timer = null;
  const check = async () => {
    const r = await ext.runtime.sendMessage({ type: 'loginReturnCheck', site }).catch(() => null);
    if (r && r.go) {
      clearInterval(timer);
      location.replace(ext.runtime.getURL('search.html') + '#signedin=' + site);
    } else if (!r || !r.watching || ++tries > 40) {
      clearInterval(timer);               // no se está esperando ningún inicio de sesión aquí
    }
  };
  check();
  timer = setInterval(check, 3000);       // por si el login termina sin recargar la página
})();
