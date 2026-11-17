# Coastr

An original isometric theme-park and coaster builder for the browser, published on Toki:
https://playtoki.app/game/coastr (plays at https://coastr.playtoki.app/).

Plain JavaScript (ES modules) and one `<canvas>`. No framework, no dependencies, no build step.
`README.md` has the feature list and a file-by-file code map; this file holds what is not obvious
from reading the code.

## Run and check

```bash
python3 -m http.server 8000 --directory game
```

- There is no automated test suite in the repository. Verify changes by running the game.
- `world.js`, `coaster.js`, `guests.js`, `sim.js` and `data.js` never touch the DOM, so they can be
  imported in Node to build a park in code, call `tick(dt)` and inspect the result. Use this for
  balance and save/load checks.
- In the browser, `window.__coastr` exposes `S` (state), `ui`, `cam`, `startGame(mode, fresh)` and
  `at(x, y)` (screen position of a tile). Handy for driving the game from Playwright.
- Syntax check: `for f in game/js/*.js; do node --check $f; done`.

### Screen sizes that must keep working

The owner cares about this: the game has to look right and have no UI bugs on every size.
After any layout change, check at least these, in English and German (German labels are longer):

| Case | Size |
| --- | --- |
| Desktop / large monitor | 1280x760, 1920x1080 |
| Tablet | 820x1100 |
| Phone upright | 390x844, 360x740, 320x568 |
| Phone sideways | 844x390, 667x375 |
| Toki's small box on a phone | 390x291, 320x291 |

Things to assert: no control outside the viewport, top bar at most two rows, no text clipped in
buttons, top bar / tray / builder / panel not overlapping, every button reacts to a real tap.

## Publishing to Toki

`toki.json` at the repository root describes the game and points at the `game` folder. Follow
https://playtoki.app/agents.md.

```bash
curl -fsSL https://www.playtoki.app/toki-upload.mjs -o /tmp/toki-upload.mjs
```

```bash
TOKI_KEY="$TOKI_KEY" node /tmp/toki-upload.mjs .
```

- The upload key comes from the owner. Use it only as the `TOKI_KEY` environment variable. Never
  write it to a file or commit it.
- Bump `version` and rewrite `notes` (plain words for players) when there is something new; a new
  version posts an update on the game's page. `--dry-run` lists the files without uploading.
- Achievement ids in `toki.json` must match `ACHIEVEMENTS` in `data.js` and the `award()` calls in
  `sim.js`. Uploads add and update achievements but never delete them.
- High-score lists: the main list is park value, the `guests` list is the most guests at once
  (`sendScores` in `main.js`). Scores and achievements are career mode only.

### How Toki shows the game (this has caused real bugs)

- On a phone the game first appears in a **small box of about 390x291** points. The
  `(max-height: 480px) and (max-width: 560px)` rules in `style.css` are for this.
- In **fullscreen on a phone** Toki lays its own "Exit fullscreen" button over the game: 40x40,
  10 px from the top-right corner. Keep a 56x56 corner free of game controls. On phone layouts the
  first top row holds only numbers and every button sits in the second row; wider layouts get
  `.embedded #top { padding-right }`.
- Toki injects `toki-save.js` into the page. It mirrors all of `localStorage` to the player's
  account, provides `window.toki.score()` / `window.toki.achievement()`, and cancels `touchmove`
  outside scrollable elements. Keep saves small and keep scrollable areas as real
  `overflow: auto` elements.

## Conventions and gotchas

**Map and coordinates**
- Map size is `N` in `data.js` (60). Always index with `idx(x, y)`; never hardcode the size.
- Directions: 0 = +x, 1 = +y, 2 = -x, 3 = -y (`DX`/`DY`). Turning right is `d + 1`.
- Screen: `isoX = (x - y) * 32`, `isoY = (x + y) * 16 - z * 16`. Tiles are drawn back to front by
  `x + y`; a multi-tile ride is drawn when its front corner tile is reached; guests and train cars
  go into per-tile buckets so they sort with the scenery.
- Terrain is one height per tile (0..8). For coaster physics one level is 2 m and one tile is 4 m.

**State**
- All game state lives in the single mutable object `S` in `world.js`. Change it through the
  functions there, which return `{ ok }` or `{ ok: false, why: 'e_...' }`; `why` is an i18n key.
- Bump `S.pv` whenever paths, objects or open/closed states change. The guest path-finding cache
  and the "not next to a path" warnings depend on it.
- `events` (in `world.js`) queues things for the UI: goals, research, achievements, month end.

**Coasters**
- A coaster is a list of pieces; `recompute(c)` runs the physics pass and sets `c.sim`, `c.E`,
  `c.I`, `c.Q`. Ratings exist as soon as the circuit is closed; the test ride is only a visual.
- Edit tracks through `addPiece` / `undoPiece` / `autoFinish`, which also clear the cached drawing
  geometry (`piece.geo`) and re-register tiles in `S.trk`.

**Saves**
- `localStorage` keys: `coastr.save.career`, `coastr.save.sandbox`, `coastr.settings`.
- Save format is `v: 2` with `n` (map size). Saves without `n` are from the 40x40 map and are
  shifted to the front centre of the current map in `deserialize`. Players have real saves, so
  keep old ones loading when the format changes.
- A new field of `S` must be added to both `serialize` and the key list in `deserialize`.
  Derived data (`sim`, `geo`, `S.trk`, `S.gmap`) is rebuilt on load and not saved. Guests are not
  saved individually, only their number.

**Interface**
- Panels are built once and then updated through `data-k` / `data-w` attributes. Do not re-render
  a panel's `innerHTML` on every refresh: a tap that lands between mouse-down and mouse-up is lost.
- Clicks are handled by delegation on the containers (`#top`, `#tools`, `#tray`, `#panel`, ...).
- Touch: the canvas cancels `touchstart`/`touchend` so a tap on the map cannot turn into a click
  on a button that pops up under the finger, and bars and panels ignore taps for 350 ms after
  they appear. Path drawing by finger starts only once the finger moves or lifts, so a second
  finger can still pan or zoom.
- Rides, stalls and coaster stations are placed with a confirm bar on touch, directly on mouse.

**Text**
- Every string is in `i18n.js`, in English and German. Add both when adding text.
- German is standard German (no Swiss German), informal "du", and avoids words that need "ß".
- Format money and numbers with `money()` and `num()`.

**Art and sound**
- Everything is drawn in code (`sprites.js`, `render.js`); there are no image assets except the
  cover and screenshots. Sound and music are generated with Web Audio in `audio.js`.
- `cover.png` and `shots/*.png` were captured from the running game at 1280x720.

**Scope**
- Coastr is its own game. Keep names, art and content original rather than copying an existing
  commercial park game.
- The owner asked to keep management simple: no staff, breakdowns or litter.

## Git

- `main` is the published line. Do work on a feature branch and merge into `main`.
- Do not put model names in commits, code comments or pull requests.
