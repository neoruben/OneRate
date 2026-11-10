# ⭐ OneRate

**Rate once, everywhere.** Puntúa una película **una sola vez** y la nota se guarda a la vez en **FilmAffinity**, **IMDb** y **Letterboxd**.

App para Android, gratuita y de código abierto.

> **App no oficial.** No está afiliada, patrocinada ni respaldada por FilmAffinity, IMDb ni Letterboxd. Los nombres de esos servicios son marcas de sus respectivos propietarios y se usan solo para indicar compatibilidad.

## Qué hace

- Buscador de películas y series con carátula, año y reparto (resultados mientras escribes).
- Encuentra la misma película en FilmAffinity (por título y año) y en Letterboxd (por su código de IMDb). Si hay dudas, te deja elegir.
- Eliges tu nota del 1 al 10 y la vota en las tres webs. En Letterboxd se convierte a estrellas (7 → ★★★½).
- Menú lateral con el estado de tu sesión en cada web.

## Instalación

1. Descarga el último `OneRate-x.y.z.apk` desde **[Releases](../../releases)**.
2. Ábrelo en el móvil. Android te pedirá permitir la instalación desde esa app (navegador o gestor de archivos): acéptalo.
3. Abre OneRate, toca **☰** e inicia sesión en FilmAffinity, IMDb y/o Letterboxd. Solo hace falta una vez.

Requiere Android 8.0 o superior (64 bits, ARM).

## Privacidad

- La app **no recoge ni envía datos** a ningún servidor propio. No hay anuncios ni analíticas.
- Tus sesiones (cookies) se guardan solo en tu móvil, dentro de la app.
- Los votos se envían directamente desde tu móvil a cada web, con tu propia cuenta.

## Aviso

La app automatiza en tu nombre acciones que harías a mano en cada web. Las condiciones de uso de esos servicios pueden no permitirlo: **úsala bajo tu responsabilidad**. Si alguna web cambia su diseño, la app puede dejar de votar en ella hasta que se actualice.

## Cómo funciona por dentro

- Navegador [GeckoView](https://mozilla.github.io/geckoview/) (el motor de Firefox) con una extensión integrada (`app/src/main/assets/votodoble/`).
- La extensión abre la ficha de la película en segundo plano en cada web y pone la nota igual que lo harías tú.

Para compilarla: abre el proyecto en Android Studio y pulsa **Run**.

## Apoya el proyecto

Si te resulta útil, puedes invitarme a un café: ☕ [ko-fi.com/onerate](https://ko-fi.com/onerate)

## Licencia

[MIT](LICENSE)
