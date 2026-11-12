/*
 * Outbreak Overkill — game data.
 * Everything tunable lives here: enemies, weapons, passives, operatives and the wave script.
 * Balance changes should almost always be edits to this file only.
 */
(function (OO) {
  'use strict';

  OO.VERSION = '0.13.0';

  OO.CONFIG = {
    RUN_LENGTH: 15 * 60,          // seconds until evac arrives (victory); where overtime starts in Infinite Mode
    // Rendering is capped at MAX_FPS frames per second on high-refresh displays. The simulation
    // always runs in fixed 1/60 s steps regardless of the frame rate.
    MAX_FPS: 120,
    MAX_ENEMIES: 500,
    // Ground items. Every pickup has a lifetime (seconds; 0 = never despawns) and blinks for the
    // last `blink` seconds. Past maxGems, the oldest DNA sample on the ground is recycled and its
    // XP rides along with the new drop, so no XP is lost to the cap. Past maxOther, the oldest
    // non-gem pickup (herb, credits, scanner, flare) is removed. Dropped supply cases despawn
    // after life.case seconds.
    // Supply crates (the wooden boxes on the map): pass-through (they block nothing), opened by
    // walking over them, and they never time out. A crate left more than recycleDist from every
    // operative is quietly cleared off-screen so the director can place fresh ones nearby.
    CRATES: { recycleDist: 1600 },
    // Supply cases (Brute and boss drops): when an operative has nothing left to level, each roll
    // becomes an Apex mutation plus apexXp of a level in XP.
    CASES: { apexXp: 0.3 },
    PICKUPS: {
      maxGems: 320,
      maxOther: 60,
      // Supply cases auto-collect on contact (no case screen) and despawn after 20 s like everything else.
      life: { xp: 60, herb: 45, credit: 45, magnet: 45, bomb: 45, case: 20 },
      blink: 5,
      // Pickup magnetism comes only from the operative's pickup radius: PLAYER.pickupRange raised by
      // Magnetic upgrade levels alone (Scavenger Pack +30% per level, including Rin's free level,
      // and the Armory's Sample Collector +15% per rank), capped at maxMagnet. The scanner pickup
      // pulls DNA within scannerReach x that radius instead of the whole map.
      maxMagnet: 280,
      scannerReach: 3,
    },
    // Engine limits, so deep Infinite runs stay smooth. Player projectiles past maxProjectiles are
    // not fired; no projectile flies faster than maxProjectileSpeed; weapon area is capped at
    // maxArea; and no blast, pool, shockwave or flashbang reaches past aoeScreen x the wider of the
    // two players' view widths (just beyond a full screen across).
    LIMITS: { maxProjectiles: 700, maxProjectileSpeed: 1400, maxArea: 5, maxAmount: 12, aoeScreen: 0.55, aoeMin: 520 },
    MAX_WEAPONS: 6,
    MAX_PASSIVES: 6,
    LIGHT_RADIUS: 330,            // flashlight radius in world units
    // Enemy leveling ("strain level"). Every infected spawns at the current strain level, and its
    // HP is multiplied by (1 + hpGrowth)^level on top of the threat level's HP multiplier.
    // level = floor(minutes * perMinute + adapt). `adapt` is the dynamic part: it climbs while too
    // many kills are one-hit kills (one-hit share above `target`) and slowly falls back when the
    // infected start soaking hits again. It never goes below 0 or above `max`.
    LEVELING: {
      perMinute: 1,
      // Enemy HP stops growing at 13:00: the clock part of the strain level, the surge HP
      // multiplier and the adaptive bonus all freeze there (damage keeps climbing).
      hpCapTime: 780,
      hpGrowth: { normal: 0.14, elite: 0.12, boss: 0.10 },
      adapt: {
        target: 0.4,     // aim for at most ~40% of regular kills being one-hit kills
        gain: 0.06,      // levels per second per unit of one-hit share above target
        decay: 0.02,     // levels per second lost while one-hit share is well under target
        max: 10,
        smoothing: 0.03, // weight of each new kill in the rolling one-hit share
        grace: 60,       // seconds before adaptation starts
        minSamples: 20,
      },
      announceEvery: 5,  // banner at strain level 5, 10, 15...
    },
    // Late-game surge. From `start` minutes on, enemy HP and damage compound every minute on top of
    // the strain level, so late builds stop deleting the horde before it reaches you.
    // HP x(1 + hpPerMin)^(minutes past start), damage x(1 + dmgPerMin)^(minutes past start).
    // The Stalker gets hpPerMin * bossHpScale. Burster blasts skip the damage surge (they're
    // already lethal and can't be fought).
    SURGE: {
      start: 6, hpPerMin: 0.20, dmgPerMin: 0.12, bossHpScale: 0.5,
      // Damage surge pacing as [minute, effective surge minutes] points, interpolated linearly
      // (past the last point it climbs one effective minute per minute): a steady climb from
      // 6:00 to 13:00, then the full rate for the last two minutes.
      dmgCurve: [[6, 0], [13, 6]],
      bossDmgScale: 0.75,         // Stalkers get 3/4 of the damage surge exponent (the mech gets all of it)
    },
    // Enemy damage before difficulty and surge: base x (1 + perMin x minutes). Applies to every
    // attack: contact, Spitter acid, Bloater and Burster blasts, and the Hare Trigger.
    THREAT: { base: 1.3, perMin: 0.06 },
    // The one hard rule: no single hit kills a healthy operative. Every hit from every source is
    // capped at this share of the target's max HP (by minute, interpolated) before armor, and
    // every hit grants i-frames, so deaths always take several hits in a row.
    HIT_CEILING: [[0, 0.45], [8, 0.55], [13, 0.62], [15, 0.68]],
    // Co-op (2 players over P2P). Enemy HP is multiplied while a partner is connected.
    // A player at 0 HP goes down; standing within reviveRadius of them for reviveTime seconds
    // brings them back at reviveHp of max HP. The run ends when both are down.
    COOP: {
      enemyHp: 1.5,          // 150% enemy health while a partner is connected
      reviveTime: 3,
      reviveRadius: 70,
      reviveHp: 0.35,
      snapshotHz: 15,        // host -> client world updates per second
      inputHz: 30,           // client -> host position updates per second
      peerPrefix: 'outbreak-overkill-v1-',   // room 427 is peer id outbreak-overkill-v1-427
    },
    // Burster stampede: warning time, when the lane locks (seconds before launch), row spacing.
    // Bursters charge in a dead-straight line once launched (no homing), so cover always works.
    // v0.13: every stampede, from the first at 2:45 to the last in Infinite overtime, is the same
    // fixed size, the one the 15:00 stampede had: a solid row `count` Bursters wide (count x
    // spacing = 660 px) and `ranks` rows deep (rankGap apart). Only how often they come changes.
    STAMPEDE: { warn: 3.0, lockAt: 0.8, spacing: 44, count: 15, ranks: 2, rankGap: 60 },
    // Spitters hang back and are easy to ignore, so cap how many can be alive: 1 + 0.5/min, max 7.
    spitterCap(minute) { return Math.min(7, 1 + Math.floor(minute * 0.5)); },
    // Volatile drums: share of 'barrels' obstacles that are red fuel drums. A bullet, pellet, fire
    // pool or nearby blast lights the fuse; then they explode, chain into other drums, and are gone
    // for the rest of the run. Damage to infected scales with the horde (multiples of a Shambler's
    // current HP; elites and bosses lose a share of their max HP). Players in the blast take a hit
    // like any other (capped by HIT_CEILING, blocked by cover).
    HAZARDS: {
      volatileShare: 0.6, fuse: 0.55, chainFuse: 0.22, r: 105,
      playerDmg: 14,               // before THREAT scaling (no surge)
      shamblerHits: 5,             // regular infected take 5x a Shambler's current HP
      eliteShare: 0.25, bossShare: 0.04,
    },
    // Tactical call-downs (key Q, or the button at the bottom of the screen). One is equipped per run
    // (Dossier > Call-downs). All of them start the run charging (firstCharge seconds).
    CALLDOWN: {
      firstCharge: 20,
      flashbang: { cd: 30, r: 300, stun: 2.6, eliteStun: 1.6, bossStun: 0.8 },
      sentry:    { cd: 50, life: 15, range: 360, rate: 0.16, shamblerHits: 0.55, bossShare: 0.0015 },
      meddrone:  { cd: 70, heal: 0.35, dur: 4 },
      airstrike: { cd: 90 },
    },
    // Infinite Mode: the run doesn't stop at 15:00 (RUN_LENGTH); it goes on until the team is
    // overrun. From there on ("overtime", m = minutes past 15:00):
    //   HP  x (1 + hpLin * m)                        linear-additive, no compounding (v0.13);
    //                                                bosses use hpLin x bossHpScale
    //   DMG x (1 + dmgLin * m) * (1 + dmgPerMin)^m   hybrid (the per-hit ceiling caps every hit)
    // 0:00-15:00 is untouched (m = 0). Speed rises +speedPerMin per minute up to +maxSpeed. Late
    // difficulty comes from crowding (the director refills up to refillMax times faster with
    // bigger batches, and mixes in Brutes) and from stampedes: same fixed size as ever, every
    // `every.stampede` seconds minus stampedeFaster per minute (floor stampedeMin), and from
    // crossFrom minutes every second one is a crossfire pair. Stalker hunts, skinner rings and the
    // Hare Trigger repeat too.
    //   Necrosis: all healing is multiplied by max(minHeal, 1 - necrosisPerMin * m).
    // Apex mutations (OO.APEX) only appear in overtime. Heavy ones have hard stack caps, damage
    // stacking has diminishing returns (APEX_FX.falloff), light ones never run out.
    INFINITE: {
      hpLin: 0.2, bossHpScale: 0.6, dmgLin: 0.06, dmgPerMin: 0.03,
      speedPerMin: 0.02, maxSpeed: 0.5,
      necrosisPerMin: 0.03, minHeal: 0.3,
      refillPerMin: 0.1, refillMax: 3,   // spawn interval / min(refillMax, 1 + refillPerMin * m)
      batchEvery: 2,                     // +1 enemy per spawn batch every batchEvery minutes
      brutePerMin: 0.15, bruteMax: 2.5,   // Brute weight added to the spawn pool per overtime minute (capped: ~15% of spawns)
      eliteCaseChance: 0.2,        // overtime Brutes drop a supply case only this often (it'd be a case every few seconds)
      every: { stampede: 55, ring: 90, stalker: 120, mecha: 300 },
      stampedeFaster: 1, stampedeMin: 25, crossFrom: 15,
      // Payout: the run up to the mark pays as in Standard; overtime adds overtimeCredits per full
      // minute, 1 credit per overtimeKillsPerCredit kills and overtimePickupShare of credits picked up.
      overtimeCredits: 15, overtimeKillsPerCredit: 200, overtimePickupShare: 0.1,
      apexInOvertime: 1,           // Apex options guaranteed on each level-up during overtime
      // Overtime XP: each level costs (1 + xpLin*x + xpQuad*x^2) times the standard curve, with
      // x = level - max(xpFrom, level at 15:00). Before 15:00 it's the standard curve exactly.
      // Steep and steady (polynomial, never an exponential wall): +40 levels costs x5.2, +100 x18.
      xpFrom: 60, xpLin: 0.06, xpQuad: 0.0011,
    },
    PLAYER: { radius: 14, speed: 140, maxHp: 100, pickupRange: 80, iframes: 0.45 },
    // Damage reduction from Kevlar Vest (per rank) and Trauma Plates (per Armory rank), capped.
    MITIGATION: { vestDr: 0.07, platesDr: 0.06, platesArmor: 2, maxDr: 0.5 },
    xpToNext(level) {
      if (level < 20) return 5 + (level - 1) * 8;
      if (level < 40) return 157 + (level - 20) * 12;
      return 397 + (level - 40) * 16;
    },
  };

  // ---------------------------------------------------------------- ENEMIES
  // hp/dmg scale with time in game.spawnEnemy(). r = collision radius. mass = knockback resistance.
  OO.ENEMIES = {
    shambler: { name: 'Shambler',    hp: 12,   speed: 40, dmg: 8,  r: 13, xp: 1,   mass: 1,   body: '#56613f', skin: '#7f8b61', eye: '#ffd24a', blood: 'red' },
    hound:    { name: 'Rot Hound',   hp: 9,    speed: 100, dmg: 7,  r: 11, xp: 1,   mass: 0.6, body: '#4d2a22', skin: '#8b4b3a', eye: '#ff5a2a', blood: 'red' },
    skinner:  { name: 'Skinner',     hp: 36,   speed: 72, dmg: 12, r: 13, xp: 3,   mass: 1.2, body: '#7a211d', skin: '#b8473d', eye: '#fff0e8', blood: 'red' },
    bloater:  { name: 'Bloater',     hp: 70,   speed: 25, dmg: 14, r: 22, xp: 5,   mass: 3,   body: '#666e2c', skin: '#a2ad48', eye: '#eaff7a', blood: 'bile',
                explode: { r: 78, dmg: 16, enemyDmg: 45 } },
    spitter:  { name: 'Spitter',     hp: 28,   speed: 52, dmg: 6,  r: 13, xp: 3,   mass: 1,   body: '#33502a', skin: '#86b542', eye: '#e2ff6a', blood: 'bile',
                // Keeps its distance, swells up, then lobs acid where you're heading. The pool lingers.
                ranged: { min: 150, max: 240, cd: [3.0, 4.2], windup: 0.6, flight: 0.85, splash: 34, impact: 10,
                          pool: { r: 40, life: 3.6, tick: 0.35, dmg: 5 } } },
    burster:  { name: 'Burster',     hp: 6,    speed: 430, dmg: 0, r: 10, xp: 0,   mass: 0.5, body: '#6a1830', skin: '#c94f6c', eye: '#ffe6e6', blood: 'red',
                // Only arrive in stampedes (see OO.EVENTS kind 'stampede'). Explode on contact with you or cover.
                // Invulnerable: nothing damages them, auto-aim ignores them, bullets glance off. Cover is the answer.
                invulnerable: true,
                burster: { r: 64, dmg: 120, enemyDmg: 90 } },   // v0.13: dmg 50 -> 120, lands at the per-hit ceiling
    brute:    { name: 'Brute',       hp: 450,  speed: 42, dmg: 18, r: 26, xp: 25,  mass: 10,  body: '#3c3e46', skin: '#6c707c', eye: '#ff3a30', blood: 'red', elite: true },
    stalker:  { name: 'The Stalker', hp: 4800, speed: 58, dmg: 30, r: 32, xp: 120, mass: 40,  body: '#1b1620', skin: '#3b2d45', eye: '#ff2444', blood: 'red', boss: true },
    // Final boss. Lab subject B-0 "Biscuit", a very small and very angry rabbit, at the controls of
    // the HARE TRIGGER combat frame. Hunts the nearest operative, rocket-jumps onto you, fires
    // carrot missiles at marked ground and, below half health, sweeps a visor laser. Cover blocks
    // missiles and the laser, not the landing shockwave.
    mecha:    { name: 'Hare Trigger', pilot: 'Biscuit', hp: 7200, speed: 66, dmg: 32, r: 40, xp: 400, mass: 80,
                body: '#3b414c', skin: '#d9b23a', eye: '#ff5fb0', blood: 'oil', boss: true, final: true,
                mech: {
                  turn: 2.4,                         // body turn rate (rad/s)
                  attackGap: [2.2, 3.4],             // seconds of walking between attacks (x0.7 in overdrive)
                  // landing shockwave: dmg x contact damage; the target ring locks when the leap starts
                  leap: { range: [200, 640], crouch: 0.75, air: 0.95, r: 125, dmg: 0.8, farLeap: 720 },
                  // no single hit can take more than this share of the target's max HP (before armor)
                  // contact and slam go up to the global HIT_CEILING; volleys and the beam stay lower
                  hitCaps: { slam: 1, contact: 1, missile: 0.5, laser: 0.35 },
                  missiles: { count: 6, overdrive: 9, aim: 0.45, flight: 1.25, stagger: 0.09, r: 58, dmg: 0.6, spread: 150 },
                  laser: { charge: 1.0, sweep: 1.6, turn: 0.6, length: 560, width: 15, dmg: 0.4, tick: 0.12 },
                  overdrive: 0.5,                    // below this share of HP: faster, more missiles, adds the laser
                  overSpeed: 1.25,
                } },
    crate:    { name: 'Supply Crate', hp: 1,   speed: 0,  dmg: 0,  r: 15, xp: 0,   mass: 999, crate: true },
  };

  // ---------------------------------------------------------------- WEAPONS
  // Stats at level N = base + sum(levels[0 .. N-2]). Max level = levels.length + 1.
  // Player passives then multiply dmg / cd / area and add to amount (see Weapon.getStats).
  OO.WEAPONS = {
    pistol: {
      name: 'Service Pistol', icon: 'pistol', desc: 'Fires at the nearest infected.',
      base: { dmg: 10, cd: 0.9, amount: 1, speed: 520, pierce: 1, duration: 1.1, kb: 40 },
      levels: [
        { amount: 1, text: 'Fires 1 more round per volley.' },
        { dmg: 5, text: 'Base damage up by 5.' },
        { amount: 1, cd: -0.1, text: '1 more round. Fires a little faster.' },
        { pierce: 1, text: 'Rounds pass through 1 more target.' },
        { dmg: 5, text: 'Base damage up by 5.' },
        { amount: 1, text: 'Fires 1 more round per volley.' },
        { dmg: 10, pierce: 1, text: 'Base damage up by 10. Rounds pierce 1 more.' },
      ],
    },
    knife: {
      name: 'Combat Knife', icon: 'knife', desc: 'Slashes the way you face and hits everything in the arc.',
      base: { dmg: 14, cd: 1.15, amount: 1, area: 1, kb: 130 },
      levels: [
        { amount: 1, text: 'Adds a backhand slash behind you.' },
        { dmg: 6, text: 'Base damage up by 6.' },
        { area: 0.15, text: 'Slash reach up by 15%.' },
        { dmg: 6, cd: -0.1, text: 'Damage up by 6. Slashes faster.' },
        { area: 0.15, text: 'Slash reach up by 15%.' },
        { dmg: 8, text: 'Base damage up by 8.' },
        { amount: 1, dmg: 6, text: 'Adds a third slash. Damage up by 6.' },
      ],
    },
    shotgun: {
      name: 'Pump Shotgun', icon: 'shotgun', desc: 'Short-range spread with heavy knockback.',
      base: { dmg: 9, cd: 1.4, amount: 5, speed: 640, pierce: 1, duration: 0.33, spread: 0.55, kb: 230 },
      levels: [
        { amount: 2, text: '2 more pellets per shell.' },
        { dmg: 3, text: 'Pellet damage up by 3.' },
        { cd: -0.2, text: 'Racks faster.' },
        { pierce: 1, duration: 0.07, text: 'Pellets pierce 1 more and fly further.' },
        { amount: 2, text: '2 more pellets per shell.' },
        { dmg: 4, text: 'Pellet damage up by 4.' },
        { cd: -0.25, dmg: 3, text: 'Racks faster. Pellet damage up by 3.' },
      ],
    },
    grenade: {
      name: 'Incendiary Grenade', icon: 'grenade', desc: 'Lobs a grenade that leaves a burning pool.',
      base: { dmg: 7, cd: 3.2, amount: 1, area: 1, duration: 2.4, tick: 0.3 },
      levels: [
        { amount: 1, text: 'Throws 1 more grenade.' },
        { area: 0.2, text: 'Fire pools 20% larger.' },
        { dmg: 3, text: 'Burn damage up by 3.' },
        { duration: 0.8, text: 'Pools burn 0.8s longer.' },
        { amount: 1, text: 'Throws 1 more grenade.' },
        { area: 0.2, text: 'Fire pools 20% larger.' },
        { dmg: 5, cd: -0.4, text: 'Burn damage up by 5. Throws faster.' },
      ],
    },
    saw: {
      name: 'Sawblade Drones', icon: 'saw', desc: 'Blades orbit you for a few seconds, then recharge.',
      base: { dmg: 9, cd: 4.2, amount: 1, area: 1, speed: 3.4, duration: 3.2, hitCd: 0.45, kb: 90 },
      levels: [
        { amount: 1, text: 'Adds a drone.' },
        { speed: 0.8, area: 0.1, text: 'Spins faster. Orbit 10% wider.' },
        { dmg: 4, text: 'Blade damage up by 4.' },
        { duration: 0.8, text: 'Drones run 0.8s longer.' },
        { amount: 1, text: 'Adds a drone.' },
        { dmg: 5, text: 'Blade damage up by 5.' },
        { amount: 1, duration: 0.8, text: 'Adds a drone. Runs 0.8s longer.' },
      ],
    },
    tesla: {
      name: 'Tesla Coil', icon: 'tesla', desc: 'Arcs lightning into a random infected, then chains.',
      base: { dmg: 15, cd: 1.9, amount: 1, area: 1, chains: 3 },
      levels: [
        { chains: 1, text: 'Chains to 1 more target.' },
        { dmg: 6, text: 'Bolt damage up by 6.' },
        { amount: 1, text: 'Fires 1 more bolt.' },
        { cd: -0.3, text: 'Recharges faster.' },
        { chains: 2, text: 'Chains to 2 more targets.' },
        { dmg: 8, text: 'Bolt damage up by 8.' },
        { amount: 1, chains: 1, text: '1 more bolt. Chains 1 further.' },
      ],
    },
  };

  // ---------------------------------------------------------------- EVOLUTIONS
  // A max-level weapon + the listed gear (any level) evolves when you open a supply case.
  // Evolved forms reuse the base weapon's behaviour with much stronger stats and one twist.
  const EVOLVED = {
    twinpistols: {
      from: 'pistol', name: 'Twin Auto Pistols', icon: 'pistol',
      desc: 'Two guns, armour-piercing rounds, barely any reload.',
      base: { dmg: 22, cd: 0.5, amount: 4, speed: 680, pierce: 3, duration: 1.2, kb: 50 },
    },
    dragonsbreath: {
      from: 'shotgun', name: "Dragon's Breath", icon: 'shotgun',
      desc: 'Incendiary shells. Pellets that hit can set the ground alight.',
      base: { dmg: 16, cd: 1.0, amount: 11, speed: 700, pierce: 3, duration: 0.42, spread: 0.85, kb: 260, ignite: 0.25 },
    },
    bloodletter: {
      from: 'knife', name: 'Bloodletter', icon: 'knife',
      desc: 'Slashes in every direction at once. Heals 1 HP per kill.',
      base: { dmg: 34, cd: 0.8, amount: 4, area: 1.45, kb: 170, omni: 1, lifesteal: 1 },
    },
    napalm: {
      from: 'grenade', name: 'Napalm Canister', icon: 'grenade',
      desc: 'Four canisters, huge pools, long burn.',
      base: { dmg: 13, cd: 2.4, amount: 4, area: 1.9, duration: 4.5, tick: 0.25 },
    },
    buzzhalo: {
      from: 'saw', name: 'Buzzsaw Halo', icon: 'saw',
      desc: 'Six blades that never stop spinning.',
      base: { dmg: 20, cd: 0.05, amount: 6, area: 1.35, speed: 4.6, duration: 1e9, hitCd: 0.3, kb: 120 },
    },
    arcstorm: {
      from: 'tesla', name: 'Arc Storm', icon: 'tesla',
      desc: 'Near-constant chain lightning across the horde.',
      base: { dmg: 30, cd: 0.75, amount: 3, area: 1.4, chains: 6 },
    },
  };
  for (const id in EVOLVED) {
    OO.WEAPONS[id] = Object.assign({ evolved: true, behaviour: EVOLVED[id].from, levels: [] }, EVOLVED[id]);
  }
  OO.EVOLUTIONS = {
    pistol:  { into: 'twinpistols',   needs: 'amount' },
    shotgun: { into: 'dragonsbreath', needs: 'might' },
    knife:   { into: 'bloodletter',   needs: 'speed' },
    grenade: { into: 'napalm',        needs: 'area' },
    saw:     { into: 'buzzhalo',      needs: 'cooldown' },
    tesla:   { into: 'arcstorm',      needs: 'magnet' },
  };

  // ---------------------------------------------------------------- PASSIVES
  OO.PASSIVES = {
    might:    { name: 'Hollow Points',  icon: 'might',    max: 5, text: '+10% damage for all weapons.' },
    armor:    { name: 'Kevlar Vest',    icon: 'armor',    max: 5, text: '+1 armor and 7% less damage from every hit.' },
    speed:    { name: 'Adrenaline',     icon: 'speed',    max: 5, text: '+8% move speed.' },
    area:     { name: 'Thermite Mix',   icon: 'area',     max: 5, text: '+10% weapon area.' },
    cooldown: { name: 'Speed Loader',   icon: 'cooldown', max: 5, text: '-8% weapon cooldown.' },
    magnet:   { name: 'Scavenger Pack', icon: 'magnet',   max: 5, text: '+30% pickup range.' },
    maxhp:    { name: 'Field Medkit',   icon: 'maxhp',    max: 5, text: '+35 max HP, +0.6 HP/s regeneration, and patches you up for 25 HP.' },
    amount:   { name: 'Extended Mag',   icon: 'amount',   max: 2, text: '+1 projectile, blade or bolt for every weapon.' },
  };

  // ---------------------------------------------------------------- THREAT LEVELS
  // v0.3: what used to be Nightmare (x1.35 HP, x1.25 damage, x1.25 horde size) is the Standard
  // baseline; these are absolute multipliers on the base stats in OO.ENEMIES.
  // v0.13: Nightmare is open. Enemy HP and damage start at 2.0x Standard and every infected moves
  // 1.5x faster; credits pay double. The per-hit ceiling still holds. The look changes with it:
  // blood-red palette, heavy grain and vignette (render.js nightmareFx, css body.nightmare).
  OO.DIFFICULTY = {
    standard:  { name: 'Standard',  hp: 1.35, dmg: 1.25, speed: 1,   count: 1.25, credits: 1, text: 'The intended experience.' },
    nightmare: { name: 'Nightmare', hp: 2.7,  dmg: 2.5,  speed: 1.5, count: 1.25, credits: 2, nightmare: true,
                 text: '2x enemy HP and damage, 1.5x speed. Double credits.' },
  };

  // ---------------------------------------------------------------- ARMORY (meta progression)
  // Permanent upgrades bought between runs with banked credits. cost[i] = price of rank i+1.
  OO.ARMORY = [
    { id: 'vitality', name: 'Vitality Serum',      icon: 'maxhp',    max: 5, cost: [60, 100, 150, 220, 300], text: '+25 max HP and +0.3 HP/s regeneration per rank.' },
    { id: 'power',    name: 'Hollow-Point Stock',  icon: 'might',    max: 5, cost: [80, 130, 190, 260, 350], text: '+5% damage per rank.' },
    { id: 'plating',  name: 'Trauma Plates',       icon: 'armor',    max: 3, cost: [150, 260, 400],          text: '+2 armor and 6% less damage taken per rank.' },
    { id: 'stride',   name: 'Field Training',      icon: 'speed',    max: 3, cost: [70, 130, 200],           text: '+5% move speed per rank.' },
    { id: 'collector',name: 'Sample Collector',    icon: 'magnet',   max: 3, cost: [50, 90, 140],            text: '+15% pickup range per rank.' },
    { id: 'growth',   name: 'Lab Notes',           icon: 'dna',      max: 3, cost: [90, 160, 250],           text: '+8% XP from DNA samples per rank.' },
    { id: 'reroll',   name: 'Requisition Forms',   icon: 'reroll',   max: 3, cost: [100, 180, 280],          text: '+1 level-up reroll per run.' },
    { id: 'greed',    name: 'Black Market Contact', icon: 'credits', max: 3, cost: [60, 120, 200],           text: '+10% credits banked per rank.' },
    { id: 'revive',   name: 'Second Wind',         icon: 'herb',     max: 1, cost: [500],                    text: 'Once per run, get back up at 50% HP.' },
  ];

  // ---------------------------------------------------------------- APEX MUTATIONS (Infinite Mode)
  // Offered past max rank and during overtime. Numbers per stack; recalcStats() and
  // Weapon.getStats() apply them.
  //   max:     hard stack cap. Every mutation that adds projectiles, fire rate, area, damage, HP or
  //            per-tick work is capped (Overclock per weapon), so a deep run can't drag the frame rate.
  //   uncapped (no max): light, stateless picks (a credit multiplier, one-off XP, heal or credits). Once
  //            the capped ones are full these fill the hand, so there is always something to draft.
  //            Field Notes' XP is a share of the *standard* curve, so it shrinks as Infinite levels slow down.
  OO.APEX = {
    overclock: { name: 'Overclock',          icon: null,     weight: 1.6, max: 5, text: 'One weapon past its max level: +20% damage, 6% faster, +1 projectile every second overclock. Up to 5 per weapon.' },
    berserk:   { name: 'Berserker Gene',     icon: 'might',  weight: 1,   max: 8, text: '+25% damage for every weapon.' },
    adrenal:   { name: 'Adrenal Overdrive',  icon: 'cooldown', weight: 1, max: 6, text: 'Every weapon fires 10% faster.' },
    swarm:     { name: 'Hive Swarm',         icon: 'amount', weight: 0.7, max: 4, text: '+1 projectile, blade or bolt for every weapon.' },
    blast:     { name: 'Blast Radius',       icon: 'area',   weight: 0.9, max: 6, text: '+25% weapon area.' },
    titan:     { name: 'Titan Frame',        icon: 'maxhp',  weight: 1,   max: 8, text: '+40 max HP and a full heal (necrosis can\'t stop this one).' },
    regen:     { name: 'Regenerator Cells',  icon: 'herb',   weight: 0.9, max: 8, text: '+2 HP per second.' },
    hemophage: { name: 'Hemophage',          icon: 'dna',    weight: 0.8, max: 6, text: 'Every kill restores 0.25 HP.' },
    sprint:    { name: 'Hyperstride',        icon: 'speed',  weight: 0.7, max: 5, text: '+10% move speed.' },
    phase:     { name: 'Phase Skin',         icon: 'armor',  weight: 0.6, max: 4, text: '+0.15 s of invulnerability after every hit.' },
    pulse:     { name: 'Necrotic Pulse',     icon: 'pulse',  weight: 0.8, max: 5, text: 'Every 4 s a shockwave hits the infected around you. More stacks: harder hits, wider ring.' },
    chain:     { name: 'Volatile Blood',     icon: 'barrel', weight: 0.6, max: 5, text: '+6% chance for an infected you kill to burst like a fuel drum.' },
    hotmic:    { name: 'Hot Mic',            icon: 'beacon', weight: 0.6, max: 5, text: 'Your call-down recharges 30% faster.' },
    // uncapped, stateless
    scav:      { name: "Scavenger's Cut",    icon: 'credits', weight: 0.5, text: '+10% credits from every credit pickup.' },
    notes:     { name: 'Field Notes',        icon: 'dna',    weight: 0.5, text: 'Study the samples: a quarter of a level in XP, right now.' },
    dressing:  { name: 'Field Dressing',     icon: 'herb',   weight: 0.5, text: 'Patch up now: heal 25% of max HP.' },
    cache:     { name: 'Supply Cache',       icon: 'credits', weight: 0.5, text: '+50 credits, right now.' },
  };
  OO.APEX_FX = {
    overclockDmg: 0.2, overclockCd: 0.94,
    // v0.13: damage stacking has diminishing returns. Stack i (from 0) of Berserker Gene, Adrenal
    // Overdrive and an Overclock's damage is worth falloff^i of the first, so n stacks give
    // (1 - falloff^n) / (1 - falloff) "first stacks": 8 Berserker = +104% (was +200%).
    falloff: 0.8,
    stacks(n) { const f = OO.APEX_FX.falloff; return n > 0 ? (1 - Math.pow(f, n)) / (1 - f) : 0; },
    pulse: { every: 4, r: 190, rPerStack: 0.15, shamblerHits: 3, perStack: 0.5, bossShare: 0.25 },
    chain: { chance: 0.06, r: 80 },
  };

  // ---------------------------------------------------------------- CALL-DOWNS
  // Display data; numbers live in CONFIG.CALLDOWN. `unlock` = the commendation that unlocks it.
  OO.CALLDOWNS = {
    flashbang: { name: 'Flashbang',      icon: 'flash',  unlock: null,
                 text: 'Stuns every infected around you for 2.6 s. Elites shake it off faster, bosses barely flinch. Bursters are deaf to it.' },
    sentry:    { name: 'Sentry Turret',  icon: 'turret', unlock: 'body_count.2',   // Body Count II: 3,000 kills in a run
                 text: 'Drops an automated turret for 15 s. It tracks the nearest infected and keeps pace with the strain.' },
    meddrone:  { name: 'Med Drone',      icon: 'drone',  unlock: 'extraction',
                 text: 'A field drone patches you up for 35% of your max HP over 4 s.' },
    airstrike: { name: 'Airstrike Beacon', icon: 'beacon', unlock: 'stalker_down',
                 text: 'Calls in the same strike as a flare pickup: clears the screen around you. Bosses take a heavy hit.' },
  };

  // ---------------------------------------------------------------- OPERATIVES
  OO.CHARACTERS = {
    mara: {
      name: 'Mara Voss', role: 'R.U.S.T. Unit officer', weapon: 'pistol',
      bonus: { might: 0.1 }, bonusText: '+10% damage', vest: '#2f4a5c',
    },
    dex: {
      name: 'Dex Okafor', role: 'Contractor, ex-infantry', weapon: 'shotgun',
      bonus: { maxHp: 30, armor: 1 }, bonusText: '+30 max HP, +1 armor', vest: '#4a4a2c',
    },
    rin: {
      name: 'Rin Sato', role: 'Helix lab technician', weapon: 'tesla',
      bonus: { speed: 0.1, magnetLv: 1 }, bonusText: '+10% speed, +1 Scavenger Pack level', vest: '#5a5f66',
    },
  };

  // ---------------------------------------------------------------- WAVES
  // One entry per minute. pool = weighted enemy types. target = on-field count the
  // director tops up to. interval/batch = steady trickle on top of that.
  // v0.2: minutes 0-2 match v0.1; the horde then grows to +10% (3-5), +20% (6-9) and +30% (10+).
  OO.WAVES = [
    { pool: [['shambler', 1]],                                                   target: 18,  interval: 1.2, batch: 2 },
    { pool: [['shambler', 7], ['hound', 3]],                                     target: 40,  interval: 1.0, batch: 3 },
    { pool: [['shambler', 6], ['hound', 4], ['spitter', 1]],                     target: 60,  interval: 1.0, batch: 3 },
    { pool: [['shambler', 5], ['hound', 2], ['skinner', 3], ['spitter', 1]],     target: 88,  interval: 0.86, batch: 4 },
    { pool: [['shambler', 5], ['hound', 2], ['skinner', 3], ['bloater', 1], ['spitter', 1]], target: 110, interval: 0.86, batch: 5 },
    { pool: [['shambler', 4], ['skinner', 4], ['bloater', 1], ['spitter', 1.5]], target: 121, interval: 0.86, batch: 5 },
    { pool: [['skinner', 6], ['hound', 3], ['bloater', 1], ['spitter', 1.5]],    target: 168, interval: 0.73, batch: 5 },
    { pool: [['shambler', 4], ['bloater', 3], ['skinner', 3], ['spitter', 2]],   target: 192, interval: 0.73, batch: 6 },
    { pool: [['hound', 6], ['skinner', 3], ['bloater', 1], ['spitter', 1.5]],    target: 240, interval: 0.64, batch: 6 },
    { pool: [['shambler', 3], ['hound', 3], ['skinner', 3], ['bloater', 1], ['spitter', 2]], target: 276, interval: 0.64, batch: 7 },
    { pool: [['skinner', 5], ['bloater', 2], ['hound', 3], ['spitter', 2]],      target: 338, interval: 0.53, batch: 7 },
    { pool: [['shambler', 4], ['skinner', 4], ['bloater', 2], ['spitter', 2.5]], target: 377, interval: 0.53, batch: 8 },
    { pool: [['hound', 4], ['skinner', 4], ['bloater', 2], ['spitter', 2.5]],    target: 416, interval: 0.44, batch: 8 },
    { pool: [['skinner', 5], ['bloater', 3], ['hound', 2], ['spitter', 3]],      target: 455, interval: 0.44, batch: 9 },
    { pool: [['shambler', 2], ['hound', 3], ['skinner', 4], ['bloater', 3], ['spitter', 3]], target: 520, interval: 0.35, batch: 10 },
  ];

  // Scripted moments. kinds: pack (clustered rush), ring (encirclement), elite, boss, banner.
  OO.EVENTS = [
    { t: 25,  kind: 'banner', text: 'Red drums are volatile. Shoot one when the infected crowd in' },
    { t: 60,  kind: 'banner', text: 'Rot Hounds are on your scent' },
    { t: 90,  kind: 'pack',  enemy: 'hound',    count: 20 },
    { t: 150, kind: 'elite', enemy: 'brute',    count: 1, text: 'Brute sighted' },
    { t: 135, kind: 'banner', text: 'Spitters: keep moving, the acid lingers' },
    { t: 165, kind: 'stampede', text: "Stampede! Bursters can't be stopped. Get behind cover" },
    { t: 210, kind: 'ring',  enemy: 'shambler', count: 40, text: 'They have you surrounded' },
    { t: 240, kind: 'elite', enemy: 'brute',    count: 1 },
    { t: 300, kind: 'boss',  enemy: 'stalker',  count: 1, text: 'Warning: The Stalker is hunting you' },
    { t: 285, kind: 'stampede', text: 'Bursters again. Find cover' },
    { t: 330, kind: 'elite', enemy: 'brute',    count: 1 },
    { t: 358, kind: 'banner', text: 'The strain is surging. They get stronger every minute now' },
    { t: 360, kind: 'pack',  enemy: 'spitter',  count: 5, text: 'A nest of Spitters' },
    { t: 390, kind: 'pack',  enemy: 'hound',    count: 40 },
    { t: 405, kind: 'stampede' },
    { t: 420, kind: 'boss',  enemy: 'stalker',  count: 1, text: 'The Stalker is back, and angrier' },
    { t: 450, kind: 'elite', enemy: 'brute',    count: 2 },
    { t: 480, kind: 'ring',  enemy: 'bloater',  count: 18, text: 'Bloaters closing in. Keep your distance' },
    { t: 510, kind: 'stampede', text: 'Bursters! Get behind something solid' },
    { t: 540, kind: 'elite', enemy: 'brute',    count: 2 },
    { t: 600, kind: 'boss',  enemy: 'stalker',  count: 2, text: 'Two Stalkers. They hunt as a pair' },
    { t: 645, kind: 'stampede' },
    { t: 660, kind: 'pack',  enemy: 'hound',    count: 60 },
    { t: 690, kind: 'elite', enemy: 'brute',    count: 2 },
    { t: 720, kind: 'ring',  enemy: 'skinner',  count: 70, text: 'Skinners in the walls' },
    { t: 735, kind: 'stampede' },
    { t: 765, kind: 'elite', enemy: 'brute',    count: 3 },
    { t: 815, kind: 'stampede' },
    { t: 780, kind: 'boss',  enemy: 'mecha',    count: 1, text: 'Lab subject B-0 has stolen the HARE TRIGGER. Evac is two minutes out' },
    { t: 870, kind: 'banner', text: 'Evac helicopter inbound. Hold on' },
    { t: 880, kind: 'stampede', text: 'One last stampede' },
  ];
  // The Director walks this list in order, so keep it sorted by time.
  OO.EVENTS.sort((a, b) => a.t - b.t);
})(window.OO = window.OO || {});
