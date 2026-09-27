# Outbreak Overkill

A bio-horror horde survival game for the browser. You play one operative inside the Cold Harbor quarantine zone after Helix Biotech's Lazarus strain gets loose. Evac lands in 15 minutes. Your weapons fire on their own, the infected keep coming, and every level-up adds another tool for the job.

The core loop follows the Vampire Survivors formula: move only, auto-firing weapons, XP gems (DNA samples here), a pick-one-of-three upgrade screen, weapon and passive slots, elites that drop supply cases, and a wave script that escalates until you're overrun or extracted.

**Status:** v0.1.0 prototype. Playable start to finish.

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
| Pause | Esc or P | II button / Start |
| Mute | M | Sound button |
| Debug overlay | ` (backtick) | — |

With the debug overlay on: **L** levels you up, **T** skips a minute, **H** heals, **B** spawns The Stalker.

## What's in the prototype

**Operatives**

| Name | Starts with | Bonus |
| --- | --- | --- |
| Mara Voss, R.U.S.T. Unit officer | Service Pistol | +10% damage |
| Dex Okafor, contractor | Pump Shotgun | +30 max HP, +1 armor |
| Rin Sato, Helix lab tech | Tesla Coil | +10% speed, +30% pickup range |

**Weapons** (8 levels each, 6 slots): Service Pistol, Combat Knife, Pump Shotgun, Incendiary Grenade, Sawblade Drones, Tesla Coil.

**Gear** (passives, 6 slots): Hollow Points, Kevlar Vest, Adrenaline, Thermite Mix, Speed Loader, Scavenger Pack, Field Medkit, Extended Mag.

**Infected:** Shambler, Rot Hound, Skinner, Bloater (explodes in bile, hurts you and other infected), Brute (elite, drops a supply case), The Stalker (boss at 5:00, 10:00 and 14:00, telegraphs and charges).

**Pickups:** DNA samples (XP), Green Herb (heal), Scanner (pulls every sample on the map), Airstrike Flare (clears the screen), credits, supply cases. Supply crates spawn around the map; shoot them open.

**Presentation:** flashlight darkness with glowing eyes in the dark, blood and bile decals, screen shake, damage numbers, synthesized sound (Web Audio, no files), a low-HP heartbeat.

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
  weapons.js        Weapon class + one behaviour per weapon
  spawner.js        the Director: wave table and scripted events
  render.js         world drawing, sprite cache, darkness pass, HUD
  ui.js             DOM screens: menu, level up, supply case, pause, results
  game.js           run state, fixed-timestep loop, simulation
  main.js           boot
tools/bundle.mjs    builds dist/outbreak-overkill.html (single file)
```

Scripts are plain `<script>` tags sharing one `OO` namespace, so the game runs from `file://` without a server. When the project outgrows that, the planned move is to Vite with ES modules (see roadmap).

## Adding content

Most changes are data edits in `js/config.js`.

- **Rebalance:** change numbers in `OO.ENEMIES`, `OO.WEAPONS`, `OO.WAVES`.
- **New enemy:** add an entry to `OO.ENEMIES`, draw it in `Renderer.drawEnemyShape` (render.js), add its animation speed to `ANIM` and head offset to `HEAD`, then use it in a wave pool.
- **New weapon:** add data to `OO.WEAPONS` (base stats + 7 level steps), add a behaviour in `weapons.js` with `update()` (and `draw()` if it has visuals), and an icon case in `icons.js`.
- **New passive:** add it to `OO.PASSIVES` and apply it in `Game.recalcStats()`.
- **New scripted moment:** add a line to `OO.EVENTS` (`pack`, `ring`, `elite`, `boss` or `banner`).

## Roadmap

Each item is a good-sized feature branch.

1. **Weapon evolutions.** Max a weapon, own its paired gear, open a supply case, get the evolved form (e.g. Pistol + Extended Mag → twin auto pistols).
2. **Meta progression.** Spend credits between runs on permanent upgrades; unlock operatives.
3. **Real art.** Swap procedural shapes for sprite sheets; `Renderer.enemySprite()` is the one place to change.
4. **Audio pass.** Recorded SFX and a music loop; `Audio.play()` cases map one-to-one to samples.
5. **Stages.** Hospital, sewer, lab sub-levels with obstacles and their own wave scripts.
6. **More infected.** Spitter (ranged), Crawler swarm, a mid-boss per stage.
7. **Arcana-style run modifiers**, reroll/skip/banish on the level-up screen.
8. **Tooling.** Vite + ES modules, ESLint, a headless balance-sim script in CI.

## Git workflow

See [docs/GIT_WORKFLOW.md](docs/GIT_WORKFLOW.md) for first-time GitHub setup, the branch-per-feature flow, commit style and releases.

## Credits and IP

All code, art (procedural) and sound (synthesized) are original to this project. The game is inspired by the survivors-like genre and classic survival-horror themes; it uses no names, characters or assets from existing franchises. Fonts: Big Shoulders Stencil Display, Special Elite and IBM Plex Mono via Google Fonts (SIL Open Font License).
