# Changelog

All notable changes to **OneRate** are documented in this file.

## [1.0.9] - 2026-11-24

### Fixed
- Refocus the active `GeckoSession`, sync `WebExtensionController.setTabActive`, call `geckoView.requestFocus()`, and restart the Android IME (`InputMethodManager.restartInput`) when returning to `search.html`, switching/closing login popups, or resuming the activity. This prevents the keyboard from getting stuck after returning from external sign-in pages.
- Defer initial search box autofocus (`load` + `150 ms`) in `search.js` so it does not race with GeckoView cross-process focus transitions.
- Bumped built-in extension version in `manifest.json` to `1.8.4` so existing installations automatically reload updated extension assets without losing cookies/sessions.

## [1.0.8] - 2026-11-24

### Added
- **IMDb trivia card** in the movie detail view ("Did you know?" / "¿Sabías que…?") showing non-spoiler trivia facts in the device's language (Spanish on Spanish devices, falling back to English), dynamically clamped to fill available vertical space without causing scroll; tap the card to cycle through facts.
- **Single-row 1–10 rating bar** in the movie detail view to free up vertical space.
- Side-by-side `debug` build variant (`applicationIdSuffix = ".debug"`, `versionNameSuffix = "-debug"`) so test builds install alongside the signed release app without replacing it.
- Additional signing lookup path `../claves/keystore.properties` in `app/build.gradle.kts`.

### Changed
- Updated Ko-fi badge in `README.md` to the official SVG button.
- Bumped built-in extension version in `manifest.json` to `1.8.3`.

## [1.0.7] - 2026-11-15

### Changed
- New clapperboard launcher icon featuring the three site colours on a gradient background, also updated in the side drawer, README, and social preview.

## [1.0.6] - 2026-11-15

### Changed
- Updated app launcher and extension icons (intermediate icon update superseded by `v1.0.7`).

## [1.0.5] - 2026-11-15

### Added
- Site logos (CSS-only badges for IMDb, FilmAffinity, and Letterboxd) and coloured divider lines in each site's card on the rating screen.
- Updated combined README screenshots.

### Fixed
- Re-check FilmAffinity sign-in status once before treating the user as signed out, allowing FilmAffinity's "remember me" cookie renewal to succeed on the second request.

## [1.0.4] - 2026-11-14

### Added
- Support for signing release builds via a local `keystore.properties` file (never committed to git).
- Ko-fi sponsor link (`ko-fi.com/neoruben`) and `.github/FUNDING.yml`.

## [1.0.3] - 2026-11-14

### Improved
- Automatically select the FilmAffinity match when only a single candidate is returned and its release year fits (±1 year), avoiding an unnecessary dropdown.

## [1.0.2] - 2026-11-11

### Added
- Compact rating screen layout so the movie card, site rows, and rating controls fit on one screen with a sticky footer.
- GitHub source code link and app version display in the side drawer.

## [1.0.1] - 2026-11-11

### Added
- Display each site's average rating and vote count (IMDb `/10`, FilmAffinity `/10`, Letterboxd `/5`) directly inside the movie detail view.

## [1.0.0] - 2026-11-10

### Added
- Initial public release (`io.github.neoruben.onerate`): search via IMDb, automatic matching on FilmAffinity and Letterboxd, one-tap multi-site rating, side drawer with live sign-in status, automatic return after signing in, and English/Spanish localization.
