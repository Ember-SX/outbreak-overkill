# Outbreak Overkill

A bio-horror horde survival game for the browser. You play one operative inside the Cold Harbor quarantine zone after Helix Biotech's Lazarus strain gets loose. Evac lands in 15 minutes. Your weapons fire on their own, the infected keep coming, and every level-up adds another tool for the job.

The core loop follows the Vampire Survivors formula: move only, auto-firing weapons, XP gems (DNA samples here), a pick-one-of-three upgrade screen, weapon and passive slots, elites that drop supply cases, and a wave script that escalates until you're overrun or extracted.

**Status:** v0.6.0. Playable start to finish, solo or 2-player online co-op, with cover, ranged infected, invincible stampedes, enemy leveling, a late-game surge, a final boss, weapon evolutions, and an Armory with upgrades and an outfit wardrobe between runs.

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

With the debug overlay on: **L** levels you up, **T** skips a minute, **H** heals, **B** spawns The Stalker, **N** spawns the Hare Trigger, **J** adds a strain level. The overlay also shows the strain breakdown, the current one-hit-kill share and a shambler's HP at the current level, which is the quickest way to judge the enemy scaling while you play.

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

**Infected:** Shambler, Rot Hound, Skinner, Bloater (explodes in bile, hurts you and other infected), Spitter (keeps its distance, swells up, then lobs acid at where you're heading; the pool lingers), Burster (only arrives in stampedes, can't be damaged by anything, explodes on impact), Brute (elite, drops a supply case), The Stalker (boss at 5:00 and 10:00, telegraphs and charges).

**Final boss: the HARE TRIGGER (14:00).** Lab subject B-0, a small white rabbit called Biscuit, has stolen a combat mech and wants a word with you. It rocket-jumps in on a marked spot, then hunts the nearest operative:
- **Stomp walk.** It turns its whole frame to follow you and can't strafe, so circling it works. It is slower than you.
- **Rocket leap.** It crouches and a red reticle marks where you're heading, then it jumps (can't be hit in the air) and lands with a shockwave. Cover doesn't help, so get out of the ring. It staggers briefly after landing; that's your window. If you run far away, it leaps after you.
- **Carrot missiles.** Orange reticles go down on you, ahead of you and around you, and a volley arcs in one after another. Cover blocks the blasts, and they hurt the horde too.
- **Overdrive (below half health).** Faster, shorter pauses, bigger volleys, and a **visor laser**: a dashed line tracks you, goes solid when it locks, then the beam sweeps toward you. Walls stop it; outrun the sweep up close or put an obstacle between you.
- Destroy it and it drops a big supply case and herbs, and Biscuit ejects by parachute, unharmed and furious. Tuning lives in `OO.ENEMIES.mecha.mech`; the AI is in `js/boss.js`.

**Stampedes:** a rumble, rising screen shake and distant shrieks give 3 seconds of warning. A red lane shows where the row of Bursters will run, with a STAMPEDE arrow on the screen edge they come from. The lane follows you until it locks 0.8s before launch. Bursters are invincible: auto-aim ignores them and bullets glance off their carapace, so you can't thin the row out. Get behind a car, barrier or pillar: obstacles stop Bursters and block every blast, including Bloater bile. The two-slot gap in the row is also safe.

**Cover:** the map is littered with wrecked cars, a burnt-out bus, jersey barriers, dumpsters, pillars and hazmat barrels, generated in chunks from a seed so it stays consistent while you roam. You and the infected collide with them, and the infected steer around them. Your bullets and pellets stop on cover, and guns only aim at targets they can actually hit.

**Armory:** every run banks the credits you picked up plus a payout for kills, time survived and evacuating. Spend them on the main menu on permanent upgrades (HP, damage, armor, speed, pickup range, XP gain, rerolls, payouts, and Second Wind: get back up once per run). Refund upgrades any time.

**Wardrobe (Armory > Wardrobe):** five outfits per operative, all cosmetic.
- Each operative has the same five sets: their default tactical kit (free), covert ops, undercover, hazmat, and swimwear.
- Every other outfit costs **1,800 credits**. A clean 15:00 evacuation banks about 550–650 credits (simulated runs ranged 240–1,080 depending on kills), so one outfit is roughly three full successful runs. The price lives in `OO.SKIN_COST` (js/characters.js).
- Buying an outfit equips it. Your partner sees it in co-op. Refunding Armory upgrades doesn't touch outfits.
- The menu's operative dossier shows the equipped outfit. **Change** jumps straight to that operative's wardrobe.

| Operative | Tactical (free) | Covert ops | Undercover | Hazmat | Swimwear |
|---|---|---|---|---|---|
| Mara Voss, patrol officer | Patrol uniform | Night shift | Off the books | Decon shell | Shore leave |
| Dex Okafor, contractor | Contractor rig | Black site | Street clothes | CBRN heavy | Lifeguard |
| Rin Sato, lab technician | Containment suit | Ghost protocol | Lab coat | Level A | Pool day |

**Strain level (enemy leveling):** every infected spawns at the current strain level, and each level multiplies its HP by 1.14 (1.12 for elites, 1.10 for The Stalker). The level is minutes survived plus an adaptive bonus: once more than 40% of your kills are one-hit kills, the bonus climbs (up to +10 levels) until the infected start soaking hits again, then eases back. The HUD shows STRAIN LV under the evac timer, with ADAPTING while the bonus is rising. Tuning lives in `OO.CONFIG.LEVELING`.

| Time (no adaptive bonus) | 0:00 | 5:00 | 10:00 | 15:00 |
| --- | --- | --- | --- | --- |
| Shambler HP, v0.4 Standard | 16 | 31 | 125 | 597 |
| Shambler HP, v0.3 Standard | 16 | 31 | 60 | 116 |
| Shambler HP, v0.2 Standard | 12 | 21 | 30 | 39 |

**Late-game surge:** from 6:00, enemy HP compounds +20% and enemy damage +12% every minute on top of the strain level (The Stalker gets half the HP rate; Burster blasts skip the damage surge). A banner announces it and the strain line on the HUD turns red with the live multipliers. A shambler's contact hit goes from 15 to 24 at 10:00 and from 18 to 49 at 15:00. Tuning lives in `OO.CONFIG.SURGE`.

**HP cap at 13:00:** enemy HP stops growing at 13:00 (`OO.CONFIG.LEVELING.hpCapTime`). The clock part of the strain level, the surge HP multiplier and the adaptive bonus all freeze there, so infected spawning in the last two minutes have the same HP as at 13:00. A Standard shambler tops out at x26.6 its base HP instead of reaching about x50 by 15:00. The HUD marks the HP multiplier with (MAX). Enemy damage keeps rising.

**Threat levels:** Standard uses what v0.2 called Nightmare (35% tougher, 25% harder-hitting, 25% bigger waves). Nightmare is locked until it gets its own tuning in a future update.

**Pickups:** DNA samples (XP), Green Herb (heal), Scanner (pulls every sample on the map), Airstrike Flare (clears the screen), credits, supply cases. Supply crates spawn around the map; shoot them open. Items on the ground despawn (DNA samples after 60s, other items after 45s; supply cases never) and blink for their last 5 seconds. If 320 samples are already on the ground, the oldest one is recycled and its XP rides along with the new drop. Tuning lives in `OO.CONFIG.PICKUPS`.

**Co-op (2 players, online):** press **Co-op** on the main menu. One player picks **Host a room** and reads out the 3-digit code; the other types it in and presses **Join**. Each of you plays the operative selected on your own main menu, with your own Armory upgrades.
- XP is shared. On each team level-up both of you pick an upgrade; the game waits for both.
- Infected chase whoever is closest and have **double health** while a partner is connected.
- At 0 HP you go down instead of dying. Stand next to a downed partner for 3 seconds to revive them at 35% HP. The run ends when both of you are down.
- Supply cases show as a toast instead of a pause screen. Either player can pause for both.
- Each player banks their own payout. After a run, **Back to lobby** keeps the room open for another go.
- If your partner drops, the host keeps playing solo; if the host drops, the run ends for the partner.

- The host's lobby shows **Joining…** as soon as someone dials in, and explains if their connection couldn't get through. The room stays open for another try.
- The lobby shows whether your link is **direct** or goes **via relay server**.

Co-op needs an internet connection and a page served over http(s) (GitHub Pages, or `npm start` locally). It won't work inside the in-chat preview, which can't open network connections. Tuning lives in `OO.CONFIG.COOP`.

**Can't connect?** Strict firewalls (offices, schools, some mobile and public Wi-Fi) block direct browser-to-browser links. The game then routes through a TURN relay server: first any relay you set under **Co-op > Connection settings**, then the free Open Relay servers on ports 80 and 443 (UDP, TCP and TLS, which nearly every firewall allows), then the PeerJS relays. The joiner tries every route first and, if nothing opens within 10 seconds, retries over relays only. Free public relays are best effort. If they're busy, a free TURN account (for example Metered or Cloudflare) gives you your own: paste its `turn:` address, username and password into Connection settings, or a Metered credentials URL (`https://<app>.metered.live/api/v1/turn/credentials?apiKey=...`) as the server. The settings are saved in your browser. The player on the strict network is the one who needs it.

**Presentation:** the interface is styled as a field-issued containment terminal: glass panels with bracketed corners, containment teal for readouts, hazard amber for actions, infection red for danger.
- **Vitals monitor (top left):** an ECG trace that speeds up as you lose health. It reads STABLE (teal), STRAINED (amber) or CRITICAL (red, with a noisy trace), and flatlines when you're down in co-op. Partners get a small monitor of their own.
- **Map:** ground detail is baked per map chunk and stays put when you come back.
  - Roads every other block, with lane paint, kerbs, drains and crossings.
  - Puddles, oil stains, skid marks, paper, glass, spent casings and hazard tape.
  - Old blood: pools, drag trails, footprints, handprints. Quarantine stencils on the road.
  - Kill splats have a pool, a directional spray and a wet sheen.
- **Lighting:** flashlight darkness, sodium street lamps (some flicker or are dead), rotating red emergency beacons, drifting haze, dust in your flashlight beam, a vignette and film grain.
- **Operatives:** distinct top-down silhouettes. Mara wears a fitted patrol uniform and duty vest with her hair up. Dex is broad, with a plate carrier and a slung shotgun. Rin wears a helmeted containment suit with an air unit. Large front-facing portraits appear on the menu and in the wardrobe.
- **Also:** glowing eyes in the dark, screen shake, damage numbers, synthesized sound (Web Audio, no files), a low-HP heartbeat, edge markers for off-screen bosses, elites and supply cases.

**Pause screen settings:** screen shake, damage numbers and **Atmosphere**. Atmosphere covers the full-screen haze, dust and grain passes. *Auto* (the default) turns them off if the frame rate stays under about 42 fps and back on above 56. *High* and *low* force it either way.

## Project layout

```
index.html          page shell, screens, script load order
css/style.css       menus and overlays
css/fonts/          self-hosted fonts (SIL OFL, see OFL.txt); no third-party requests
js/
  config.js         ALL tunable data: enemies, weapons, passives, operatives, waves, events
  utils.js          math helpers, weighted random, storage, spatial hash
  audio.js          synthesized sound effects and ambience
  input.js          keyboard, gamepad, touch joystick
  icons.js          vector icons for weapons, gear and pickups
  characters.js     operatives: outfit data, top-down sprite, menu/wardrobe portraits
  world.js          procedural obstacles, collision, line of sight
  weapons.js        Weapon class + one behaviour per weapon
  spawner.js        the Director: wave table and scripted events
  scenery.js        baked ground detail per chunk, street lamps and beacons, haze, dust, grain
  render.js         world drawing, sprite cache, darkness pass, HUD (ECG vitals monitor)
  ui.js             DOM screens: menu, level up, supply case, pause, results
  game.js           run state, fixed-timestep loop, simulation (any number of players)
  net.js            PeerJS wrapper: rooms, 3-digit codes, the data channel
  boss.js           the Hare Trigger final boss (AI, attacks, co-op state)
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
- **New outfit:** add an entry to the operative's list in `SKINS` (js/characters.js). An outfit is data: colours plus a few style keys (`topKind`, `legKind`, `vest`, `head`, `hair`, `pack`...). The same data draws the in-game sprite and the portrait, so new outfits built from existing garment types need no drawing code.

## Balance checks

`tools/balance-sim.mjs` plays full runs headlessly with two simple bots (random upgrade picks, and a greedy picker that also takes cover from stampedes) and prints how long they last:

```bash
npm install                       # installs Playwright (dev only)
npx playwright install chromium   # one-time browser download
npm run sim                       # 2 runs per operative per bot
npm run sim -- standard 3         # threat level, runs per combination
```

`npm run sim -- standard 1 god` makes the bots unkillable (damage is counted but not applied), so they reach the last minutes. It prints a shambler's HP multiplier at every minute mark (it should go flat from 13:00) and how much of the Hare Trigger's health each bot took off.

The bots play nothing like a person, so treat this as a smoke test (does a run still play through without errors, did a change move things wildly) and do the real balance judgement by playing. v0.3's enemy leveling was tuned by hand play, not by the bots.

## Roadmap

Each item is a good-sized feature branch.

Done in v0.2: weapon evolutions, the Armory, cover, Spitters, Burster stampedes, rerolls and skips, the balance sim.

Done in v0.3: enemy leveling (strain), harder Standard baseline, invincible Bursters.

Done in v0.4: late-game surge, pickup despawn and cap fix, 2-player online co-op.

Done in v0.5: co-op through strict firewalls (TURN relays, relay fallback, sturdier handshake), the 13:00 HP cap, the Hare Trigger final boss.

Done in v0.6: interface and HUD redesign with the ECG vitals monitor, lighting and ground detail, new operative art, the outfit wardrobe.

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

Connection steps:
1. The joiner dials the host's room id.
2. If the signalling server says the room doesn't exist, the joiner retries twice before showing "There is no room". This covers a host who is still opening the room, or who is briefly reconnecting.
3. The joiner says `hello` once a second until the host answers `welcome`, so a message lost in a race at channel open can't strand the lobby.
4. If the host loses the signalling server, it reconnects under the same room id with backoff. An open game link doesn't need the signalling server, so a running game is not affected.

URL options for testing:
- `?turn=turn:host:port&turnuser=...&turnpass=...` adds a relay.
- `?relays=off` drops the built-in public relays.
- `?ice=relay` forces relay-only links.

Both players must be on the same game version; the host turns away a mismatched version with a clear message.

## Credits and IP

All code, art (procedural) and sound (synthesized) are original to this project. The game is inspired by the survivors-like genre and classic survival-horror themes; it uses no names, characters or assets from existing franchises. Operatives and outfits are original designs built from generic archetypes (patrol officer, contractor, lab technician); they don't copy any existing character's look. Fonts: Chakra Petch, IBM Plex Mono and Big Shoulders Stencil Display, self-hosted from Fontsource (SIL Open Font License, see `css/fonts/OFL.txt`). Networking: PeerJS (MIT, see `js/vendor/peerjs.LICENSE`).
