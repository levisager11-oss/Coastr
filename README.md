# Coastr

An isometric theme-park builder for the browser: lay paths, place rides and stalls, and design
roller coasters piece by piece. Plays on desktop and phones, in English and German.

Play it on Toki: https://playtoki.app/game/coastr

## What is in the game

- **Coaster builder**: three coaster types (mini, wooden, steel) with lift hills, gentle and steep
  slopes, banked turns, loops, boosters and brakes. Ratings for excitement, intensity and nausea are
  worked out from the track itself the moment the circuit is closed; a test ride is optional.
- **Park management**: guests with hunger, thirst, energy and opinions; ride and ticket prices;
  loans, advertising and research.
- **Career** with ten goals and unlockable rides, and a **sandbox** with everything unlocked.
- Land shaping and water, ten kinds of scenery, nine flat rides, five stalls.
- Saves automatically in the browser. On Toki, park value and peak guest count go to two
  high-score lists and there are 14 achievements.

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

## Code map

| File | What it does |
| --- | --- |
| `game/js/data.js` | Rides, stalls, scenery, coaster types, research, goals |
| `game/js/world.js` | Park state, building and removing things, saving |
| `game/js/coaster.js` | Track pieces, track geometry, physics and ratings |
| `game/js/guests.js` | Guest behaviour and path finding |
| `game/js/sim.js` | Time, ride cycles, money, research, goals |
| `game/js/render.js`, `sprites.js` | Isometric drawing |
| `game/js/ui.js` | Toolbar, panels, coaster builder, mouse and touch input |
| `game/js/i18n.js` | All text, English and German |
| `game/js/audio.js` | Sound effects and music |
| `game/js/main.js` | Menu, game loop, Toki hooks |
