// Coastr rooms: a small relay that lets up to four players share one park.
// Runs as a Cloudflare Worker with one Durable Object per room (see server/README.md).
//
// The host's game runs the park; this relay only passes messages on. Each message is
// "<route>|<json>". Routes from a player: "h" = to the host, "a" = to everyone else,
// "c" = to all guests (host only), "<slot>" = to that player (host only), "n" = {name}: a new
// name for me. Everyone receives "<from slot>|<json>", or "s|<json>" for news from the relay:
//   hello {slot, players}   you are in; players = [{slot, name}] (you included)
//   join  {slot, name}      someone came in
//   leave {slot}            someone went
//   name  {slot, name}      someone changed their name (sent to everyone, them too)
//   end   {}                the host closed the room
//   err   {why}             taken | noroom | full | bad (the socket is then closed)

const MAX_PLAYERS = 4;
const MAX_MSG = 2_000_000;
const cleanName = (s) => String(s || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 16) || 'Player';

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/' || url.pathname === '/health') {
      return new Response('Coastr rooms\n', { headers: { 'content-type': 'text/plain' } });
    }
    const m = url.pathname.match(/^\/room\/([A-Za-z0-9]{4,8})$/);
    if (!m) return new Response('Not found\n', { status: 404 });
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket\n', { status: 426 });
    const code = m[1].toUpperCase();
    return env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(req);
  },
};

export class Room {
  constructor(state) {
    this.state = state;
  }

  /** Open sockets that belong to a player in this room. */
  players() {
    const out = [];
    for (const ws of this.state.getWebSockets()) {
      const a = ws.deserializeAttachment();
      if (a && a.slot !== undefined && ws.readyState === 1) out.push({ ws, slot: a.slot, name: a.name });
    }
    return out;
  }

  async fetch(req) {
    const url = new URL(req.url);
    const host = url.searchParams.get('role') === 'host';
    const name = cleanName(url.searchParams.get('name'));
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.state.acceptWebSocket(server);
    const answer = () => new Response(null, { status: 101, webSocket: client });
    const refuse = (why) => {
      server.send('s|' + JSON.stringify({ t: 'err', why }));
      server.close(4000, why);
      return answer();
    };

    const all = this.players();
    const hasHost = all.some((p) => p.slot === 0);
    let slot = 0;
    if (host) {
      if (hasHost) return refuse('taken');
    } else {
      if (!hasHost) return refuse('noroom');
      const used = new Set(all.map((p) => p.slot));
      slot = -1;
      for (let s = 1; s < MAX_PLAYERS; s++) if (!used.has(s)) { slot = s; break; }
      if (slot < 0) return refuse('full');
    }
    server.serializeAttachment({ slot, name });
    const list = [...all.map((p) => ({ slot: p.slot, name: p.name })), { slot, name }].sort((a, b) => a.slot - b.slot);
    server.send('s|' + JSON.stringify({ t: 'hello', slot, players: list }));
    const news = 's|' + JSON.stringify({ t: 'join', slot, name });
    for (const p of all) p.ws.send(news);
    return answer();
  }

  webSocketMessage(ws, msg) {
    const me = ws.deserializeAttachment();
    if (!me || me.slot === undefined || typeof msg !== 'string' || msg.length > MAX_MSG) return;
    const bar = msg.indexOf('|');
    if (bar < 1 || bar > 2) return;
    const route = msg.slice(0, bar), out = me.slot + msg.slice(bar);
    if (route === 'n') {
      let name;
      try { name = cleanName(JSON.parse(msg.slice(bar + 1)).name); } catch (e) { return; }
      ws.serializeAttachment({ slot: me.slot, name });
      const news = 's|' + JSON.stringify({ t: 'name', slot: me.slot, name });
      for (const p of this.players()) { try { p.ws.send(news); } catch (e) { /* ignore */ } }
      return;
    }
    const others = this.players().filter((p) => p.ws !== ws);
    let to;
    if (route === 'a') to = others;
    else if (route === 'h') to = others.filter((p) => p.slot === 0);
    else if (me.slot !== 0) return; // only the host talks to the guests directly
    else if (route === 'c') to = others;
    else to = others.filter((p) => String(p.slot) === route);
    for (const p of to) {
      try { p.ws.send(out); } catch (e) { /* that one is going away */ }
    }
  }

  webSocketClose(ws) { this.gone(ws); }
  webSocketError(ws) { this.gone(ws); }

  gone(ws) {
    const me = ws.deserializeAttachment();
    if (!me || me.slot === undefined) return;
    ws.serializeAttachment({}); // counted once
    const rest = this.players().filter((p) => p.ws !== ws);
    if (me.slot === 0) {
      const end = 's|' + JSON.stringify({ t: 'end' });
      for (const p of rest) {
        try { p.ws.send(end); p.ws.close(1000, 'end'); } catch (e) { /* ignore */ }
      }
    } else {
      const news = 's|' + JSON.stringify({ t: 'leave', slot: me.slot });
      for (const p of rest) {
        try { p.ws.send(news); } catch (e) { /* ignore */ }
      }
    }
    try { ws.close(1000, 'bye'); } catch (e) { /* already closed */ }
  }
}
