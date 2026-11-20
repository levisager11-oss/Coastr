# Coastr

An isometric theme-park builder for the browser: lay paths, place rides and stalls, and design
roller coasters piece by piece. Plays on desktop and phones, in English and German.

Play it on Toki: https://playtoki.app/game/coastr

## What is in the game

- **Coaster builder**: five coaster types (mini, wooden, steel, launch, hyper) with lift hills, gentle and
  steep slopes, tight and wide turns, banking, loops, corkscrews, boosters, brakes and an on-ride photo. You build by
  tapping arrows on the map at the end of the track (or with the arrow keys), and change a finished
  track by tapping one of its pieces. Ratings for excitement, intensity and nausea are worked out
  from the track itself the moment the circuit is closed; red dots show where a track is too rough.
  While building, a side view shows the track's height and the train's speed all the way round.
  Each coaster can be painted, run up to three trains, and have its train followed by the camera.
  Eight ready-made designs can be placed in one go, and your own designs can be saved and reused.
- **Log flume and park railway**, built with the same builder: boats in a water trough that need a lift
  to go up and splash down the drops, and a little steam train that runs by itself and carries guests
  from one platform to the next, as many as you build.
- **Four scenarios** on different maps and in different looks (meadow, lagoon, desert, snowy
  mountain), each with its own goals and three stars to earn, plus a **sandbox** on any map with
  everything unlocked.
- **Park management**: guests with hunger, thirst, energy and opinions; ride and ticket prices;
  loans, advertising and research. Events (holidays, heat waves, coaster fans, a critic, a TV crew, a
  food festival), rides that are the talk of the park when new and want renovating when old, and
  awards every year.
- **Staff**: guests drop litter and rides break down now and then. Handymen sweep, mechanics repair,
  entertainers cheer guests up; litter bins help. You only choose how many of each to employ.
- **Challenges**: optional tasks with a time limit and a reward, three on offer at a time.
- Paths cross water as bridges; queue lines in front of rides hold the waiting guests.
- An overview map and a list of all rides, one tap away.
- A 60 by 60 tile park with land shaping and water, 30 kinds of scenery, 20 flat rides and 11 stalls.
- **A living park**: day and night with lights, rain and snow, an evening firework show, guests who
  show what they think, queues you can see.
- Lines of path and whole areas of land are built with one drag, and the last step can be undone.
- **Play together**: open your park to up to three friends with a four-letter room code (or Toki's
  "Invite friends"). Everyone builds in the same park at once and sees where the others are
  pointing; each player keeps a copy of the park when the room closes.
- **Photo mode** hides the interface, switches between day and night and saves a picture of the park.
- A park can be **shared as a code**: a friend pastes it under "Your parks" and gets a sandbox copy.
- Saves automatically in the browser. Up to eight parks live side by side in "Your parks", each
  with a little map, its date, guests and cash; parks can be renamed, copied and deleted. On Toki, park value, peak guest
  count and challenges won go to three high-score lists and there are 25 achievements.

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
| `game/js/staff.js` | Staff: handymen, mechanics and entertainers, and repairs |
| `game/js/sim.js` | Time, ride cycles, money, research, goals and stars, challenges, breakdowns, weather, day and night |
| `game/js/render.js` | The frame: ground, depth sorting, guests, night lighting, overlays, overview map |
| `game/js/sprites.js` | Pictures of rides, stalls and scenery |
| `game/js/track.js` | Pictures of coaster tracks, stations and trains |
| `game/js/iso.js` | Shared isometric maths and colour helpers |
| `game/js/fx.js` | Particles, floating numbers, confetti, fireworks, rain and snow |
| `game/js/ui.js` | Toolbar, panels, coaster builder, mouse and touch input |
| `game/js/i18n.js` | All text, English and German |
| `game/js/audio.js` | Sound effects and music |
| `game/js/sync.js` | Playing together: what changed in the park, taking in other players' changes |
| `game/js/net.js` | Playing together: rooms, the connection to the relay, what is sent when |
| `server/rooms.js` | The room relay (a Cloudflare Worker); `server/README.md` says how to deploy it |
| `game/js/main.js` | Menu, scenario list and the list of saved parks, game loop, saves and stars, park codes, photos, Toki hooks |
