/*
 * Renderer: procedural art for the world, the flashlight darkness pass, and the canvas HUD.
 * Everything is drawn with canvas primitives so the prototype ships without image assets.
 * When real sprites arrive, replace drawEnemy / drawPlayer and keep the rest.
 */
(function (OO) {
  'use strict';

  const U = OO.U;
  const TAU = Math.PI * 2;
  const FONT_DISPLAY = '"Big Shoulders Stencil Display", Impact, "Arial Narrow", sans-serif';
  const FONT_MONO = '"IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace';
  const HEAD = { shambler: 0.45, hound: 1.45, skinner: 0.35, bloater: 0.6, brute: 0.55, stalker: 0.5 };
  const ANIM = { shambler: 5, hound: 16, skinner: 9, bloater: 4, brute: 3, stalker: 4 };   // anim speed (rad/s)
  const FRAMES = 8;
  const SPRITE_SCALE = 2;

  function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }

  class Renderer {
    constructor(game, canvas) {
      this.g = game;
      this.c = canvas;
      this.ctx = canvas.getContext('2d');
      this.dark = document.createElement('canvas');
      this.dctx = this.dark.getContext('2d');
      this.groundTile = this.makeGround();
      this.pattern = this.ctx.createPattern(this.groundTile, 'repeat');
      this.splats = { red: [], bile: [] };
      for (let i = 0; i < 6; i++) {
        this.splats.red.push(this.makeSplat('#4f0a08', '#7a130f'));
        this.splats.bile.push(this.makeSplat('#4d5a17', '#8b9c2b'));
      }
      this.menuEyes = [];
      for (let i = 0; i < 14; i++) this.menuEyes.push({ x: Math.random(), y: Math.random(), p: Math.random() * 10, s: U.rand(0.7, 1.3) });
      this.cam = { x: 0, y: 0 };
      this.cache = new Map();
      this.shadow = document.createElement('canvas');
      this.shadow.width = 64; this.shadow.height = 26;
      const sh = this.shadow.getContext('2d');
      sh.fillStyle = 'rgba(0,0,0,0.38)';
      sh.beginPath(); sh.ellipse(32, 13, 31, 12, 0, 0, TAU); sh.fill();
    }

    resize(w, h, dpr) {
      this.w = w; this.h = h; this.dpr = dpr;
      this.c.width = Math.round(w * dpr);
      this.c.height = Math.round(h * dpr);
      this.dark.width = Math.ceil(w / 2);
      this.dark.height = Math.ceil(h / 2);
      this.pattern = this.ctx.createPattern(this.groundTile, 'repeat');
    }

    // ---------------------------------------------------------------- procedural textures
    makeGround() {
      const S = 512;
      const c = document.createElement('canvas');
      c.width = c.height = S;
      const x = c.getContext('2d');
      const tiled = (fn) => { for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { x.save(); x.translate(ox, oy); fn(); x.restore(); } };

      x.fillStyle = '#1a1c1a';
      x.fillRect(0, 0, S, S);

      for (let i = 0; i < 70; i++) {
        const px = Math.random() * S, py = Math.random() * S, r = U.rand(20, 110);
        const light = Math.random() < 0.5;
        tiled(() => {
          const g = x.createRadialGradient(px, py, 0, px, py, r);
          g.addColorStop(0, light ? 'rgba(52,56,48,0.35)' : 'rgba(6,7,6,0.35)');
          g.addColorStop(1, 'rgba(0,0,0,0)');
          x.fillStyle = g; x.beginPath(); x.arc(px, py, r, 0, TAU); x.fill();
        });
      }
      // concrete slab seams: give the eye something to track while moving
      x.strokeStyle = 'rgba(0,0,0,0.45)'; x.lineWidth = 2;
      for (let i = 0; i <= S; i += 128) {
        x.beginPath(); x.moveTo(i, 0); x.lineTo(i, S); x.stroke();
        x.beginPath(); x.moveTo(0, i); x.lineTo(S, i); x.stroke();
      }
      x.strokeStyle = 'rgba(90,92,84,0.12)'; x.lineWidth = 1;
      for (let i = 0; i <= S; i += 128) {
        x.beginPath(); x.moveTo(i + 2, 0); x.lineTo(i + 2, S); x.stroke();
        x.beginPath(); x.moveTo(0, i + 2); x.lineTo(S, i + 2); x.stroke();
      }
      // grit
      for (let i = 0; i < 4200; i++) {
        const v = Math.floor(U.rand(20, 70));
        x.fillStyle = `rgba(${v},${v},${v - 4},${U.rand(0.2, 0.6)})`;
        x.fillRect(Math.random() * S, Math.random() * S, 1, 1);
      }
      // cracks
      for (let i = 0; i < 16; i++) {
        let px = Math.random() * S, py = Math.random() * S, a = U.rand(0, TAU);
        const pts = [[px, py]];
        for (let k = 0; k < U.randInt(6, 16); k++) {
          a += U.rand(-0.7, 0.7);
          px += Math.cos(a) * U.rand(6, 16); py += Math.sin(a) * U.rand(6, 16);
          pts.push([px, py]);
        }
        tiled(() => {
          x.strokeStyle = 'rgba(0,0,0,0.6)'; x.lineWidth = U.rand(0.8, 1.8);
          x.beginPath(); pts.forEach((p, j) => (j ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]))); x.stroke();
        });
      }
      // old stains
      for (let i = 0; i < 7; i++) {
        const px = Math.random() * S, py = Math.random() * S, r = U.rand(10, 34);
        tiled(() => {
          x.fillStyle = 'rgba(58,16,12,0.22)';
          for (let k = 0; k < 6; k++) { x.beginPath(); x.arc(px + U.rand(-r, r) * 0.6, py + U.rand(-r, r) * 0.6, r * U.rand(0.3, 0.7), 0, TAU); x.fill(); }
        });
      }
      // faded hazard paint
      x.fillStyle = 'rgba(200,160,40,0.07)';
      for (let i = 0; i < S; i += 48) x.fillRect(i, 318, 26, 6);
      return c;
    }

    makeSplat(dark, light) {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const x = c.getContext('2d');
      x.translate(32, 32);
      x.fillStyle = dark;
      for (let i = 0; i < 7; i++) circle(x, U.rand(-9, 9), U.rand(-9, 9), U.rand(6, 13));
      for (let i = 0; i < 9; i++) {
        const a = U.rand(0, TAU), d = U.rand(14, 28);
        circle(x, Math.cos(a) * d, Math.sin(a) * d, U.rand(1.2, 3.5));
      }
      x.fillStyle = light;
      x.globalAlpha = 0.55;
      for (let i = 0; i < 3; i++) circle(x, U.rand(-6, 6), U.rand(-6, 6), U.rand(3, 6));
      return c;
    }

    // ---------------------------------------------------------------- frame
    render() {
      const g = this.g, ctx = this.ctx;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.fillStyle = '#0d0f0e';
      ctx.fillRect(0, 0, this.w, this.h);

      if (!g.player) { this.renderMenuBackdrop(); return; }

      const p = g.player, z = g.zoom;
      let sx = 0, sy = 0;
      if (g.shakeAmt > 0.2) { sx = U.rand(-1, 1) * g.shakeAmt; sy = U.rand(-1, 1) * g.shakeAmt; }
      const camX = p.x - g.viewW / 2, camY = p.y - g.viewH / 2;
      this.cam.x = camX; this.cam.y = camY; this.sx = sx; this.sy = sy;

      const world = () => { ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); ctx.translate(sx, sy); ctx.scale(z, z); ctx.translate(-camX, -camY); };

      world();
      ctx.fillStyle = this.pattern;
      ctx.fillRect(camX - 40, camY - 40, g.viewW + 80, g.viewH + 80);
      this.drawDecals(ctx);
      this.drawZones(ctx);
      this.drawObstacles(ctx);
      this.drawEnemies(ctx);
      this.drawPlayer(ctx);
      for (const w of p.weapons) w.draw(ctx, g);
      this.drawLobs(ctx);
      this.drawEffects(ctx, false);
      this.drawParticles(ctx);

      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.drawDarkness();

      // Things that should read through the dark: eyes, loot, tracers, lightning, numbers.
      world();
      this.drawObstacleEdges(ctx);
      this.drawEyes(ctx);
      this.drawPickups(ctx);
      this.drawProjectiles(ctx);
      this.drawEffects(ctx, true);
      this.drawTexts(ctx);
      this.drawEnemyBars(ctx);

      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.drawScreenFx();
      if (g.state !== 'results') this.drawHud();
      this.drawStick();
      if (g.debug) this.drawDebug();
    }

    inView(x, y, r) {
      const g = this.g, c = this.cam;
      return x + r > c.x && x - r < c.x + g.viewW && y + r > c.y && y - r < c.y + g.viewH;
    }

    renderMenuBackdrop() {
      const ctx = this.ctx, t = this.g.menuTime, w = this.w, h = this.h;
      ctx.save();
      ctx.translate(-(t * 12) % 512, -(t * 7) % 512);
      ctx.fillStyle = this.pattern;
      ctx.fillRect(0, 0, w + 512, h + 512);
      ctx.restore();
      const d = this.dctx, W = this.dark.width, H = this.dark.height;
      d.globalCompositeOperation = 'source-over';
      d.clearRect(0, 0, W, H);
      d.fillStyle = 'rgba(4,6,5,0.93)';
      d.fillRect(0, 0, W, H);
      d.globalCompositeOperation = 'destination-out';
      const R = Math.max(W, H) * 0.42, cx = W * 0.5, cy = H * 0.42;
      const gr = d.createRadialGradient(cx, cy, 0, cx, cy, R);
      gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      d.fillStyle = gr; d.beginPath(); d.arc(cx, cy, R, 0, TAU); d.fill();
      ctx.drawImage(this.dark, 0, 0, w, h);
      // eyes in the dark, blinking
      ctx.globalCompositeOperation = 'lighter';
      for (const e of this.menuEyes) {
        const blink = Math.sin(t * 0.7 + e.p);
        if (blink < -0.2) continue;
        const a = Math.min(1, (blink + 0.2) * 2);
        const ex = e.x * w, ey = e.y * h, sp = 5 * e.s;
        ctx.fillStyle = `rgba(255,70,40,${0.18 * a})`;
        circle(ctx, ex - sp, ey, 5 * e.s); circle(ctx, ex + sp, ey, 5 * e.s);
        ctx.fillStyle = `rgba(255,190,120,${0.9 * a})`;
        circle(ctx, ex - sp, ey, 1.4 * e.s); circle(ctx, ex + sp, ey, 1.4 * e.s);
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    // ---------------------------------------------------------------- world layers
    drawDecals(ctx) {
      for (const d of this.g.decals) {
        if (!this.inView(d.x, d.y, d.r * 2)) continue;
        const img = this.splats[d.kind][d.v];
        ctx.globalAlpha = Math.min(1, d.life / 6) * 0.85;
        ctx.save();
        ctx.translate(d.x, d.y); ctx.rotate(d.rot);
        const s = d.r * 2.2;
        ctx.drawImage(img, -s / 2, -s / 2, s, s);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }

    drawZones(ctx) {
      const t = this.g.time;
      for (const z of this.g.zones) {
        const fade = Math.min(1, z.life / 0.4, (z.max - z.life) / 0.15 + 0.3);
        const flick = 0.85 + Math.sin(t * 23 + z.seed) * 0.08 + Math.sin(t * 37 + z.seed * 2) * 0.07;
        const gr = ctx.createRadialGradient(z.x, z.y, 0, z.x, z.y, z.r * 1.15);
        gr.addColorStop(0, `rgba(255,214,120,${0.75 * fade * flick})`);
        gr.addColorStop(0.45, `rgba(240,110,30,${0.55 * fade})`);
        gr.addColorStop(0.8, `rgba(150,40,10,${0.35 * fade})`);
        gr.addColorStop(1, 'rgba(60,10,0,0)');
        ctx.fillStyle = gr;
        circle(ctx, z.x, z.y, z.r * 1.15);
      }
    }

    // ---------------------------------------------------------------- obstacles
    drawObstacles(ctx) {
      for (const o of this.g.world.list) {
        if (!this.inView(o.x, o.y, Math.max(o.maxX - o.minX, o.maxY - o.minY))) continue;
        const spr = o.spr || (o.spr = this.obstacleSprite(o));
        ctx.drawImage(spr, o.x - spr.hw, o.y - spr.hh, spr.hw * 2, spr.hh * 2);
      }
    }

    /** Faint rim on every obstacle, drawn over the darkness so cover is readable in the dark. */
    drawObstacleEdges(ctx) {
      ctx.strokeStyle = 'rgba(235,226,207,0.13)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (const o of this.g.world.list) {
        if (!this.inView(o.x, o.y, 100)) continue;
        if (o.kind === 'circle') { ctx.moveTo(o.x + o.r, o.y); ctx.arc(o.x, o.y, o.r, 0, TAU); }
        else ctx.rect(o.minX, o.minY, o.maxX - o.minX, o.maxY - o.minY);
      }
      ctx.stroke();
    }

    /** Pre-renders one obstacle (with its drop shadow) into its own little canvas. */
    obstacleSprite(o) {
      const pad = 12;
      const hw = (o.kind === 'circle' ? o.r : o.hw) + pad, hh = (o.kind === 'circle' ? o.r : o.hh) + pad;
      const c = document.createElement('canvas');
      c.width = Math.ceil(hw * 2 * SPRITE_SCALE); c.height = Math.ceil(hh * 2 * SPRITE_SCALE);
      const x = c.getContext('2d');
      x.scale(SPRITE_SCALE, SPRITE_SCALE);
      x.translate(hw, hh);
      let seed = Math.floor(o.seed * 1e6);
      const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      const rrect = (X, Y, W, H, r) => { x.beginPath(); x.roundRect ? x.roundRect(X, Y, W, H, r) : x.rect(X, Y, W, H); };

      // shadow
      x.fillStyle = 'rgba(0,0,0,0.5)';
      if (o.kind === 'circle') { x.beginPath(); x.arc(5, 7, o.r, 0, TAU); x.fill(); }
      else { rrect(-o.hw + 5, -o.hh + 7, o.hw * 2, o.hh * 2, 6); x.fill(); }

      // vehicles are drawn lying along x, then rotated if the obstacle is vertical
      const vertical = o.kind === 'rect' && o.hh > o.hw;
      if (vertical) x.rotate(Math.PI / 2);
      const L = vertical ? o.hh : o.hw, Wd = vertical ? o.hw : o.hh;

      switch (o.type) {
        case 'car':
        case 'bus': {
          const pal = [['#5b3b2c', '#3e2a20'], ['#33424f', '#232e37'], ['#2a2724', '#191715'], ['#5e5a3c', '#3c3926']][o.tint || 0];
          const bus = o.type === 'bus';
          x.fillStyle = bus ? '#5c5031' : pal[0]; rrect(-L, -Wd, L * 2, Wd * 2, bus ? 5 : 9); x.fill();
          x.fillStyle = bus ? '#423a24' : pal[1]; rrect(-L * (bus ? 0.92 : 0.45), -Wd * 0.72, L * (bus ? 1.84 : 0.95), Wd * 1.44, 5); x.fill();
          x.fillStyle = '#162026';
          if (bus) {
            for (let i = -5; i <= 5; i++) { x.fillRect(i * L * 0.16 - 5, -Wd + 3, 10, 5); x.fillRect(i * L * 0.16 - 5, Wd - 8, 10, 5); }
          } else {
            x.beginPath(); x.moveTo(L * 0.5, -Wd * 0.72); x.lineTo(L * 0.7, -Wd * 0.6); x.lineTo(L * 0.7, Wd * 0.6); x.lineTo(L * 0.5, Wd * 0.72); x.fill();
            x.beginPath(); x.moveTo(-L * 0.45, -Wd * 0.72); x.lineTo(-L * 0.62, -Wd * 0.6); x.lineTo(-L * 0.62, Wd * 0.6); x.lineTo(-L * 0.45, Wd * 0.72); x.fill();
            x.fillStyle = '#c9c0a0'; x.fillRect(L - 4, -Wd + 4, 3, 6); x.fillRect(L - 4, Wd - 10, 3, 6);
          }
          // scorch and rust
          for (let i = 0; i < 4; i++) {
            x.fillStyle = `rgba(${rnd() < 0.5 ? '15,12,10' : '110,52,24'},${0.25 + rnd() * 0.3})`;
            x.beginPath(); x.arc((rnd() - 0.5) * L * 1.6, (rnd() - 0.5) * Wd * 1.4, 4 + rnd() * 9, 0, TAU); x.fill();
          }
          x.strokeStyle = 'rgba(0,0,0,0.5)'; x.lineWidth = 1.5;
          x.beginPath(); x.moveTo(-L * 0.1, -Wd); x.lineTo(-L * 0.1, Wd); x.stroke();
          break;
        }
        case 'barrier': {
          x.fillStyle = '#6f6d64'; rrect(-L, -Wd, L * 2, Wd * 2, 3); x.fill();
          x.fillStyle = '#8b897f'; x.fillRect(-L + 3, -Wd * 0.35, L * 2 - 6, Wd * 0.7);
          for (const end of [-1, 1]) {
            for (let i = 0; i < 3; i++) {
              x.fillStyle = i % 2 ? '#1b1a17' : '#c9a227';
              x.fillRect(end * (L - 6 - i * 7) - 3.5, -Wd, 7, Wd * 2);
            }
          }
          x.strokeStyle = 'rgba(0,0,0,0.45)'; x.lineWidth = 1;
          x.beginPath(); x.moveTo((rnd() - 0.5) * L, -Wd); x.lineTo((rnd() - 0.5) * L, Wd); x.stroke();
          break;
        }
        case 'dumpster': {
          x.fillStyle = '#2d4633'; rrect(-L, -Wd, L * 2, Wd * 2, 3); x.fill();
          x.fillStyle = '#3a5a41'; x.fillRect(-L + 3, -Wd + 3, L - 4, Wd * 2 - 6); x.fillRect(1, -Wd + 3, L - 4, Wd * 2 - 6);
          x.fillStyle = 'rgba(110,52,24,0.5)';
          for (let i = 0; i < 3; i++) { x.beginPath(); x.arc((rnd() - 0.5) * L * 1.6, (rnd() - 0.5) * Wd * 1.4, 3 + rnd() * 5, 0, TAU); x.fill(); }
          break;
        }
        case 'pillar': {
          x.fillStyle = '#5f5d56'; x.beginPath(); x.arc(0, 0, o.r, 0, TAU); x.fill();
          x.fillStyle = '#76746b'; x.beginPath(); x.arc(-2, -2, o.r * 0.78, 0, TAU); x.fill();
          x.fillStyle = '#3a3833';
          for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; x.fillRect(Math.cos(a) * o.r * 0.45 - 1.5, Math.sin(a) * o.r * 0.45 - 1.5, 3, 3); }
          break;
        }
        case 'barrels': {
          x.fillStyle = '#9c8228'; x.beginPath(); x.arc(0, 0, o.r, 0, TAU); x.fill();
          x.strokeStyle = '#5c4c16'; x.lineWidth = 2; x.beginPath(); x.arc(0, 0, o.r * 0.78, 0, TAU); x.stroke();
          x.fillStyle = '#1b1a17';
          for (let i = 0; i < 3; i++) {
            const a = (i / 3) * TAU - Math.PI / 2;
            x.beginPath(); x.moveTo(0, 0); x.arc(0, 0, o.r * 0.55, a - 0.38, a + 0.38); x.closePath(); x.fill();
          }
          x.fillStyle = '#9c8228'; x.beginPath(); x.arc(0, 0, o.r * 0.16, 0, TAU); x.fill();
          break;
        }
      }
      c.hw = hw; c.hh = hh;
      return c;
    }

    drawEnemies(ctx) {
      const list = this.g.enemies;
      for (const e of list) if (e.def.crate && !e.dead && this.inView(e.x, e.y, 30)) this.drawCrate(ctx, e);
      for (const e of list) if (!e.def.crate && !e.dead && this.inView(e.x, e.y, e.r * 2.2)) this.drawEnemy(ctx, e);
    }

    drawCrate(ctx, e) {
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(-14, -8, 32, 26);
      ctx.fillStyle = e.flash > 0 ? '#fff' : '#6b5232';
      ctx.fillRect(-16, -14, 32, 28);
      ctx.strokeStyle = '#3e2e1a'; ctx.lineWidth = 2;
      ctx.strokeRect(-16, -14, 32, 28);
      ctx.beginPath(); ctx.moveTo(-16, -14); ctx.lineTo(16, 14); ctx.moveTo(16, -14); ctx.lineTo(-16, 14); ctx.stroke();
      ctx.fillStyle = '#d8ccb0'; ctx.fillRect(-7, -5, 14, 10);
      ctx.fillStyle = '#a3201b'; ctx.fillRect(-1.5, -4, 3, 8); ctx.fillRect(-5, -1.5, 10, 3);
      ctx.restore();
    }

    /**
     * Enemies are drawn once per animation frame into cached sprites (facing +x),
     * then blitted with a rotation. Far cheaper than re-tracing paths for 400 infected.
     * To switch to painted art later, make enemySprite() return frames from an image atlas.
     */
    enemySprite(type, frame, fl) {
      const key = type + ':' + frame + (fl ? 'f' : '');
      let c = this.cache.get(key);
      if (c) return c;
      const d = OO.ENEMIES[type], r = d.r, half = Math.ceil(r * 2.4);
      c = document.createElement('canvas');
      c.width = c.height = half * 2 * SPRITE_SCALE;
      const x = c.getContext('2d');
      x.scale(SPRITE_SCALE, SPRITE_SCALE);
      x.translate(half, half);
      this.drawEnemyShape(x, type, d, r, (frame / FRAMES) * (TAU / ANIM[type]), fl);
      c.half = half;
      this.cache.set(key, c);
      return c;
    }

    eyeSprite(type) {
      const key = 'eyes:' + type;
      let c = this.cache.get(key);
      if (c) return c;
      const d = OO.ENEMIES[type], r = d.r, half = Math.ceil(r * 2.4);
      c = document.createElement('canvas');
      c.width = c.height = half * 2 * SPRITE_SCALE;
      const x = c.getContext('2d');
      x.scale(SPRITE_SCALE, SPRITE_SCALE);
      x.translate(half, half);
      const h = HEAD[type] * r, sp = Math.max(2.6, r * 0.2);
      const big = d.boss ? 2.2 : d.elite ? 1.6 : 1;
      x.fillStyle = d.eye + '44';
      circle(x, h, sp, 3.4 * big); circle(x, h, -sp, 3.4 * big);
      x.fillStyle = d.eye;
      circle(x, h, sp, 1.3 * big); circle(x, h, -sp, 1.3 * big);
      c.half = half;
      this.cache.set(key, c);
      return c;
    }

    drawEnemy(ctx, e) {
      const r = e.r;
      ctx.drawImage(this.shadow, e.x - r * 1.1, e.y + r * 0.25, r * 2.2, r * 0.9);
      const period = TAU / ANIM[e.type];
      const frame = Math.floor(((e.t % period) / period) * FRAMES) % FRAMES;
      const spr = this.enemySprite(e.type, frame, e.flash > 0);
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(e.a);
      ctx.drawImage(spr, -spr.half, -spr.half, spr.half * 2, spr.half * 2);
      ctx.restore();

      if (e.type === 'stalker' && e.ai.mode === 'wind') {
        ctx.strokeStyle = `rgba(255,40,60,${0.5 + Math.sin(e.t * 40) * 0.4})`;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(e.x, e.y, r * 1.5, 0, TAU); ctx.stroke();
      }
    }

    drawEnemyShape(ctx, type, d, r, t, fl) {
      const body = fl ? '#ffffff' : d.body, skin = fl ? '#ffffff' : d.skin;
      if (type === 'bloater') {
        ctx.fillStyle = body; circle(ctx, 0, 0, r);
        ctx.fillStyle = skin;
        for (let i = 0; i < 5; i++) {
          const a = i * 1.3 + 0.4, pr = r * (0.26 + Math.sin(t * 4 + i) * 0.05);
          circle(ctx, Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, pr);
        }
        ctx.fillStyle = fl ? '#fff' : '#3b420f';
        circle(ctx, r * 0.6, 0, r * 0.32);
        return;
      }

      ctx.lineCap = 'round';
      switch (type) {
        case 'shambler': {
          const sw = Math.sin(t * 5) * 0.25;
          ctx.strokeStyle = skin; ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(0, -r * 0.65); ctx.lineTo(r * 1.5, -r * 0.45 + sw * 8);
          ctx.moveTo(0, r * 0.65); ctx.lineTo(r * 1.5, r * 0.45 - sw * 8);
          ctx.stroke();
          ctx.fillStyle = body; circle(ctx, 0, 0, r);
          ctx.fillStyle = fl ? '#fff' : '#4a0d0b'; circle(ctx, -r * 0.35, r * 0.35, r * 0.28);
          ctx.fillStyle = skin; circle(ctx, r * 0.35, 0, r * 0.55);
          break;
        }
        case 'hound': {
          const leg = Math.sin(t * 16) * r * 0.45;
          ctx.strokeStyle = body; ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(r * 0.6, -r * 0.5); ctx.lineTo(r * 0.6 + leg, -r * 1.05);
          ctx.moveTo(r * 0.6, r * 0.5); ctx.lineTo(r * 0.6 - leg, r * 1.05);
          ctx.moveTo(-r * 0.7, -r * 0.5); ctx.lineTo(-r * 0.7 - leg, -r * 1.05);
          ctx.moveTo(-r * 0.7, r * 0.5); ctx.lineTo(-r * 0.7 + leg, r * 1.05);
          ctx.stroke();
          ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(0, 0, r * 1.45, r * 0.72, 0, 0, TAU); ctx.fill();
          ctx.strokeStyle = fl ? '#fff' : '#b9806a'; ctx.lineWidth = 1.4;
          for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(i * r * 0.35, -r * 0.55); ctx.lineTo(i * r * 0.35, r * 0.55); ctx.stroke(); }
          ctx.fillStyle = skin; ctx.beginPath(); ctx.ellipse(r * 1.45, 0, r * 0.62, r * 0.45, 0, 0, TAU); ctx.fill();
          break;
        }
        case 'skinner': {
          const sw = Math.sin(t * 9) * 0.3;
          ctx.strokeStyle = fl ? '#fff' : '#e6d6c4'; ctx.lineWidth = 2;
          for (const s of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(r * 0.2, s * r * 0.7); ctx.lineTo(r * 1.3, s * r * (0.9 + sw));
            ctx.moveTo(r * 1.3, s * r * (0.9 + sw)); ctx.lineTo(r * 1.75, s * r * (0.55 + sw));
            ctx.moveTo(r * 1.3, s * r * (0.9 + sw)); ctx.lineTo(r * 1.8, s * r * (0.95 + sw));
            ctx.stroke();
          }
          ctx.fillStyle = body; circle(ctx, 0, 0, r);
          ctx.strokeStyle = fl ? '#fff' : '#e0907f'; ctx.lineWidth = 1.5;
          for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(-r * 0.2, 0, r * (0.35 + i * 0.18), 1.9, 4.4); ctx.stroke(); }
          ctx.fillStyle = fl ? '#fff' : '#e8909c'; circle(ctx, r * 0.35, 0, r * 0.55);
          ctx.strokeStyle = fl ? '#fff' : '#b35a68'; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.moveTo(r * 0.1, 0); ctx.lineTo(r * 0.75, 0); ctx.stroke();
          break;
        }
        case 'brute': {
          ctx.fillStyle = body;
          ctx.beginPath(); ctx.ellipse(0, 0, r * 0.9, r * 1.05, 0, 0, TAU); ctx.fill();
          ctx.fillStyle = skin;
          const sw = Math.sin(t * 3) * r * 0.2;
          circle(ctx, r * 0.75 + sw, -r * 0.95, r * 0.45);
          circle(ctx, r * 0.75 - sw, r * 0.95, r * 0.45);
          ctx.fillStyle = fl ? '#fff' : '#2a2b31'; circle(ctx, r * 0.4, 0, r * 0.38);
          ctx.fillStyle = fl ? '#fff' : '#5e0f0c'; ctx.fillRect(-r * 0.6, -r * 0.2, r * 0.5, r * 0.15);
          break;
        }
        case 'stalker': {
          ctx.strokeStyle = fl ? '#fff' : '#6b3f7d'; ctx.lineWidth = 5;
          for (let i = -1; i <= 1; i++) {
            const w = Math.sin(t * 4 + i * 2) * r * 0.5;
            ctx.beginPath();
            ctx.moveTo(-r * 0.5, i * r * 0.4);
            ctx.bezierCurveTo(-r * 1.2, i * r * 0.6 + w, -r * 1.5, i * r * 0.9 - w, -r * 2, i * r * 1.1 + w);
            ctx.stroke();
          }
          ctx.fillStyle = body;
          ctx.beginPath(); ctx.ellipse(0, 0, r * 0.85, r * 1.1, 0, 0, TAU); ctx.fill();
          ctx.fillStyle = skin; circle(ctx, r * 0.15, -r * 0.8, r * 0.38); circle(ctx, r * 0.15, r * 0.8, r * 0.38);
          ctx.fillStyle = fl ? '#fff' : '#5a4a60'; circle(ctx, r * 0.45, 0, r * 0.42);
          ctx.fillStyle = fl ? '#fff' : '#7a2a3a'; circle(ctx, r * 0.55, r * 0.12, r * 0.18);
          break;
        }
      }
    }

    drawEyes(ctx) {
      ctx.globalCompositeOperation = 'lighter';
      for (const e of this.g.enemies) {
        if (e.dead || e.def.crate || !this.inView(e.x, e.y, e.r * 2)) continue;
        const spr = this.eyeSprite(e.type);
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.rotate(e.a);
        ctx.drawImage(spr, -spr.half, -spr.half, spr.half * 2, spr.half * 2);
        ctx.restore();
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    drawEnemyBars(ctx) {
      for (const e of this.g.enemies) {
        if (e.dead || !e.def.elite || e.hp >= e.maxHp) continue;
        const w = e.r * 2;
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(e.x - w / 2, e.y - e.r - 12, w, 4);
        ctx.fillStyle = '#c62a22'; ctx.fillRect(e.x - w / 2, e.y - e.r - 12, w * Math.max(0, e.hp / e.maxHp), 4);
      }
    }

    drawPlayer(ctx) {
      const g = this.g, p = g.player;
      const blink = p.iframes > 0 && Math.floor(g.time * 30) % 2 === 0;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.beginPath(); ctx.ellipse(0, p.r * 0.75, p.r * 1.1, p.r * 0.45, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = blink ? 0.45 : 1;

      // legs (walk cycle, drawn along facing)
      ctx.save();
      ctx.rotate(p.faceAngle);
      const step = p.moving ? Math.sin(p.walk) * 5 : 0;
      ctx.fillStyle = '#1e2126';
      ctx.fillRect(-4 + step, -8, 9, 5);
      ctx.fillRect(-4 - step, 3, 9, 5);
      ctx.restore();

      // body + gun toward aim
      ctx.save();
      ctx.rotate(p.aimAngle);
      ctx.fillStyle = '#222';
      ctx.fillRect(6, 2, 16, 4.5);
      ctx.fillStyle = p.char.vest;
      ctx.beginPath(); ctx.ellipse(0, 0, p.r * 0.8, p.r, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-3, -p.r * 0.8); ctx.lineTo(-3, p.r * 0.8); ctx.stroke();
      ctx.fillStyle = '#c69a74'; circle(ctx, 6, 5, 3.2);
      ctx.fillStyle = '#2a1f18'; circle(ctx, 1, 0, 7);
      ctx.fillStyle = '#c69a74'; circle(ctx, 3.5, 0, 4.2);
      ctx.restore();

      if (p.hurt > 0) {
        ctx.globalAlpha = p.hurt / 0.3 * 0.6;
        ctx.fillStyle = '#ff2a1a'; circle(ctx, 0, 0, p.r + 2);
      }
      ctx.restore();

      // HP bar under the operative
      const w = 38, y = p.y + p.r + 9;
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(p.x - w / 2 - 1, y - 1, w + 2, 6);
      ctx.fillStyle = '#3a0c0a'; ctx.fillRect(p.x - w / 2, y, w, 4);
      ctx.fillStyle = p.hp / p.stats.maxHp < 0.3 ? '#ff3b2f' : '#c62a22';
      ctx.fillRect(p.x - w / 2, y, w * U.clamp(p.hp / p.stats.maxHp, 0, 1), 4);
    }

    drawPickups(ctx) {
      const t = this.g.time;
      for (const g of this.g.pickups) {
        if (g.dead || !this.inView(g.x, g.y, 20)) continue;
        const bob = g.attract ? 0 : Math.sin(t * 3 + g.t) * 2;
        const x = g.x, y = g.y + bob;
        if (g.kind === 'xp') {
          const tier = g.value >= 10 || g.overflow ? 2 : g.value >= 3 ? 1 : 0;
          const spr = this.gemSprite(tier);
          ctx.drawImage(spr, x - spr.half, y - spr.half, spr.half * 2, spr.half * 2);
          continue;
        }
        const pulse = 0.5 + Math.sin(t * 5 + g.t) * 0.5;
        if (g.kind === 'case') {
          ctx.fillStyle = `rgba(227,163,59,${0.15 + pulse * 0.2})`; circle(ctx, x, y, 30);
          ctx.fillStyle = '#6c707c'; ctx.fillRect(x - 15, y - 10, 30, 20);
          ctx.fillStyle = '#e3a33b'; ctx.fillRect(x - 15, y - 2, 30, 4);
          ctx.fillStyle = '#2a2b31'; ctx.fillRect(x - 5, y - 14, 10, 4);
          ctx.strokeStyle = '#2a2b31'; ctx.lineWidth = 1.5; ctx.strokeRect(x - 15, y - 10, 30, 20);
          continue;
        }
        const map = { herb: ['herb', '#6fd05a'], magnet: ['magnet', '#56d6c0'], bomb: ['tesla', '#ff5a4a'], credit: ['credits', '#e3a33b'] };
        const [icon, col] = map[g.kind] || ['credits', '#fff'];
        ctx.fillStyle = col + '30'; circle(ctx, x, y, 14 + pulse * 3);
        ctx.drawImage(OO.Icons.image(icon, 20, col), x - 10, y - 10, 20, 20);
      }
    }

    /** DNA sample gem: 0 = small teal, 1 = green, 2 = big red. */
    gemSprite(tier) {
      const key = 'gem' + tier;
      let c = this.cache.get(key);
      if (c) return c;
      const col = ['#56d6c0', '#9ee05a', '#ff5a4a'][tier], s = [4.5, 5.5, 7][tier], half = Math.ceil(s * 2 + 1);
      c = document.createElement('canvas');
      c.width = c.height = half * 2 * SPRITE_SCALE;
      const x = c.getContext('2d');
      x.scale(SPRITE_SCALE, SPRITE_SCALE);
      x.translate(half, half);
      x.fillStyle = col + '33'; circle(x, 0, 0, s * 2);
      x.fillStyle = col;
      x.beginPath(); x.moveTo(0, -s * 1.4); x.lineTo(s, 0); x.lineTo(0, s * 1.4); x.lineTo(-s, 0); x.closePath(); x.fill();
      x.fillStyle = 'rgba(255,255,255,0.7)'; x.fillRect(-1, -s * 0.8, 1.6, s * 0.7);
      c.half = half;
      this.cache.set(key, c);
      return c;
    }

    drawProjectiles(ctx) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      for (const pr of this.g.projectiles) {
        const k = pr.kind === 'pellet' ? 0.022 : 0.035;
        ctx.strokeStyle = pr.kind === 'pellet' ? '#ffb35a' : '#ffd98a';
        ctx.lineWidth = pr.kind === 'pellet' ? 2 : 2.6;
        ctx.beginPath(); ctx.moveTo(pr.x - pr.vx * k, pr.y - pr.vy * k); ctx.lineTo(pr.x, pr.y); ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    drawLobs(ctx) {
      for (const l of this.g.lobs) {
        if (l.t < 0) continue;
        const k = l.t / l.dur;
        const x = U.lerp(l.x0, l.x1, k), y = U.lerp(l.y0, l.y1, k), h = Math.sin(k * Math.PI) * 70;
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; circle(ctx, x, y, 4);
        ctx.fillStyle = '#4b5a2e'; circle(ctx, x, y - h, 5);
        ctx.fillStyle = '#e3a33b'; circle(ctx, x + 1.5, y - h - 2, 1.5);
      }
    }

    drawEffects(ctx, overDark) {
      for (const f of this.g.effects) {
        const a = Math.max(0, f.life / f.max);
        if (f.kind === 'slash' && !overDark) {
          ctx.save();
          ctx.translate(f.x, f.y); ctx.rotate(f.ang);
          const L = f.len, W = f.wid / 2, grow = 1 - a * 0.3;
          ctx.fillStyle = `rgba(236,228,210,${0.85 * a})`;
          ctx.beginPath();
          ctx.moveTo(L * 0.15, -W);
          ctx.quadraticCurveTo(L * 1.2 * grow, 0, L * 0.15, W);
          ctx.quadraticCurveTo(L * 0.75 * grow, 0, L * 0.15, -W);
          ctx.fill();
          ctx.strokeStyle = `rgba(200,40,30,${0.7 * a})`; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(L * 0.2, -W * 0.9); ctx.quadraticCurveTo(L * 1.1 * grow, 0, L * 0.2, W * 0.9); ctx.stroke();
          ctx.restore();
        } else if (f.kind === 'burst' && !overDark) {
          const r = f.r * (1.1 - a * 0.6);
          ctx.fillStyle = `rgba(185,201,74,${0.45 * a})`; circle(ctx, f.x, f.y, r);
          ctx.strokeStyle = `rgba(230,255,140,${0.8 * a})`; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, TAU); ctx.stroke();
        } else if (f.kind === 'bolt' && overDark) {
          ctx.globalCompositeOperation = 'lighter';
          const pts = f.points;
          for (const [col, lw] of [[`rgba(120,190,255,${0.5 * a})`, 5], [`rgba(235,248,255,${a})`, 1.6]]) {
            ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineJoin = 'round';
            ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
            for (let i = 2; i < pts.length; i += 2) {
              const x0 = pts[i - 2], y0 = pts[i - 1], x1 = pts[i], y1 = pts[i + 1];
              const segs = 5;
              for (let s = 1; s <= segs; s++) {
                const k = s / segs, j = s === segs ? 0 : 12;
                ctx.lineTo(U.lerp(x0, x1, k) + U.rand(-j, j), U.lerp(y0, y1, k) + U.rand(-j, j));
              }
            }
            ctx.stroke();
          }
          ctx.globalCompositeOperation = 'source-over';
        }
      }
    }

    drawParticles(ctx) {
      for (const q of this.g.particles) {
        ctx.globalAlpha = Math.max(0, q.life / q.max);
        ctx.fillStyle = q.color;
        ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
      }
      ctx.globalAlpha = 1;
    }

    drawTexts(ctx) {
      ctx.textAlign = 'center';
      ctx.font = `700 12px ${FONT_MONO}`;
      for (const t of this.g.texts) {
        ctx.globalAlpha = Math.min(1, t.life / t.max * 1.6);
        const col = t.kind === 'hurt' ? '#ff5a4a' : t.kind === 'heal' ? '#7ddc6a' : t.kind === 'credit' ? '#e3a33b' : '#ebe2cf';
        ctx.fillStyle = 'rgba(0,0,0,0.8)';
        ctx.fillText(t.val, t.x + 1, t.y + 1);
        ctx.fillStyle = col;
        ctx.fillText(t.val, t.x, t.y);
      }
      ctx.globalAlpha = 1;
    }

    // ---------------------------------------------------------------- darkness
    drawDarkness() {
      const g = this.g, p = g.player, d = this.dctx, W = this.dark.width, H = this.dark.height;
      const z = g.zoom * 0.5, cam = this.cam, sx = this.sx * 0.5, sy = this.sy * 0.5;
      const X = (wx) => (wx - cam.x) * z + sx, Y = (wy) => (wy - cam.y) * z + sy;
      const punch = (wx, wy, r, i) => {
        const cx = X(wx), cy = Y(wy), R = r * z;
        if (cx + R < 0 || cy + R < 0 || cx - R > W || cy - R > H) return;
        const gr = d.createRadialGradient(cx, cy, 0, cx, cy, R);
        gr.addColorStop(0, `rgba(0,0,0,${i})`);
        gr.addColorStop(0.5, `rgba(0,0,0,${i * 0.8})`);
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        d.fillStyle = gr; d.beginPath(); d.arc(cx, cy, R, 0, TAU); d.fill();
      };

      d.globalCompositeOperation = 'source-over';
      d.clearRect(0, 0, W, H);
      d.fillStyle = 'rgba(3,5,4,0.86)';
      d.fillRect(0, 0, W, H);
      d.globalCompositeOperation = 'destination-out';

      punch(p.x, p.y, OO.CONFIG.LIGHT_RADIUS, 1);
      // flashlight cone in the facing direction
      const cx = X(p.x), cy = Y(p.y), R = 560 * z, a = p.faceAngle;
      const cg = d.createRadialGradient(cx, cy, 0, cx, cy, R);
      cg.addColorStop(0, 'rgba(0,0,0,0.75)'); cg.addColorStop(0.6, 'rgba(0,0,0,0.45)'); cg.addColorStop(1, 'rgba(0,0,0,0)');
      d.fillStyle = cg;
      d.beginPath(); d.moveTo(cx, cy); d.arc(cx, cy, R, a - 0.42, a + 0.42); d.closePath(); d.fill();

      for (const zn of g.zones) punch(zn.x, zn.y, zn.r * 2.6, 0.85 * Math.min(1, zn.life / 0.4));
      for (const l of g.lights) punch(l.x, l.y, l.r, l.i * Math.max(0, l.life / l.max));
      for (const pk of g.pickups) if (pk.kind === 'case') punch(pk.x, pk.y, 90, 0.6);

      this.ctx.globalAlpha = 1 - g.flashWhite * 0.8;
      this.ctx.drawImage(this.dark, 0, 0, this.w, this.h);
      this.ctx.globalAlpha = 1;
    }

    // ---------------------------------------------------------------- screen space
    drawScreenFx() {
      const g = this.g, p = g.player, ctx = this.ctx, w = this.w, h = this.h;
      const low = p.hp / p.stats.maxHp < 0.3;
      const hurtA = Math.max(0, p.hurt / 0.3) * 0.55 + (low ? 0.25 + Math.sin(g.time * 6) * 0.12 : 0);
      if (hurtA > 0.01) {
        const gr = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
        gr.addColorStop(0, 'rgba(120,0,0,0)');
        gr.addColorStop(1, `rgba(150,8,4,${hurtA})`);
        ctx.fillStyle = gr; ctx.fillRect(0, 0, w, h);
      }
      if (g.flashWhite > 0) {
        ctx.fillStyle = `rgba(255,244,220,${g.flashWhite * 0.85})`;
        ctx.fillRect(0, 0, w, h);
      }
    }

    drawHud() {
      const g = this.g, p = g.player, ctx = this.ctx, W = this.w;
      const top = 0;

      // XP bar: the DNA sample meter
      const bh = 14;
      ctx.fillStyle = 'rgba(8,10,9,0.9)'; ctx.fillRect(0, top, W, bh);
      const prog = U.clamp(p.xp / p.xpNext, 0, 1);
      ctx.fillStyle = '#2f8f80'; ctx.fillRect(0, top, W * prog, bh);
      ctx.fillStyle = '#56d6c0'; ctx.fillRect(0, top, W * prog, 4);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      for (let x = 6; x < W * prog; x += 9) ctx.fillRect(x, top + 4, 2, bh - 4);
      ctx.fillStyle = '#3a3a34'; ctx.fillRect(0, top + bh, W, 1);
      ctx.font = `700 11px ${FONT_MONO}`;
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#0d0f0e'; ctx.fillText('LV ' + p.level, W - 7, top + bh / 2 + 1);
      ctx.fillStyle = '#ebe2cf'; ctx.fillText('LV ' + p.level, W - 8, top + bh / 2);

      // Timer
      const remaining = OO.CONFIG.RUN_LENGTH - g.time;
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.font = `800 ${W < 560 ? 28 : 34}px ${FONT_DISPLAY}`;
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillText(U.formatTime(g.time), W / 2 + 2, top + 22);
      ctx.fillStyle = remaining < 60 ? '#e3a33b' : '#ebe2cf';
      ctx.fillText(U.formatTime(g.time), W / 2, top + 20);
      ctx.font = `500 10px ${FONT_MONO}`;
      ctx.fillStyle = '#8f8a7d';
      ctx.fillText('EVAC IN ' + U.formatTime(remaining), W / 2, top + 58);

      // Kills and credits (left of the DOM pause/mute buttons)
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.font = `700 14px ${FONT_MONO}`;
      const narrow = W < 560;
      const rx = narrow ? W - 10 : W - 128, ky = narrow ? 68 : 34, cy = narrow ? 86 : 54;
      ctx.fillStyle = '#ebe2cf'; ctx.fillText(String(g.kills), rx, top + ky);
      ctx.drawImage(OO.Icons.image('skull', 14, '#ebe2cf'), rx - ctx.measureText(String(g.kills)).width - 20, top + ky - 7, 14, 14);
      ctx.fillStyle = '#e3a33b'; ctx.fillText(String(g.credits), rx, top + cy);
      ctx.drawImage(OO.Icons.image('credits', 14, '#e3a33b'), rx - ctx.measureText(String(g.credits)).width - 20, top + cy - 7, 14, 14);

      // Weapon and gear slots
      const slot = 30, gap = 4, x0 = 10;
      const drawSlot = (x, y, icon, lvl, max, color) => {
        ctx.fillStyle = 'rgba(8,10,9,0.72)'; ctx.fillRect(x, y, slot, slot);
        ctx.strokeStyle = lvl >= max ? '#e3a33b' : '#3a3a34'; ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, slot - 1, slot - 1);
        ctx.drawImage(OO.Icons.image(icon, 20, color), x + 5, y + 4, 20, 20);
        const pip = (slot - 6) / max;
        for (let i = 0; i < max; i++) {
          ctx.fillStyle = i < lvl ? color : 'rgba(235,226,207,0.15)';
          ctx.fillRect(x + 3 + i * pip, y + slot - 4, Math.max(1, pip - 1), 2);
        }
      };
      p.weapons.forEach((w, i) => drawSlot(x0 + i * (slot + gap), top + 22, w.def.icon, w.level, w.maxLevel, '#e3a33b'));
      p.passiveOrder.forEach((id, i) => drawSlot(x0 + i * (slot + gap), top + 22 + slot + gap, OO.PASSIVES[id].icon, p.passives[id], OO.PASSIVES[id].max, '#56d6c0'));

      // Boss health
      const bosses = g.bosses;
      if (bosses.length) {
        let hp = 0, max = 0;
        for (const b of bosses) { hp += Math.max(0, b.hp); max += b.maxHp; }
        const bw = Math.min(440, W - 40), bx = (W - bw) / 2, by = top + (W < 560 ? 116 : 92);
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.font = `800 15px ${FONT_DISPLAY}`;
        ctx.fillStyle = '#ff5a4a';
        ctx.fillText(bosses.length > 1 ? 'THE STALKERS' : 'THE STALKER', W / 2, by - 2);
        ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(bx - 2, by - 1, bw + 4, 10);
        ctx.fillStyle = '#5e0f0c'; ctx.fillRect(bx, by + 1, bw, 6);
        ctx.fillStyle = '#d4291f'; ctx.fillRect(bx, by + 1, bw * (hp / max), 6);
      }
      ctx.textBaseline = 'alphabetic';
    }

    drawStick() {
      const s = OO.Input.stick, ctx = this.ctx;
      if (!s.active || this.g.state !== 'playing') return;
      const dx = s.x - s.sx, dy = s.y - s.sy, d = Math.hypot(dx, dy), m = Math.min(d, s.max);
      const kx = s.sx + (d ? (dx / d) * m : 0), ky = s.sy + (d ? (dy / d) * m : 0);
      ctx.strokeStyle = 'rgba(235,226,207,0.3)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(s.sx, s.sy, s.max, 0, TAU); ctx.stroke();
      ctx.fillStyle = 'rgba(235,226,207,0.35)'; circle(ctx, kx, ky, 22);
    }

    drawDebug() {
      const g = this.g, ctx = this.ctx;
      const lines = [
        'FPS ' + g.fps.toFixed(0),
        'enemies ' + g.enemies.length + '  projectiles ' + g.projectiles.length,
        'pickups ' + g.pickups.length + '  particles ' + g.particles.length,
        'wave ' + Math.floor(g.time / 60) + '  zoom ' + g.zoom.toFixed(2),
        '[L] level  [T] +1 min  [H] heal  [B] boss',
      ];
      ctx.font = `500 11px ${FONT_MONO}`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(8, this.h - 18 * lines.length - 16, 300, 18 * lines.length + 8);
      ctx.fillStyle = '#9ee05a';
      lines.forEach((l, i) => ctx.fillText(l, 14, this.h - 18 * lines.length - 12 + i * 18));
      ctx.textBaseline = 'alphabetic';
    }
  }

  OO.Renderer = Renderer;
})(window.OO = window.OO || {});
