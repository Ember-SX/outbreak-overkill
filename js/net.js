/*
 * Net: a thin wrapper around PeerJS (js/vendor/peerjs.min.js) for 2-player co-op.
 *
 * Players find each other through a PeerJS signalling server using a 3-digit room code
 * (room 427 = peer id "outbreak-overkill-v1-427"). After the handshake, game data flows
 * between the two browsers over a WebRTC data channel.
 *
 * Getting through firewalls
 * -------------------------
 * A direct browser-to-browser link fails when either side sits behind a strict firewall or
 * symmetric NAT (offices, schools, some mobile carriers). WebRTC then needs a TURN relay that
 * both browsers can reach. We offer several, in this order:
 *   1. your own relay, if set in Co-op > Connection settings (or ?turn=...&turnuser=...&turnpass=...)
 *   2. the free Open Relay servers on ports 80 and 443 over UDP, TCP and TLS. Ports 80 and 443
 *      are almost never blocked, so this is what gets through strict firewalls
 *   3. the PeerJS project's own relays (port 3478)
 * The joiner first tries every route at once. If no link opens, it retries once over relays
 * only, then gives up with advice.
 *
 * Signalling (matchmaking) is only needed to set up the link. If the host loses the signalling
 * server, it reconnects under the same room code. An open game link is not affected.
 *
 * URL options:
 *   ?peer=host:port        use your own PeerJS signalling server (e.g. `npm run peer` -> localhost:9000)
 *   ?turn=turn:host:port   extra TURN relay (with &turnuser= and &turnpass=), or an https URL that
 *                          returns ICE servers as JSON (e.g. a Metered credentials URL)
 *   ?relays=off            don't add the built-in public relays (testing)
 *   ?ice=relay             relay-only from the first attempt (testing)
 */
(function (OO) {
  'use strict';

  const SETTINGS_KEY = 'oo.relay';
  const HELP = 'If one of you is on a work, school or public network, try another network (a phone hotspot works), or add your own relay server under Connection settings.';

  const ERRORS = {
    'browser-incompatible': "This browser can't make peer-to-peer connections. Try a current Chrome, Edge, Firefox or Safari.",
    network: "Couldn't reach the matchmaking server. Check your internet connection and try again. (Embedded previews can't go online; open the full game, e.g. from GitHub Pages.)",
    'server-error': "The matchmaking server didn't respond. Try again in a moment.",
    'socket-error': "Lost contact with the matchmaking server. Try again in a moment.",
    'socket-closed': "Lost contact with the matchmaking server. Try again in a moment.",
    'ssl-unavailable': 'The matchmaking server needs a secure (https) page.',
    webrtc: 'The connection to your partner failed. ' + HELP,
    'negotiation-failed': 'The connection to your partner failed. ' + HELP,
  };
  const SIGNAL_ERRORS = new Set(['network', 'server-error', 'socket-error', 'socket-closed', 'disconnected']);

  // Public relays. Open Relay's "static auth" uses the standard TURN REST scheme: the username
  // is "<expiry>:<name>" and the password is base64(HMAC-SHA1(shared secret, username)).
  // The secret is published by Metered for public use: https://www.metered.ca/tools/openrelay/
  const OPEN_RELAY = {
    host: 'staticauth.openrelay.metered.ca',
    secret: 'openrelayprojectsecret',
  };
  const PEERJS_RELAY = {
    urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'],
    username: 'peerjs', credential: 'peerjsp',
  };
  const STUN = { urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] };

  function param(name) {
    try { return new URLSearchParams(window.location.search).get(name); } catch (e) { return null; }
  }

  async function hmacSha1Base64(secret, text) {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
    const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(text)));
    let s = '';
    for (const b of sig) s += String.fromCharCode(b);
    return btoa(s);
  }

  async function openRelayServer() {
    if (!(window.crypto && crypto.subtle)) return null;   // needs a secure page (https, localhost, file)
    try {
      const username = (Math.floor(Date.now() / 1000) + 24 * 3600) + ':outbreak-overkill';
      const credential = await hmacSha1Base64(OPEN_RELAY.secret, username);
      const h = OPEN_RELAY.host;
      return {
        urls: [`turn:${h}:80`, `turn:${h}:80?transport=tcp`, `turn:${h}:443`, `turns:${h}:443?transport=tcp`],
        username, credential,
      };
    } catch (e) { return null; }
  }

  /** Accepts the shapes TURN providers return: [servers], {iceServers: [servers]}, or one server. */
  function normaliseServers(json) {
    const list = Array.isArray(json) ? json : json && Array.isArray(json.iceServers) ? json.iceServers : json && json.urls ? [json] : [];
    return list.filter((s) => s && (typeof s.urls === 'string' || Array.isArray(s.urls)));
  }

  async function customServers() {
    const set = Net.relaySettings();
    const server = (param('turn') || set.server || '').trim();
    if (!server) return [];
    if (/^https?:\/\//i.test(server)) {
      // A credentials endpoint (Metered, Twilio-style proxies...) that returns ICE servers as JSON.
      try {
        const ctl = typeof AbortController === 'function' ? new AbortController() : null;
        const timer = setTimeout(() => ctl && ctl.abort(), 5000);
        const res = await fetch(server, ctl ? { signal: ctl.signal } : {});
        clearTimeout(timer);
        return normaliseServers(await res.json());
      } catch (e) {
        console.warn('Relay credentials URL failed:', e);
        return [];
      }
    }
    const urls = server.split(/[\s,]+/).filter(Boolean);
    const out = { urls };
    const username = param('turnuser') || set.username;
    const credential = param('turnpass') || set.credential;
    if (username) out.username = username;
    if (credential) out.credential = credential;
    return [out];
  }

  class Net {
    /**
     * handlers:
     *   onHosting(code)       host: the room is open
     *   onIncoming()          host: someone is dialling in (link not open yet)
     *   onConnected()         the game link is open (both roles)
     *   onLinkFailed(text)    host: a joiner's link never opened (the room stays open)
     *   onMessage(msg)
     *   onDisconnected()      an open link closed
     *   onStatus(text)        progress text for the lobby ('' clears it)
     *   onError(text)         fatal: the session is closed
     */
    constructor(handlers) {
      this.h = handlers;
      this.peer = null;
      this.conn = null;
      this.code = null;
      this.role = null;
      this.closed = false;
      this.hosting = false;
      this.link = null;        // 'direct' | 'relay' once known
      this.timers = new Set();
    }

    static available() {
      return typeof window.Peer === 'function' && typeof window.RTCPeerConnection === 'function';
    }

    /** Saved relay settings: { server, username, credential }. */
    static relaySettings() {
      const s = OO.U.storage.get(SETTINGS_KEY, null);
      return s && typeof s === 'object' ? s : {};
    }

    static saveRelaySettings(s) {
      OO.U.storage.set(SETTINGS_KEY, {
        server: String(s.server || '').trim(), username: String(s.username || '').trim(), credential: String(s.credential || ''),
      });
    }

    /** The ICE server list: your relay first, then STUN, then the public relays. */
    static async iceServers() {
      const list = await customServers();
      list.push(STUN);
      if (param('relays') !== 'off') {
        const open = await openRelayServer();
        if (open) list.push(open);
        list.push(PEERJS_RELAY);
      }
      return list;
    }

    static async options() {
      const opts = {
        debug: 1,
        pingInterval: 4000,
        config: { iceServers: await Net.iceServers(), sdpSemantics: 'unified-plan' },
      };
      if (param('ice') === 'relay') opts.config.iceTransportPolicy = 'relay';
      const q = param('peer');
      if (q) {
        const m = q.match(/^([^:/]+)(?::(\d+))?(\/.*)?$/);
        if (m) {
          opts.host = m[1];
          opts.port = Number(m[2] || 443);
          opts.path = m[3] || '/';
          opts.secure = opts.port === 443;
        }
      }
      return opts;
    }

    static peerId(code) { return OO.CONFIG.COOP.peerPrefix + code; }

    static randomCode() { return String(Math.floor(Math.random() * 1000)).padStart(3, '0'); }

    later(fn, ms) {
      const id = setTimeout(() => { this.timers.delete(id); if (!this.closed) fn(); }, ms);
      this.timers.add(id);
      return id;
    }

    cancel(id) { if (id) { clearTimeout(id); this.timers.delete(id); } }

    status(text) { if (!this.closed && this.h.onStatus) this.h.onStatus(text); }

    // ------------------------------------------------------------ host
    /** Open a room with a free 3-digit code. Retries a few codes if one is taken. */
    async host(tries = 6, signalTries = 3) {
      this.role = 'host';
      const opts = await Net.options();
      if (this.closed) return;
      const code = Net.randomCode();
      const peer = new window.Peer(Net.peerId(code), opts);
      this.peer = peer;
      peer.on('open', () => {
        if (this.closed || peer !== this.peer) return;
        this.signalTries = 0;
        if (!this.hosting) { this.hosting = true; this.code = code; this.h.onHosting(code); }
        else this.status('');
      });
      peer.on('connection', (conn) => this.incoming(conn));
      peer.on('disconnected', () => this.resignal(peer));
      peer.on('error', (err) => {
        if (this.closed || peer !== this.peer) return;
        const type = err.type;
        if (type === 'unavailable-id' && !this.hosting) {
          peer.destroy();
          if (tries > 1) this.host(tries - 1, signalTries); else this.fail('All the room codes we tried are busy. Try again.');
          return;
        }
        if (type === 'unavailable-id') { this.fail('Someone else took room ' + this.code + ' while the connection was down. Open a new room.'); return; }
        if (SIGNAL_ERRORS.has(type)) {
          if (this.hosting) { this.resignal(peer); return; }
          if (signalTries > 1) {
            peer.destroy();
            this.status('Matchmaking server is slow, retrying…');
            this.later(() => this.host(tries, signalTries - 1), 1500);
            return;
          }
        }
        if (this.hosting && (type === 'webrtc' || type === 'negotiation-failed')) return;   // a joiner's link; handled per connection
        this.fail(ERRORS[type] || 'Connection error: ' + (type || err.message));
      });
    }

    /** Host: a joiner is dialling in. */
    incoming(conn) {
      if (this.closed) return;
      const cur = this.conn;
      if (cur && cur.open && cur.peer !== conn.peer) {
        // Room is full: tell the third player politely, then hang up.
        conn.on('open', () => { try { conn.send({ t: 'full' }); } catch (e) { /* ignore */ } setTimeout(() => conn.close(), 500); });
        return;
      }
      // A link that never opened (or the same joiner retrying) is replaced by the new attempt.
      if (cur) { this.conn = null; try { cur.close(); } catch (e) { /* ignore */ } }
      this.attach(conn);
      this.h.onIncoming();
      this.cancel(this.pendingTimer);
      this.pendingTimer = this.later(() => {
        if (this.conn === conn && !conn.open) this.linkFailed(conn);
      }, 30000);
    }

    /** Lost the signalling server: reconnect with the same id so the room code keeps working. */
    resignal(peer) {
      if (this.closed || peer !== this.peer || peer.destroyed || this.resignalTimer) return;
      this.signalTries = (this.signalTries || 0) + 1;
      if (this.signalTries > 12) {
        if (this.connected) { this.status('Matchmaking server unreachable. Your game link still works.'); return; }
        this.fail(ERRORS.network);
        return;
      }
      if (!this.connected) this.status('Reconnecting to the matchmaking server…');
      const wait = Math.min(8000, 500 * 2 ** (this.signalTries - 1));
      this.resignalTimer = this.later(() => {
        this.resignalTimer = null;
        if (peer.destroyed || !peer.disconnected) return;
        try { peer.reconnect(); } catch (e) { /* the next 'disconnected' or error retries */ }
        // reconnect() can fail silently; check back.
        this.later(() => { if (peer.disconnected && !peer.destroyed) this.resignal(peer); }, 4000);
      }, wait);
    }

    // ------------------------------------------------------------ join
    /** Join someone else's room by its 3-digit code. */
    async join(code) {
      this.role = 'client';
      this.code = code;
      this.attempt = 0;
      this.missing = 0;
      this.relayOnly = param('ice') === 'relay';
      const opts = await Net.options();
      if (this.closed) return;
      this.baseConfig = opts.config;
      const peer = new window.Peer(opts);
      this.peer = peer;
      peer.on('open', () => {
        if (this.closed) return;
        this.signalled = true;
        this.signalTries = 0;
        if (!this.conn) this.dial();
      });
      peer.on('disconnected', () => this.resignal(peer));
      peer.on('error', (err) => {
        if (this.closed) return;
        const type = err.type;
        if (type === 'peer-unavailable') {
          // The room may be between signalling reconnects, or the host is still opening it.
          if (this.connected) return;
          this.missing++;
          this.dropConn();
          if (this.missing < 3) {
            this.status('Looking for room ' + code + '… (try ' + (this.missing + 1) + ' of 3)');
            this.cancel(this.dialTimer);
            this.dialTimer = this.later(() => this.dial(true), 1500);
            return;
          }
          this.fail('There is no room ' + code + '. Check the code with your host, and that their room screen is still open.');
          return;
        }
        if (SIGNAL_ERRORS.has(type)) {
          if (this.connected) return;      // the game link doesn't need the signalling server
          if (this.signalled) { this.resignal(peer); return; }
        }
        if (type === 'webrtc' || type === 'negotiation-failed') { if (this.conn && !this.conn.open) this.linkFailed(this.conn); return; }
        this.fail(ERRORS[type] || 'Connection error: ' + (type || err.message));
      });
    }

    /** Joiner: one connection attempt. The second attempt only uses relays. */
    dial(sameAttempt) {
      if (this.closed || !this.peer || this.peer.destroyed) return;
      if (this.peer.disconnected) { this.resignal(this.peer); return; }
      if (!sameAttempt) this.attempt++;
      const relay = this.relayOnly || this.attempt >= 2;
      // PeerJS reads peer.options.config when it creates each RTCPeerConnection.
      this.peer.options.config = Object.assign({}, this.baseConfig, relay ? { iceTransportPolicy: 'relay' } : {});
      this.status(this.attempt >= 2 ? 'Direct route blocked. Trying through a relay server…' : 'Connecting to room ' + this.code + '…');
      const conn = this.peer.connect(Net.peerId(this.code), { reliable: true, metadata: { attempt: this.attempt } });
      this.attach(conn);
      this.cancel(this.dialTimer);
      this.dialTimer = this.later(() => {
        if (this.conn === conn && !conn.open) this.linkFailed(conn);
      }, this.attempt >= 2 ? 16000 : 10000);
    }

    dropConn() {
      const c = this.conn;
      this.conn = null;
      if (c) { try { c.close(); } catch (e) { /* ignore */ } }
    }

    /** A link that never opened. Joiner: retry over relays once, then give up. Host: keep the room open. */
    linkFailed(conn) {
      if (this.closed || conn !== this.conn) return;
      this.dropConn();
      if (this.role === 'host') {
        this.h.onLinkFailed('Someone tried to join, but the connection could not get through. ' + HELP);
        return;
      }
      if (this.attempt < 2 && !this.relayOnly) { this.dial(); return; }
      this.fail('Found room ' + this.code + ', but the connection could not get through. ' + HELP);
    }

    // ------------------------------------------------------------ shared
    attach(conn) {
      this.conn = conn;
      conn.on('open', () => {
        if (this.closed || this.conn !== conn) return;
        this.cancel(this.dialTimer); this.cancel(this.pendingTimer);
        this.link = null;
        this.status('');
        this.h.onConnected();
        Net.linkType(conn).then((t) => { if (t && this.conn === conn) { this.link = t; this.status(''); } });
      });
      conn.on('data', (d) => { if (!this.closed && this.conn === conn) this.h.onMessage(d); });
      conn.on('iceStateChanged', (s) => { if (s === 'failed' && this.conn === conn && !conn.open) this.linkFailed(conn); });
      conn.on('close', () => {
        if (this.conn !== conn || this.closed) return;
        if (!conn.open && !conn._wasOpen) { this.linkFailed(conn); return; }
        this.conn = null;
        this.link = null;
        this.h.onDisconnected();
      });
      conn.on('open', () => { conn._wasOpen = true; });
      conn.on('error', () => { /* 'close' follows */ });
    }

    /** 'relay' if the open link goes through a TURN server, else 'direct'. */
    static async linkType(conn) {
      const pc = conn && conn.peerConnection;
      if (!pc || !pc.getStats) return null;
      try {
        const stats = await pc.getStats();
        let pair = null;
        stats.forEach((r) => { if (r.type === 'transport' && r.selectedCandidatePairId) pair = stats.get(r.selectedCandidatePairId); });
        if (!pair) stats.forEach((r) => { if (r.type === 'candidate-pair' && r.state === 'succeeded' && (r.nominated || r.selected)) pair = r; });
        if (!pair) return null;
        const lc = stats.get(pair.localCandidateId), rc = stats.get(pair.remoteCandidateId);
        return (lc && lc.candidateType === 'relay') || (rc && rc.candidateType === 'relay') ? 'relay' : 'direct';
      } catch (e) { return null; }
    }

    get connected() { return !!(this.conn && this.conn.open); }

    send(msg) {
      if (this.conn && this.conn.open) {
        try { this.conn.send(msg); } catch (e) { /* channel closing */ }
      }
    }

    fail(text) {
      const h = this.h;
      this.close();
      h.onError(text);
    }

    close() {
      this.closed = true;
      for (const id of this.timers) clearTimeout(id);
      this.timers.clear();
      try { if (this.conn) this.conn.close(); } catch (e) { /* ignore */ }
      try { if (this.peer) this.peer.destroy(); } catch (e) { /* ignore */ }
      this.conn = null;
      this.peer = null;
    }
  }

  Net.HELP = HELP;
  OO.Net = Net;
})(window.OO = window.OO || {});
