# Coastr rooms

A small relay that lets up to four players share one park. It runs on Cloudflare as the Worker
`coastr-rooms` (one Durable Object per room) and answers at
`wss://coastr-rooms.levisager.workers.dev/room/<CODE>`. The game's side is `game/js/net.js`
(connection, rooms) and `game/js/sync.js` (what changes and how it is taken in).

The relay knows nothing about parks: it passes messages between the players of a room, tells
everyone who comes and goes, and closes the room when the host leaves. The protocol is described
at the top of `rooms.js`.

## Deploy

```bash
CF_ACCOUNT=<account id> CF_TOKEN=<API token with Workers rights> ./deploy.sh
```

The first upload creates the Durable Object class (migration `v1`); later uploads replace the
code and keep it. The game does not need to be uploaded again when only the relay changes, as
long as the protocol stays the same.

## Cost

Cloudflare's free plan is enough for a small game. A room keeps its Durable Object busy while
players are in it (the host sends the park's numbers once a second), and the free plan includes
about 13,000 GB-seconds a day, which is roughly 29 hours of rooms in use per day. Beyond that,
rooms stop opening until the next day, unless the account is on the paid Workers plan
($5 a month, which includes 400,000 GB-seconds).
