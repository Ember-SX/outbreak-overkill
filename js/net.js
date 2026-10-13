/*
 * Net: a thin wrapper around PeerJS (js/vendor/peerjs.min.js) for 2-player co-op.
 *
 * Players find each other through a PeerJS signalling server using a 3-digit room code
 * (room 427 = peer id "outbreak-overkill-v1-427"). After the handshake, game data flows
 * directly between the two browsers over a WebRTC data channel.
 *
 * By default the free public PeerJS cloud server is used. To use your own (or a local one for
 * testing: `npx peer --port 9000`), add ?peer=host:port to the page URL, e.g.
 *   http://localhost:8080/?peer=localhost:9000
 */
(function (OO) {
  'use strict';

  const ERRORS = {
    'browser-incompatible': "This browser can't make peer-to-peer connections. Try a current Chrome, Edge, Firefox or Safari.",
    network: "Couldn't reach the matchmaking server. Check your internet connection and try again. (Embedded previews can't go online; open the full game, e.g. from GitHub Pages.)",
    'server-error': "The matchmaking server didn't respond. Try again in a moment.",
    'socket-error': "Lost contact with the matchmaking server. Try again in a moment.",
    'socket-closed': "Lost contact with the matchmaking server. Try again in a moment.",
    'ssl-unavailable': 'The matchmaking server needs a secure (https) page.',
    'webrtc': 'The direct connection to your partner failed. One of your networks may be blocking it.',
  };

  class Net {
    /** handlers: onHosting(code), onConnected(), onMessage(msg), onDisconnected(), onError(text) */
    constructor(handlers) {
      this.h = handlers;
      this.peer = null;
      this.conn = null;
      this.code = null;
      this.closed = false;
    }

    static available() {
      return typeof window.Peer === 'function' && typeof window.RTCPeerConnection === 'function';
    }

    static options() {
      const opts = { debug: 1 };
      let q = null;
      try { q = new URLSearchParams(window.location.search).get('peer'); } catch (e) { /* ignore */ }
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

    /** Open a room with a free 3-digit code. Retries a few codes if one is taken. */
    host(tries = 6) {
      const code = Net.randomCode();
      const peer = new window.Peer(Net.peerId(code), Net.options());
      this.peer = peer;
      peer.on('open', () => { if (this.closed) return; this.code = code; this.h.onHosting(code); });
      peer.on('connection', (conn) => {
        if (this.conn) {
          // Room is full: tell the third player politely, then hang up.
          conn.on('open', () => { conn.send({ t: 'full' }); setTimeout(() => conn.close(), 500); });
          return;
        }
        this.attach(conn);
      });
      peer.on('error', (err) => {
        if (this.closed) return;
        if (err.type === 'unavailable-id' && tries > 1) { peer.destroy(); this.host(tries - 1); return; }
        if (err.type === 'unavailable-id') { this.fail('All the room codes we tried are busy. Try again.'); return; }
        this.fail(ERRORS[err.type] || 'Connection error: ' + (err.type || err.message));
      });
    }

    /** Join someone else's room by its 3-digit code. */
    join(code) {
      this.code = code;
      const peer = new window.Peer(Net.options());
      this.peer = peer;
      peer.on('open', () => {
        if (this.closed) return;
        const conn = peer.connect(Net.peerId(code), { reliable: true });
        this.attach(conn);
        this.joinTimer = setTimeout(() => {
          if (!this.conn || !this.conn.open) this.fail('No answer from room ' + code + '. Check the code with your host.');
        }, 12000);
      });
      peer.on('error', (err) => {
        if (this.closed) return;
        if (err.type === 'peer-unavailable') { this.fail('There is no room ' + code + '. Check the code with your host.'); return; }
        this.fail(ERRORS[err.type] || 'Connection error: ' + (err.type || err.message));
      });
    }

    attach(conn) {
      this.conn = conn;
      conn.on('open', () => { clearTimeout(this.joinTimer); if (!this.closed) this.h.onConnected(); });
      conn.on('data', (d) => { if (!this.closed) this.h.onMessage(d); });
      conn.on('close', () => {
        if (this.conn !== conn) return;
        this.conn = null;
        if (!this.closed) this.h.onDisconnected();
      });
      conn.on('error', () => { /* 'close' follows */ });
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
      clearTimeout(this.joinTimer);
      try { if (this.conn) this.conn.close(); } catch (e) { /* ignore */ }
      try { if (this.peer) this.peer.destroy(); } catch (e) { /* ignore */ }
      this.conn = null;
      this.peer = null;
    }
  }

  OO.Net = Net;
})(window.OO = window.OO || {});
