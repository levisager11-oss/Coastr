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
- `world.js`, `coaster.js`, `guests.js`, `staff.js`, `sim.js`, `data.js`, `sync.js` and `net.js` never touch the
  DOM, so they can be imported in Node to build a park in code, call `tick(dt)` and inspect the
  result. Use this for balance and save/load checks. Node 22 has `WebSocket`, so playing together
  can be tested against the real relay: run each player in its own `worker_threads` Worker (each
  gets its own copy of the modules and of `S`), call `hostRoom` / `joinRoom`, then `tick` and
  `netTick` on a timer.
- In the browser, `window.__coastr` exposes `S` (state), `ui`, `cam`, `look`, `net`, `room`, `hooks`, `startGame(mode, fresh, scenario)`
  and `at(x, y)` (screen position of a tile, as `[x, y]`). Handy for driving the game from Playwright.
  `mode` is `'career'` or `'sandbox'`; `scenario` is an id from `SCENARIOS` in `data.js`.
- To look at a single sprite, import `sprites.js` in the page and draw it on a canvas of your own.
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
- High-score lists: the main list is park value, the `guests` list is the most guests at once, the
  `challenges` list is the most challenges won in one park (`sendScores` in `main.js`). Scores and achievements come from the scenarios, never the sandbox.
  The three star achievements are sent from `noteStars` in `main.js`, not from `sim.js`.

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

## Playing together

Up to four players build in one park. The relay is `server/rooms.js`, a Cloudflare Worker with one
Durable Object per room, at `wss://coastr-rooms.levisager.workers.dev` (`RELAY` in `net.js`;
`server/README.md` says how to deploy it). It only passes messages on; it knows nothing of parks.

- The host's game runs the park as always. Every guest's game is a copy (`net.mirror`): it runs
  guests and rides for the picture, but `tick` skips money, days, research, goals, awards, weather
  and events there (`net.quiet` makes `earn` / `spend` do nothing while a mirror ticks). Its guests
  are only for show: it brings in as many as the host has (`net.hostGuests`).
- Changes go both ways as diffs (`sync.js`): `diff()` compares the park with what it looked like
  at the last look (tiles, objects as text, and the settings in `SETS`), `apply()` takes in another
  player's diff. A guest also sends the money it spent (`dc`, `dl`, `df`); the host adds it to its
  own. The host passes each guest's diff on to everyone, the sender included, so all games end up
  the same even when two players change one tile at once. A part of our own diff that we have
  changed again since is not taken back (`sent`).
- Litter (`S.lit`) is a tile layer like the others, but only the host's game drops it and sweeps it
  up; a guest's staff only look busy (`net.quiet`). Staff numbers (`S.staff`) are a setting in `SETS`.
  Challenges live in `S.ch`, which the host's game keeps (`HOST_KEYS`); a player chooses one by setting
  `S.chPick` (in `SETS`), and the host's game takes it up (`updateChallenges` in `sim.js`).
- So any new way of changing the park works in a shared park as long as it changes `S` (tiles,
  `S.objs`, a key in `SETS`) and the money through `spend` / `earn`. A new field on an object is
  shared by itself; add it to `SKIP` in `sync.js` if it only matters while the game runs, or the
  park is sent again every quarter of a second. A new setting of the park (like `fee`) goes in
  `SETS`; a new number the host's game keeps up to date goes in `HOST_KEYS`.
- Object ids: in a room every player takes ids with `id % 4 === slot` (`newId` in `world.js`), and
  undo only removes the player's own new objects. Never use `S.nextId++` directly.
- Coaster ratings count the scenery round the track at the time they are worked out, so two games
  can differ slightly: they are shared as they are (`RATING` in `sync.js`).
- What the host's game does that the others should hear about (goals, research, achievements,
  month and year end, park events) is passed on with the numbers once a second (`SHARE` in
  `net.js`). So achievements and stars reach every player, and every player's copy is saved under
  `coastr.save.m<host's park id>`, which counts for their stars too.
- Toki: `toki.room(code)` while in a room, `?room=CODE` joins at start, `toki.onHost` opens a room.
  `multiplayer` and `max_players` are set in `toki.json`.

## Conventions and gotchas

**Map and coordinates**
- Map size is `N` in `data.js` (60). Always index with `idx(x, y)`; never hardcode the size.
- Directions: 0 = +x, 1 = +y, 2 = -x, 3 = -y (`DX`/`DY`). Turning right is `d + 1`.
- Screen: `isoX = (x - y) * 32`, `isoY = (x + y) * 16 - z * 16`. Tiles are drawn back to front by
  `x + y`; guests and train cars go into per-tile buckets so they sort with the scenery. Rides
  bigger than one tile and coaster loops are drawn between two diagonals (`planLate` in
  `render.js`): after the last one holding anything behind them, before the first holding anything
  in front. Drawn at their front corner they would cover guests standing beside their front sides.
  Only beside the short end of a 3x1 ride does one tile have to wait for the ride (`lateWait`).
  Cars on a loop are drawn with it: far half, its cars, near half, its cars (`loopCars`).
- Terrain is one height per tile (0..8). For coaster physics one level is 2 m and one tile is 4 m.

**Scenarios**
- A scenario (`SCENARIOS` in `data.js`) is a map, a theme, starting money and a goal list; `stars`
  says how many finished goals give one, two and three stars. `meadows` is the original career:
  keep its goals and their order, because saved parks store only the index of the current goal.
- Maps are generated in `genTerrain` (`world.js`) from the `MAPS` table. Themes (colours of land,
  water, cliffs and the backdrop) are the `THEMES` table in `render.js`.
- Stars live in `localStorage` under `coastr.progress`, apart from the saved parks, so starting a
  park again or deleting one does not lose them. `starsOf` also looks at every saved career park.

**State**
- All game state lives in the single mutable object `S` in `world.js`. Change it through the
  functions there, which return `{ ok }` or `{ ok: false, why: 'e_...' }`; `why` is an i18n key.
- Bump `S.pv` whenever paths, objects or open/closed states change. The guest path-finding cache,
  the "not next to a path" warnings, the queue lines and the kept ground picture depend on it.
  Every new or loaded park starts `S.pv` and `S.tv` a million past the last park's, so a kept
  picture of one park is never taken for another (`freshCount` in `world.js`).
- `S.path` holds 0 (none), 1 (path) or 2 (queue line). A path on a water tile is a bridge: guests
  walk at `walkH(i)` (one level above the water's bed), so use `walkH` for anything about where
  feet are, not `S.h`.
- Events (`S.event`), the year's tally (`S.yr`), awards (`S.awards`) and each ride's birthday
  (`o.born`, used by `buzz()` in `guests.js`) are part of the saved state.
- Litter: `S.lit` holds 0 to 3 per path tile. It changes all the time, so it must never bump `S.pv`
  (that would redraw the ground and throw away the path-finding cache); the renderer draws it per tile
  each frame. `S.litter` is the total, counted once a second.
- Staff: `S.staff` is how many handymen (`clean`), mechanics (`mech`) and entertainers (`fun`) are
  employed. The people themselves are `S.crew`, made from those numbers by `syncCrew` (`staff.js`),
  never saved. They are drawn like guests (`crewKit` in `render.js`).
- A ride that has broken down has `o.broken` (the time it happened): nobody gets on, trains already out
  finish their run. A mechanic, the repair service (`repairNow`) or, with no mechanic employed, two
  months of waiting clear it. `rideUsable` stays true for a broken ride, so check `o.broken` as well.
- A park saved before there was staff gets a few people hired when it is loaded (`S.staffNew`), so
  it runs as it did; keep that when changing what litter and breakdowns cost.
- `events` (in `world.js`) queues things for the UI: goals, research, achievements, month end.

**Coasters and other tracked rides**
- The log flume and the park railway are entries of `COASTERS` too (`kind: 'flume'` / `'train'`), built,
  saved and shared like coasters: `o.kind` is `'coaster'` for all of them. Use `isCoaster(ctype)`
  wherever only real coasters should count (coaster goals, coaster achievements, `att.best`).
  A flume's boats are carried by the water (`flow`) and need a lift to go up; a railway keeps a steady
  speed (`powered`) and needs no lift. Flags on the type switch pieces off (`noChain`, `noBoost`,
  `noBrake`). `look` / `carLook` say which track and train drawing a type uses (`track.js`).
- A railway can have more platforms: `stop` pieces. `isPlat(p)` is true for station and stop pieces;
  `platforms(c)` lists them in track order and `accessTiles(o, plat)` gives one platform's path tiles.
  A waiting guest remembers its platform (`g.plat`). The train's stay at a stop is part of the timing
  (`sim.stops`, `DWELL` in `coaster.js`); there everyone gets off and whoever waits gets on
  (`updateTrains` in `sim.js`).
- A coaster is a list of pieces; `recompute(c)` runs the physics pass and sets `c.sim`, `c.E`,
  `c.I`, `c.Q`. Ratings exist as soon as the circuit is closed; the test ride is only a visual.
- Piece types: `station`, `s`, `l` / `r` (tight turns), `wl` / `wr` (wide turns over three tiles),
  `loop`, `cork`, `boost`, `brake`, `photo` (on-ride camera: riders may buy a picture), `stop`. A new
  type also has to go into `PIECES` in `sync.js`, or a friend's game refuses the track. A piece can cover several tiles: always use `pieceTiles` /
  `pieceCells` (`world.js`) and `pieceExit` (`coaster.js`) instead of assuming one tile.
- The renderer draws a multi-tile piece in parts, one per tile, so trains and scenery sort correctly
  (`parts` in `buildGeo`). Cached drawing geometry is rebuilt when `S.tv` changes (terrain or water).
- Slopes (`bend` / `heightAt` in `coaster.js`): where the slope changes, the bend is rounded over
  both pieces, so crests sit a little lower and dips a little higher than the built heights (at most
  `BEND_DEV`, less at the top and bottom of a hill). Heights go by distance over the ground, so a
  sloped turn meets a sloped straight without a kink. Loops and corkscrews keep their own shape and
  are level at both ends; a sloped piece next to one levels out over its own length. Drops for the
  ratings are counted from the built heights, not the rounded ones. A loop is a teardrop
  (`LOOP_SHAPE`), whose bend grows gently out of the flat. Each piece takes its end directions from
  the samples of the pieces either side, so both work out the same frame at a joint.
- In the builder, `ui.cands` holds the choices shown as round buttons on the map; `builderAct` is
  the one place every builder action goes through (buttons, map buttons and keys). `ui.pick` is the
  piece tapped for changing; `alterPiece` and `cutAfter` (`coaster.js`) do the work.
- A car's direction is blended between the track samples on either side (`dirAt` in `coaster.js`,
  used by `posAt`), so trains turn smoothly rather than in steps.
- The builder shows the track from the side (`drawGraph` in `ui.js`): height over distance above the
  ground, coloured by speed, with the lift, rough spots and a stall marked. It is drawn again only when
  `c.sim` changes, and hidden on screens under 600 px tall.
- Several trains: `c.trains` (1 to `maxTrains(c)`), each train out on the track is an entry
  `{ t, riders }` in `c.runs` (`updateTrains` in `sim.js`). `c.riders` is everyone on all of them.
  `c.runs` is not saved.
- A design is a whole track as a string of words, one per piece (`pieceWord`, `designOf`,
  `canPlaceDesign`, `placeDesign` in `coaster.js`). The ready-made ones are `DESIGNS` in `data.js`;
  each must close on flat ground, so re-check them (build one with `placeDesign` in Node) after any
  change to piece geometry. Saved ones live in `localStorage` under `coastr.designs`.
- No support (column, trestle bent, loop leg) stands on a tile with a path or scenery: the track spans
  it. A loop's legs step further out to the side to find free ground, or are left out.
  So a piece's cached drawing also depends on those tiles; `geoFresh` in `track.js` checks the
  tiles it looked at whenever `S.pv` changes.
- Track and train pictures are in `track.js`. Its geometry cache (`piece.geo`) must hold everything
  that can be worked out once; drawing a piece should be a handful of fills and strokes.
- Edit tracks through `addPiece` / `undoPiece` / `autoFinish`, which also clear the cached drawing
  geometry (`piece.geo`) and re-register tiles in `S.trk`.

**Saves**
- Every key starting with `coastr.save.` is one saved park; the main menu lists them all ("Your
  parks", at most `MAX_PARKS` = 8, newest first by the save's `at` time). New parks get
  `coastr.save.p<random>`. Older versions kept one park per scenario under `coastr.save.career`,
  `coastr.save.<scenario>` and `coastr.save.sandbox`; those keys are simply parks in the list, so
  nothing is migrated. The park being played is `curKey` in `main.js`; `progress.last.key` is the
  one "Continue" opens. A save that fails to load starts a new park in a new slot and is left alone.
- Other keys: `coastr.settings`, `coastr.progress`, `coastr.designs`.
- `S.name` is the player's name for the park ('' means "use the scenario's name", so it follows the
  language).
- Save format is `v: 2` with `n` (map size), `sc` (scenario) and `rle: 1` (map layers stored as
  run-length pairs). Saves without `n` are from the 40x40 map and are shifted to the front centre
  of the current map in `deserialize`; saves without `rle` have one character per tile; saves
  without `sc` are the original career. Players have real saves, so keep old ones loading when the
  format changes.
- Scenery codes are positions in the `SCENERY` array and are stored in saves: only ever add new
  scenery at the end. The build menu order is `SCENERY_ORDER`.
- Research progress is "the first project with something still locked" (`researchNext`), so the
  `RESEARCH` list can be reordered and extended without breaking saves.
- A park can be shared as a code (`parkCode` / `readCode` in `main.js`): the save as JSON, packed with
  `deflate-raw` and written in base64, after the prefix `COASTR1`. A park loaded from a code always
  becomes a sandbox park, so codes cannot be used to pass on stars, scores or achievements.
- A new field of `S` must be added to both `serialize` and the key list in `deserialize`.
  Derived data (`sim`, `geo`, `S.trk`, `S.gmap`) is rebuilt on load and not saved. Guests are not
  saved individually, only their number.

**Interface**
- Panels are built once and then updated through `data-k` / `data-w` attributes. Do not re-render
  a panel's `innerHTML` on every refresh: a tap that lands between mouse-down and mouse-up is lost.
- Clicks are handled by delegation on the containers (`#top`, `#tools`, `#tray`, `#panel`, ...).
- Touch: the canvas cancels `touchstart`/`touchend` so a tap on the map cannot turn into a click
  on a button that pops up under the finger, and bars and panels ignore taps for 350 ms after
  they appear. One finger always moves the map; a tap builds one tile and leaves a white grip on
  it (`ui.handle`), and a drag that starts on the grip draws a line or an area. With a mouse, a
  drag draws the line or area directly.
- Paths, scenery, land and removing are "area tools" (`AREA_TOOLS` in `ui.js`): `canAt` says what
  one tile would cost, `applyArea` does the work and records one undo step (`snapshot` / `restore`
  in `world.js`).
- Rides, stalls and coaster stations are placed with a confirm bar on touch, directly on mouse.
- Goals, the park's map and lists, the staff and the challenges are four tabs of one panel (`HUB` in
  `ui.js`; panel types `goals`, `park`, `staff`, `tasks`). Put new park-wide screens there rather than
  adding buttons to the top bar.
- Photo mode (`setPhoto`): `ui.photo` hides everything but `#photobar` and the overlays, `look.dark`
  forces day or night for the picture. The bar sits at the bottom, clear of Toki's fullscreen button.
- In a shared park the top bar shows a pill with a dot per player (`#st-room`, opens the room
  panel); on phone layouts it takes the date's place in the first row. Other players' markers are
  drawn in `drawOverlays`.

**Text**
- Every string is in `i18n.js`, in English and German. Add both when adding text.
- German is standard German (no Swiss German), informal "du", and avoids words that need "ß".
- Format money and numbers with `money()` and `num()`.

**Art and sound**
- Everything is drawn in code (`sprites.js`, `render.js`); there are no image assets except the
  cover and screenshots. Sound and music are generated with Web Audio in `audio.js`.
- Light comes from the upper left: tops lightest, left faces mid, right faces darkest. Night is one
  dark multiply layer over the finished picture with glow sprites added on top; sprites only make
  their bulbs and windows brighter (`setNight`). Things that must stay readable at night (build
  previews, badges, map buttons) are drawn after that layer, in `drawOverlays`.
- Sprites and tiles run every frame for everything on screen: no `shadowBlur`, no `filter`, no
  per-frame canvas creation, and no gradients in scenery.
- Speed (`render.js`, `main.js`): the backdrop and all ground tiles are drawn once into a picture
  a quarter larger than the screen (`drawGround`) and copied each frame; it is redrawn when the
  camera leaves it, the zoom settles, or `S.tv` / `S.pv` change. Only tiles marked in `occl` (higher
  than ground just behind them; a bridge counts as its deck, `walkH`) are drawn again in order, so
  they can still hide things. Anything in `drawTile` that moves must cope with `time < 0`, which
  means "for the kept picture". In the kept picture each face is also traced in its own colour one
  device pixel wide (`seal`) to close the hairlines between tiles, and the sea's surf is drawn after
  all tiles. The backdrop is fixed to the world, so the kept picture and direct drawing match.
  While the camera moves, the next picture is started early, centred further along, and drawn eight
  rows of tiles per frame (`startGround` / `stepGround`, each slice made to paint at once by `settle`)
  so it is ready before it is needed; a change to the park still redraws it in one go.
  `look.ground = false` switches the picture off for comparing. `look.q` (0 to 3) lowers the
  drawing resolution and drops small details; `tuneQuality` in `main.js` sets it from measured
  frame times unless `look.auto` is false (down when about one frame in four is late, up again only
  after a long smooth spell, waiting longer after each try that failed). Set `look.auto = false` in tests that compare pictures.
- The world is placed on whole device pixels (`px` in `render.js`: device = world * `px.a` + `px.e`).
  Ready-made pictures made at exactly that scale are copied pixel for pixel (`blit`); a copy that is
  off by a fraction of a pixel or scaled is several times slower (measured: slower than drawing a
  tree's shapes). Pictures made this way: still scenery (`stampScenery`, lamps lit and unlit), guests
  (`guestPics`, per look and a few poses), and every part of every coaster track (`paintPart` in
  `track.js`, a few per frame, within `PIC_BUDGET` pixels, freed when long off screen; their corner
  sits on a whole device pixel so neighbouring pieces line up exactly). Still scenery has four looks
  per kind (`stampHash`), also when drawn as shapes, so nothing changes at the switch. They are
  made again when the zoom settles; while zooming the old ones are stretched. Close up (scale above 3)
  everything is drawn as shapes. `look.pics = false` switches the track and guest pictures off.
- Track paths are `BPath` (a `Path2D` that records its bounds) so a part knows its picture's size.
  Anything that changes how a piece looks must clear `piece.geo` (colour changes already do).
- Rides and stalls are still drawn as shapes every frame because they move; they are now the
  largest part of a frame.
- Tried and dropped: keeping each ride as its own picture refreshed every few frames. Uploading the
  changed pictures cost more than drawing the rides.
- `cover.png` and `shots/*.png` were captured from the running game at 1280x720.

**Scope**
- Coastr is its own game. Keep names, art and content original rather than copying an existing
  commercial park game.
- The owner asked to keep management simple. Staff, litter and breakdowns exist since 3.0, on purpose
  in their simplest form: the player only chooses how many of each kind to employ. No patrol areas,
  no orders, no per-person screens.

## Git

- `main` is the published line. Do work on a feature branch and merge into `main`.
- Do not put model names in commits, code comments or pull requests.
