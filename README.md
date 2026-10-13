# Outbreak Overkill

A bio-horror horde survival game for the browser. You play one operative inside the Cold Harbor quarantine zone after Helix Biotech's Lazarus strain gets loose. Evac lands in 15 minutes. Your weapons fire on their own, the infected keep coming, and every level-up adds another tool for the job.

The core loop follows the Vampire Survivors formula: move only, auto-firing weapons, XP gems (DNA samples here), a pick-one-of-three upgrade screen, weapon and passive slots, elites that drop supply cases, and a wave script that escalates until you're overrun or extracted.

**Status:** v0.4.0. Playable start to finish, solo or 2-player online co-op, with cover, ranged infected, invincible stampedes, enemy leveling, a late-game surge, weapon evolutions and an Armory between runs.

## Play it

No install, no build step.

- **Quickest:** double-click `index.html`.
- **Local server** (recommended while developing): `npm start`, or `python3 -m http.server 8080` and open http://localhost:8080.
- **Online:** push to GitHub and turn on Pages (see [docs/GIT_WORKFLOW.md](docs/GIT_WORKFLOW.md)). The included workflow deploys every push to `main`.

### Controls

| Action | Keyboard | Touch / pad |
| --- | --- | --- |
| Move | WASD or arrow keys | Drag anywhere / left stick |
| Pick upgrade | 1, 2, 3 | Tap a card |
| Reroll / skip upgrade | R / X | Buttons under the cards |
| Pause | Esc or P | II button / Start |
| Mute | M | Sound button |
| Debug overlay | ` (backtick) | — |

With the debug overlay on: **L** levels you up, **T** skips a minute, **H** heals, **B** spawns The Stalker, **J** adds a strain level. The overlay also shows the strain breakdown, the current one-hit-kill share and a shambler's HP at the current level, which is the quickest way to judge the enemy scaling while you play.

## What's in the game

**Operatives**

| Name | Starts with | Bonus |
| --- | --- | --- |
| Mara Voss, R.U.S.T. Unit officer | Service Pistol | +10% damage |
| Dex Okafor, contractor | Pump Shotgun | +30 max HP, +1 armor |
| Rin Sato, Helix lab tech | Tesla Coil | +10% speed, +30% pickup range |

**Weapons** (8 levels each, 6 slots): Service Pistol, Combat Knife, Pump Shotgun, Incendiary Grenade, Sawblade Drones, Tesla Coil.

**Gear** (passives, 6 slots): Hollow Points, Kevlar Vest, Adrenaline, Thermite Mix, Speed Loader, Scavenger Pack, Field Medkit, Extended Mag.

**Evolutions:** a max-level weapon plus its partner gear evolves when you open a supply case.

| Weapon | + Gear | = Evolution |
| --- | --- | --- |
| Service Pistol | Extended Mag | Twin Auto Pistols |
| Pump Shotgun | Hollow Points | Dragon's Breath (pellets ignite the ground) |
| Combat Knife | Adrenaline | Bloodletter (slashes all around, heals on kill) |
| Incendiary Grenade | Thermite Mix | Napalm Canister |
| Sawblade Drones | Speed Loader | Buzzsaw Halo (never stops) |
| Tesla Coil | Scavenger Pack | Arc Storm |

**Infected:** Shambler, Rot Hound, Skinner, Bloater (explodes in bile, hurts you and other infected), Spitter (keeps its distance, swells up, then lobs acid at where you're heading; the pool lingers), Burster (only arrives in stampedes, can't be damaged by anything, explodes on impact), Brute (elite, drops a supply case), The Stalker (boss at 5:00, 10:00 and 14:00, telegraphs and charges).

**Stampedes:** a rumble, rising screen shake and distant shrieks give 3 seconds of warning. A red lane shows where the row of Bursters will run, with a STAMPEDE arrow on the screen edge they come from. The lane follows you until it locks 0.8s before launch. Bursters are invincible: auto-aim ignores them and bullets glance off their carapace, so you can't thin the row out. Get behind a car, barrier or pillar: obstacles stop Bursters and block every blast, including Bloater bile. The two-slot gap in the row is also safe.

**Cover:** the map is littered with wrecked cars, a burnt-out bus, jersey barriers, dumpsters, pillars and hazmat barrels, generated in chunks from a seed so it stays consistent while you roam. You and the infected collide with them, and the infected steer around them. Your bullets and pellets stop on cover, and guns only aim at targets they can actually hit.

**Armory:** every run banks the credits you picked up plus a payout for kills, time survived and evacuating. Spend them on the main menu on permanent upgrades (HP, damage, armor, speed, pickup range, XP gain, rerolls, payouts, and Second Wind: get back up once per run). Refund any time.

**Strain level (enemy leveling):** every infected spawns at the current strain level, and each level multiplies its HP by 1.14 (1.12 for elites, 1.10 for The Stalker). The level is minutes survived plus an adaptive bonus: once more than 40% of your kills are one-hit kills, the bonus climbs (up to +10 levels) until the infected start soaking hits again, then eases back. The HUD shows STRAIN LV under the evac timer, with ADAPTING while the bonus is rising. Tuning lives in `OO.CONFIG.LEVELING`.

| Time (no adaptive bonus) | 0:00 | 5:00 | 10:00 | 15:00 |
| --- | --- | --- | --- | --- |
| Shambler HP, v0.4 Standard | 16 | 31 | 125 | 597 |
| Shambler HP, v0.3 Standard | 16 | 31 | 60 | 116 |
| Shambler HP, v0.2 Standard | 12 | 21 | 30 | 39 |

**Late-game surge:** from 6:00, enemy HP compounds +20% and enemy damage +12% every minute on top of the strain level (The Stalker gets half the HP rate; Burster blasts skip the damage surge). A banner announces it and the strain line on the HUD turns red with the live multipliers. A shambler's contact hit goes from 15 to 24 at 10:00 and from 18 to 49 at 15:00. Tuning lives in `OO.CONFIG.SURGE`.

**Threat levels:** Standard uses what v0.2 called Nightmare (35% tougher, 25% harder-hitting, 25% bigger waves). Nightmare is locked until it gets its own tuning in a future update.

**Pickups:** DNA samples (XP), Green Herb (heal), Scanner (pulls every sample on the map), Airstrike Flare (clears the screen), credits, supply cases. Supply crates spawn around the map; shoot them open. Items on the ground despawn (DNA samples after 60s, other items after 45s; supply cases never) and blink for their last 5 seconds. If 320 samples are already on the ground, the oldest one is recycled and its XP rides along with the new drop. Tuning lives in `OO.CONFIG.PICKUPS`.

**Co-op (2 players, online):** press **Co-op** on the main menu. One player picks **Host a room** and reads out the 3-digit code; the other types it in and presses **Join**. Each of you plays the operative selected on your own main menu, with your own Armory upgrades.
- XP is shared. On each team level-up both of you pick an upgrade; the game waits for both.
- Infected chase whoever is closest and have **double health** while a partner is connected.
- At 0 HP you go down instead of dying. Stand next to a downed partner for 3 seconds to revive them at 35% HP. The run ends when both of you are down.
- Supply cases show as a toast instead of a pause screen. Either player can pause for both.
- Each player banks their own payout. After a run, **Back to lobby** keeps the room open for another go.
- If your partner drops, the host keeps playing solo; if the host drops, the run ends for the partner.

Co-op needs an internet connection and a page served over http(s) (GitHub Pages, or `npm start` locally). It won't work inside the in-chat preview, which can't open network connections. Tuning lives in `OO.CONFIG.COOP`.

**Presentation:** flashlight darkness with glowing eyes in the dark, blood and bile decals, screen shake, damage numbers, synthesized sound (Web Audio, no files), a low-HP heartbeat, edge markers for off-screen bosses, elites and supply cases. Screen shake and damage numbers can be switched off from the pause screen.

## Project layout

```
index.html          page shell, screens, script load order
css/style.css       menus and overlays
js/
  config.js         ALL tunable data: enemies, weapons, passives, operatives, waves, events
  utils.js          math helpers, weighted random, storage, spatial hash
  audio.js          synthesized sound effects and ambience
  input.js          keyboard, gamepad, touch joystick
  icons.js          vector icons for weapons, gear and pickups
  world.js          procedural obstacles, collision, line of sight
  weapons.js        Weapon class + one behaviour per weapon
  spawner.js        the Director: wave table and scripted events
  render.js         world drawing, sprite cache, darkness pass, HUD
  ui.js             DOM screens: menu, level up, supply case, pause, results
  game.js           run state, fixed-timestep loop, simulation (any number of players)
  net.js            PeerJS wrapper: rooms, 3-digit codes, the data channel
  coop.js           co-op lobby, host snapshots, client mirroring
  vendor/peerjs.min.js  PeerJS 1.5.5 (MIT), vendored so the game has no CDN dependency
  main.js           boot
tools/bundle.mjs    builds dist/outbreak-overkill.html (single file)
tools/balance-sim.mjs  headless bot runs for balance checks (needs Playwright)
```

Scripts are plain `<script>` tags sharing one `OO` namespace, so the game runs from `file://` without a server. When the project outgrows that, the planned move is to Vite with ES modules (see roadmap).

## Adding content

Most changes are data edits in `js/config.js`.

- **Rebalance:** change numbers in `OO.ENEMIES`, `OO.WEAPONS`, `OO.WAVES`.
- **New enemy:** add an entry to `OO.ENEMIES`, draw it in `Renderer.drawEnemyShape` (render.js), add its animation speed to `ANIM` and head offset to `HEAD`, then use it in a wave pool.
- **New weapon:** add data to `OO.WEAPONS` (base stats + 7 level steps), add a behaviour in `weapons.js` with `update()` (and `draw()` if it has visuals), and an icon case in `icons.js`.
- **New passive:** add it to `OO.PASSIVES` and apply it in `Game.recalcStats()`.
- **New scripted moment:** add a line to `OO.EVENTS` (`pack`, `ring`, `elite`, `boss`, `stampede` or `banner`).
- **New evolution:** add the evolved weapon to `EVOLVED` and the recipe to `OO.EVOLUTIONS` in config.js.
- **New obstacle type:** add a shape to `KINDS` in world.js and a drawing case in `Renderer.obstacleSprite`.
- **New Armory upgrade:** add it to `OO.ARMORY` and apply its rank in `Game.recalcStats()`.

## Balance checks

`tools/balance-sim.mjs` plays full runs headlessly with two simple bots (random upgrade picks, and a greedy picker that also takes cover from stampedes) and prints how long they last:

```bash
npm install                       # installs Playwright (dev only)
npx playwright install chromium   # one-time browser download
npm run sim                       # 2 runs per operative per bot
npm run sim -- standard 3         # threat level, runs per combination
```

The bots play nothing like a person, so treat this as a smoke test (does a run still play through without errors, did a change move things wildly) and do the real balance judgement by playing. v0.3's enemy leveling was tuned by hand play, not by the bots.

## Roadmap

Each item is a good-sized feature branch.

Done in v0.2: weapon evolutions, the Armory, cover, Spitters, Burster stampedes, rerolls and skips, the balance sim.

Done in v0.3: enemy leveling (strain), harder Standard baseline, invincible Bursters.

Done in v0.4: late-game surge, pickup despawn and cap fix, 2-player online co-op.

Next up: give **Nightmare** its own tuning (faster strain growth, more stampedes) and unlock it.

1. **Real art.** Swap procedural shapes for sprite sheets; `Renderer.enemySprite()` and `obstacleSprite()` are the places to change.
2. **Audio pass.** Recorded SFX and a music loop; `Audio.play()` cases map one-to-one to samples.
3. **Stages.** Hospital, sewer, lab sub-levels with their own obstacle sets and wave scripts.
4. **Unlockable operatives** bought in the Armory, each with a unique starting weapon.
5. **More infected.** Crawler swarm, a shielded infected that only takes damage from behind, a mid-boss per stage.
6. **Banish** on the level-up screen, run modifiers (Arcana-style).
7. **Destructible cover** (barrels that explode, cars that burn).
8. **Tooling.** Vite + ES modules, ESLint, the balance sim in CI.

## Git workflow

See [docs/GIT_WORKFLOW.md](docs/GIT_WORKFLOW.md) for first-time GitHub setup, the branch-per-feature flow, commit style and releases.

## How co-op works

The host runs the only simulation. Fifteen times a second it sends the partner a snapshot of what is near them: enemies, bullets and pickups packed into an `Int16Array`, small JSON lists (players, fire, acid, stampedes), and a queue of one-shot effects, sounds and banners. That's roughly 90 KB/s with about 380 infected on screen. The partner's browser moves its own operative locally (no input lag), sends its position 30 times a second, and draws everything else interpolated between snapshots. Level-up picks, rerolls, skips and pause requests are sent to the host, which applies them.

Players find each other through a PeerJS signalling server. Room 427 is peer id `outbreak-overkill-v1-427`. After that handshake, game traffic goes directly between the two browsers over WebRTC. By default the free public PeerJS cloud server is used. To use your own server, or to test on one machine:

```bash
npx peer --port 9000 --host 127.0.0.1    # terminal 1: local signalling server
npm start                                # terminal 2: serves the game on :8080
# open http://localhost:8080/?peer=127.0.0.1:9000 in two windows
```

Both players must be on the same game version; the host turns away a mismatched version with a clear message.

## Credits and IP

All code, art (procedural) and sound (synthesized) are original to this project. The game is inspired by the survivors-like genre and classic survival-horror themes; it uses no names, characters or assets from existing franchises. Fonts: Big Shoulders Stencil Display, Special Elite and IBM Plex Mono via Google Fonts (SIL Open Font License). Networking: PeerJS (MIT, see `js/vendor/peerjs.LICENSE`).
