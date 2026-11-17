# Coastr

An isometric theme-park builder for the browser: lay paths, place rides and stalls, and design
roller coasters piece by piece. Plays on desktop and phones, in English and German.

Play it on Toki: https://playtoki.app/game/coastr

## What is in the game

- **Coaster builder**: four coaster types (mini, wooden, steel, launch) with lift hills, gentle and
  steep slopes, tight and wide turns, banking, loops, corkscrews, boosters and brakes. You build by
  tapping arrows on the map at the end of the track (or with the arrow keys). Ratings for excitement,
  intensity and nausea are worked out from the track itself the moment the circuit is closed; red dots
  show where a track is too rough. Each coaster can be painted and its train followed by the camera.
- **Four scenarios** on different maps and in different looks (meadow, lagoon, desert, snowy
  mountain), each with its own goals and three stars to earn, plus a **sandbox** on any map with
  everything unlocked.
- **Park management**: guests with hunger, thirst, energy and opinions; ride and ticket prices;
  loans, advertising and research.
- A 60 by 60 tile park with land shaping and water, 18 kinds of scenery, 15 flat rides and 8 stalls.
- **A living park**: day and night with lights, rain and snow, an evening firework show, guests who
  show what they think, queues you can see.
- Lines of path and whole areas of land are built with one drag, and the last step can be undone.
- Saves automatically in the browser, one park per scenario. On Toki, park value and peak guest
  count go to two high-score lists and there are 19 achievements.

## Run it locally

No build step. Serve the `game` folder with any static web server and open it:

```bash
python3 -m http.server 8000 --directory game
```

## Publish to Toki

`toki.json` at the repository root holds the game's details and points at the `game` folder.
With a Toki upload key in the `TOKI_KEY` environment variable (never commit the key):

```bash
curl -fsSL https://www.playtoki.app/toki-upload.mjs -o /tmp/toki-upload.mjs
```

```bash
node /tmp/toki-upload.mjs .
```

Bump `version` and `notes` in `toki.json` when there is something new for players.

## Working on it

`CLAUDE.md` has the conventions, the screen sizes to check and the things to know about how Toki
shows the game. There is no build step and no test suite; run the game to check a change.

## Code map

| File | What it does |
| --- | --- |
| `game/js/data.js` | Rides, stalls, scenery, coaster types, research, scenarios and their goals |
| `game/js/world.js` | Park state, map generation, building and removing things, undo, saving |
| `game/js/coaster.js` | Track pieces, track geometry, physics and ratings |
| `game/js/guests.js` | Guest behaviour and path finding |
| `game/js/sim.js` | Time, ride cycles, money, research, goals and stars, weather, day and night |
| `game/js/render.js`, `sprites.js` | Isometric drawing, themes, night lighting |
| `game/js/fx.js` | Particles, floating numbers, confetti, fireworks, rain and snow |
| `game/js/ui.js` | Toolbar, panels, coaster builder, mouse and touch input |
| `game/js/i18n.js` | All text, English and German |
| `game/js/audio.js` | Sound effects and music |
| `game/js/main.js` | Menu and scenario list, game loop, saves and stars, Toki hooks |
