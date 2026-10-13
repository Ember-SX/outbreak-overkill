// Headless balance runner: plays full runs with two simple bots and reports survival times.
//
//   npm run sim                      Standard, 2 runs per operative per bot
//   npm run sim -- standard 3        threat level, runs per combination (locked levels fall back to Standard)
//
// Bots: "random" picks upgrades at random; "smart" prefers owned weapons and evolution
// partners, and runs behind the nearest obstacle when a stampede is coming.
// Both kite away from nearby infected, sidestep acid, and grab nearby pickups.
// They are far worse than a person, so compare numbers before/after a change rather
// than reading them as absolute difficulty.
//
// Set PW_CHROMIUM=/path/to/chromium to use a specific browser binary.
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const difficulty = process.argv[2] || 'standard';
const runs = Number(process.argv[3] || 2);

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
page.on('pageerror', (e) => console.error('page error:', e.message));
await page.goto(pathToFileURL(join(root, 'index.html')).href);
await page.waitForFunction(() => window.OO && OO.game);

const results = await page.evaluate(({ difficulty, runs }) => {
  const g = OO.game;
  g.ui.banner = () => {};
  g.setDifficulty(difficulty);
  // Don't let simulated runs touch the real Armory bank or records.
  const savedMeta = JSON.stringify(g.meta), savedRecords = JSON.stringify(g.records);
  g.meta = { bank: 0, ranks: {} };

  // Attribute damage taken to its source.
  const src = {};
  for (const fn of ['updateEnemies', 'processExplosions', 'updateHazards', 'updateEnemyShots']) {
    const orig = g[fn].bind(g);
    g[fn] = (...a) => { const h = g.player.hp; const r = orig(...a); const d = h - g.player.hp; if (d > 0) src[fn] = (src[fn] || 0) + d; return r; };
  }

  const PREF = ['might', 'amount', 'cooldown', 'area', 'maxhp', 'armor', 'magnet', 'speed'];
  const smartPick = (opts) => {
    let best = null, bs = -1;
    for (const o of opts) {
      let s = Math.random() * 0.5;
      if (o.kind === 'weapon') s += g.getWeapon(o.id) ? 4 : (g.player.weapons.length < 4 ? 3 : 1);
      if (o.kind === 'passive') {
        s += 2 + (8 - PREF.indexOf(o.id)) * 0.2;
        for (const w of g.player.weapons) { const E = OO.EVOLUTIONS[w.id]; if (E && E.needs === o.id) s += 1.5; }
      }
      if (s > bs) { bs = s; best = o; }
    }
    return best;
  };

  const steer = (bot) => {
    const p = g.player;
    let fx = 0, fy = 0, danger = false;
    for (const e of g.enemies) {
      if (e.dead || e.def.crate) continue;
      const dx = p.x - e.x, dy = p.y - e.y, d2 = dx * dx + dy * dy;
      if (d2 < 220 * 220) { const w = 1 / Math.max(d2, 100); fx += dx * w; fy += dy * w; }
      if (d2 < 70 * 70) danger = true;
    }
    for (const h of g.hazards) {
      const dx = p.x - h.x, dy = p.y - h.y, d2 = dx * dx + dy * dy;
      if (d2 < (h.r + 40) ** 2) { fx += (dx / Math.max(d2, 50)) * 3; fy += (dy / Math.max(d2, 50)) * 3; }
    }
    for (const s of g.enemyShots) {
      const dx = p.x - s.x1, dy = p.y - s.y1, d2 = dx * dx + dy * dy;
      if (d2 < (s.r + 30) ** 2) { fx += (dx / Math.max(d2, 50)) * 4; fy += (dy / Math.max(d2, 50)) * 4; }
    }
    fx += Math.cos(g.time * 0.25) * 0.004; fy += Math.sin(g.time * 0.25) * 0.004;
    if (!danger) {
      let best = null, bd = 260 * 260;
      for (const k of g.pickups) { const d2 = (k.x - p.x) ** 2 + (k.y - p.y) ** 2; if (d2 < bd) { bd = d2; best = k; } }
      if (best) { const d = Math.sqrt(bd) || 1; fx += ((best.x - p.x) / d) * 0.02; fy += ((best.y - p.y) / d) * 0.02; }
    }
    if (bot === 'smart' && g.stampedes.length) {
      const L = g.stampedeLane(g.stampedes[0]);
      let bo = null, bd = Infinity;
      for (const o of g.world.list) { const d2 = (o.x - p.x) ** 2 + (o.y - p.y) ** 2; if (d2 < bd) { bd = d2; bo = o; } }
      if (bo) {
        const ext = bo.kind === 'circle' ? bo.r : Math.max(bo.hw, bo.hh) * 0.5;
        const dx = bo.x + L.dx * (ext + 26) - p.x, dy = bo.y + L.dy * (ext + 26) - p.y, d = Math.hypot(dx, dy) || 1;
        if (d > 6) { fx = dx / d; fy = dy / d; } else { fx = 0; fy = 0; }
      }
    }
    const l = Math.hypot(fx, fy);
    OO.Input.axis.x = l ? fx / l : 0;
    OO.Input.axis.y = l ? fy / l : 0;
  };

  const out = [];
  for (const ch of Object.keys(OO.CHARACTERS)) {
    for (const bot of ['random', 'smart']) {
      for (let r = 0; r < runs; r++) {
        for (const k in src) delete src[k];
        g.start(ch);
        let steps = 0;
        while (g.state !== 'results' && steps++ < 60 * 60 * 16) {
          steer(bot);
          if (g.state === 'playing') g.update(1 / 60);
          else if (g.state === 'levelup') g.chooseUpgrade(bot === 'smart' ? smartPick(g.ui.options) : g.ui.options[Math.floor(Math.random() * g.ui.options.length)]);
          else if (g.state === 'chest') g.closeChest();
        }
        out.push({
          ch, bot, won: g.time >= OO.CONFIG.RUN_LENGTH, time: Math.round(g.time), level: g.player.level, kills: g.kills,
          weapons: g.player.weapons.map((w) => w.id + (w.def.evolved ? '*' : w.level)).join(' '),
          damage: Object.entries(src).map(([k, v]) => k.replace(/^(update|process)/, '') + ' ' + Math.round(v)).join(', '),
        });
      }
    }
  }
  g.meta = JSON.parse(savedMeta); g.saveMeta();
  g.records = JSON.parse(savedRecords); OO.U.storage.set('oo.records', g.records);
  return out;
}, { difficulty, runs });

const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
console.log(`\n${difficulty}, ${runs} run(s) per operative per bot\n`);
for (const r of results) {
  console.log(`${r.ch.padEnd(5)} ${r.bot.padEnd(6)} ${r.won ? 'EVAC ' : 'died '} ${fmt(r.time).padStart(5)}  L${String(r.level).padEnd(3)} ${String(r.kills).padStart(6)} kills  [${r.weapons}]  dmg: ${r.damage}`);
}
for (const bot of ['random', 'smart']) {
  const rs = results.filter((r) => r.bot === bot);
  const avg = rs.reduce((a, r) => a + r.time, 0) / rs.length;
  console.log(`\n${bot.padEnd(6)} bot: ${rs.filter((r) => r.won).length}/${rs.length} evacuated, average survival ${fmt(Math.round(avg))}`);
}
await browser.close();
