# Outbreak Overkill

A bio-horror horde survival game for the browser. You play one operative inside the Cold Harbor quarantine zone after Helix Biotech's Lazarus strain gets loose. Evac lands in 15 minutes. Your weapons fire on their own, the infected keep coming, and every level-up adds another tool for the job.

The core loop follows the Vampire Survivors formula: move only, auto-firing weapons, XP gems (DNA samples here), a pick-one-of-three upgrade screen, weapon and passive slots, elites that drop supply cases, and a wave script that escalates until you're overrun or extracted.

**Status:** v0.2.0. Playable start to finish, with cover, ranged infected, stampedes, weapon evolutions and an Armory between runs.

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

With the debug overlay on: **L** levels you up, **T** skips a minute, **H** heals, **B** spawns The Stalker.

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

**Infected:** Shambler, Rot Hound, Skinner, Bloater (explodes in bile, hurts you and other infected), Spitter (keeps its distance, swells up, then lobs acid at where you're heading; the pool lingers), Burster (only arrives in stampedes, explodes on impact), Brute (elite, drops a supply case), The Stalker (boss at 5:00, 10:00 and 14:00, telegraphs and charges).

**Stampedes:** a rumble, rising screen shake and distant shrieks give 3 seconds of warning. A red lane shows where the row of Bursters will run, with a STAMPEDE arrow on the screen edge they come from. The lane follows you until it locks 0.8s before launch. Get behind a car, barrier or pillar: obstacles stop Bursters and block every blast, including Bloater bile. The two-slot gap in the row is also safe.

**Cover:** the map is littered with wrecked cars, a burnt-out bus, jersey barriers, dumpsters, pillars and hazmat barrels, generated in chunks from a seed so it stays consistent while you roam. You and the infected collide with them, and the infected steer around them. Your bullets and pellets stop on cover, and guns only aim at targets they can actually hit.

**Armory:** every run banks the credits you picked up plus a payout for kills, time survived and evacuating. Spend them on the main menu on permanent upgrades (HP, damage, armor, speed, pickup range, XP gain, rerolls, payouts, and Second Wind: get back up once per run). Refund any time.

**Threat levels:** Standard, or Nightmare (35% tougher, 25% harder-hitting, 25% bigger waves, credits x1.6).

**Pickups:** DNA samples (XP), Green Herb (heal), Scanner (pulls every sample on the map), Airstrike Flare (clears the screen), credits, supply cases. Supply crates spawn around the map; shoot them open.

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
  game.js           run state, fixed-timestep loop, simulation
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
npm run sim                       # Standard, 2 runs per operative per bot
npm run sim -- nightmare 3        # threat level, runs per combination
```

The bots are much worse than a person, so read the numbers as relative: compare before and after a change. At v0.2.0 they average about 5-6 minutes on Standard with the odd evacuation, and about 3.5 minutes on Nightmare.

## Roadmap

Each item is a good-sized feature branch.

Done in v0.2: weapon evolutions, the Armory, cover, Spitters, Burster stampedes, rerolls and skips, Nightmare, the balance sim.

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

## Credits and IP

All code, art (procedural) and sound (synthesized) are original to this project. The game is inspired by the survivors-like genre and classic survival-horror themes; it uses no names, characters or assets from existing franchises. Fonts: Big Shoulders Stencil Display, Special Elite and IBM Plex Mono via Google Fonts (SIL Open Font License).
