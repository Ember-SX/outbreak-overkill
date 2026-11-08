# Changelog

All notable changes to Outbreak Overkill. Versions follow `MAJOR.MINOR.PATCH`.

## [0.5.0] - 2026-11-08

Branch `feature/v0.5-final-boss`.

### Fixed
- **Co-op across networks: the joiner saw the host, but the host never saw the joiner and couldn't deploy.**
  - When a strict firewall or NAT blocked the direct WebRTC link, the data channel never opened. The joiner's lobby still listed a placeholder "Host" row, which looked like a connection.
  - The host kept that dead connection as its partner slot, so every retry was turned away as "room full".
  - Now:
    - Unopened links are dropped and replaced.
    - The host shows **Joining…** as soon as someone dials in, and explains when their connection couldn't get through. The room stays open.
    - The joiner only lists the host once the host has actually answered.
- **"Room not found" and failed links behind strict firewalls.**
  - Peers now get TURN relays:
    - your own relay (Co-op > Connection settings, saved in the browser, or `?turn=`);
    - the free Open Relay servers on ports 80/443 over UDP, TCP and TLS (time-limited credentials computed in the browser);
    - the PeerJS relays, plus two STUN servers.
  - The joiner retries over relays only if the first attempt doesn't open in 10s.
  - A "peer unavailable" answer is retried twice before "There is no room" is shown.
  - The host reconnects to the signalling server under the same room code if it drops. A running game no longer ends because the signalling server hiccuped.
  - `hello` is re-sent until the host's `welcome` arrives.
  - The lobby shows whether the link is direct or relayed.
- Text fields no longer lose arrow and space keys to the game's movement controls.

### Changed
- **Enemy HP stops scaling at 13:00** (`OO.CONFIG.LEVELING.hpCapTime = 780`):
  - The clock part of the strain level, the surge HP multiplier and the adaptive bonus all freeze there.
  - A Standard shambler tops out at x26.6 base HP instead of about x50 at 15:00.
  - Enemy damage keeps rising. The HUD marks the capped HP multiplier with (MAX).

### Added
- **Final boss: the HARE TRIGGER**, a combat mech piloted by lab subject B-0, "Biscuit" (a small, cross rabbit). It replaces the twin Stalkers at 14:00.
  - Rocket-jump entrance, stomp-walk hunting with a turn rate, and a telegraphed rocket leap with a landing shockwave (it can't be hit in the air; it staggers after landing). It leaps after you if you run far away.
  - Carrot-missile volleys onto marked ground (cover blocks them; they hurt the horde too).
  - Overdrive below half HP: faster, bigger volleys, and a tracking visor laser that locks before it sweeps; obstacles stop the beam.
  - Its own sprite (Biscuit visible in the cockpit), sounds, boss bar with pilot name, and a parachute ejection on defeat with a big supply case and herbs.
  - Fully mirrored in co-op, including missile reticles and laser state. Its HP is doubled in co-op like everything else.
  - Code in `js/boss.js`, tuning in `OO.ENEMIES.mecha.mech`. Debug key **N** spawns it.
- `npm run sim -- standard 1 god`: unkillable bots for checking the late game (HP-multiplier curve per minute, boss damage taken). The bots also dodge the boss's reticles.

## [0.4.0] - 2026-10-13

Branch `feature/v0.4-coop`.

### Added
- **2-player online co-op.** The Co-op screen has Host/Join with a 3-digit room code, using PeerJS signalling plus a WebRTC data channel (PeerJS 1.5.5 vendored).
  - The host simulates the run and streams snapshots at 15 Hz. The client predicts its own movement.
  - Pooled XP with per-player level-up picks, nearest-player targeting, x2 enemy HP while a partner is connected.
  - Down and revive (3s next to your partner), supply-case toasts, shared pause, per-player payouts, back-to-lobby between runs.
  - Disconnect handling with an 8s keepalive. Set `?peer=host:port` to use a self-hosted signalling server.
- **Late-game surge.** From 6:00, enemy HP +20% and damage +12% per minute, compounding (`OO.CONFIG.SURGE`). The Stalker gets half the HP rate; Burster blasts are exempt from the damage surge. HUD readout and a 5:58 banner.

### Fixed
- **Pickups stopped dropping mid-run.** After 320 uncollected DNA samples, every new drop was merged into one far-away overflow gem. Ground items now despawn (samples 60s, other items 45s, supply cases never) and blink before they go. Caps recycle the oldest item instead: an old gem's XP moves into the new drop, so no XP is lost.

### Changed
- The simulation now runs over a list of players, and weapons belong to an owner. Solo play is unchanged.
- `tools/balance-sim.mjs` is updated to the new API.

## [0.3.0] - 2026-10-13

Branch `feature/enemy-leveling`.

### Added
- **Strain level (enemy leveling).** Infected spawn at the current strain level; HP grows 14% per level (12% elites, 10% The Stalker), compounding. Strain = minutes survived + an adaptive bonus that climbs while more than 40% of kills are one-hit kills (cap +10) and eases off when they aren't. HUD readout with an ADAPTING indicator, banners every 5 levels, elite level tags, peak level on the results screen, debug overlay breakdown and a J debug key.
- Locked Nightmare button on the menu.

### Changed
- **Standard now uses v0.2's Nightmare numbers**: x1.35 enemy HP, x1.25 enemy damage, x1.25 horde size. Credits stay x1.
- Enemy HP no longer scales linearly with time; the strain level replaces it.
- **Bursters are invincible**: no source of damage affects them, auto-aim skips them, projectiles glance off with an IMMUNE tag, and they give no XP. They carry visible bone plates. Cover is the way through a stampede.
- Nightmare is locked; v0.2 saves with Nightmare selected fall back to Standard.

## [0.2.0] - 2026-10-10

Branch `feature/v0.2-escalation`.

### Added
- **Cover.** Procedural obstacles (cars, bus, barriers, dumpsters, pillars, hazmat barrels) generated per chunk from a seed. Collision for player and infected, enemy steering around obstacles, bullets stop on cover, line-of-sight aiming for the pistol and shotgun, faint rims so cover reads in the dark.
- **Spitter**, a ranged infected: holds distance, strafes, telegraphs with a swelling throat sac and a gurgle, lobs acid with a landing reticle, leaves a damaging pool. Alive count is capped.
- **Burster stampedes**: 3s warning (rumble, shake, shrieks, red lane, edge arrow), lane locks 0.8s before launch, then a row of Bursters charges and explodes on impact for heavy damage. Obstacles stop them and block all blasts. Eight scripted stampedes from 2:45.
- **Weapon evolutions** for all six weapons, with a field manual on the pause screen.
- **Armory**: permanent upgrades bought with banked credits, run payout on the results screen, Second Wind revive, refunds.
- Level-up **reroll** (R) and **skip** (X).
- **Nightmare** threat level.
- Off-screen markers for bosses, elites and supply cases.
- Pause-screen toggles for screen shake and damage numbers.
- `tools/balance-sim.mjs` headless balance runner.

### Changed
- Harder baseline: the horde grows to +10% / +20% / +30% from minutes 3 / 6 / 10, enemy HP scales 15%/min (was 12%), enemy damage 5%/min (was 4%), quicker shamblers and hounds, tougher Stalker, extra elite drops.
- Bloater blasts scale with time and are blocked by cover.
- Green Herb drop chance from kills 0.4% -> 0.7%.

## [0.1.0] - 2026-09-27

First playable prototype.

### Added
- Core survivors loop: move-only control, auto-firing weapons, DNA sample XP, three-choice level-ups, 6 weapon and 6 gear slots.
- 3 operatives: Mara Voss (pistol), Dex Okafor (shotgun), Rin Sato (tesla coil).
- 6 weapons with 8 levels each: Service Pistol, Combat Knife, Pump Shotgun, Incendiary Grenade, Sawblade Drones, Tesla Coil.
- 8 gear passives: Hollow Points, Kevlar Vest, Adrenaline, Thermite Mix, Speed Loader, Scavenger Pack, Field Medkit, Extended Mag.
- 5 infected types plus The Stalker boss with a telegraphed charge; exploding Bloaters; Brute elites drop supply cases.
- 15-minute wave script with hound packs, encirclements, elites and boss spawns; evac victory at 15:00.
- Supply crates with herbs, scanner, airstrike flare and credits.
- Flashlight darkness pass, glowing eyes, blood decals, particles, screen shake, damage numbers.
- Synthesized sound effects and ambient drone; low-HP heartbeat.
- Keyboard, touch joystick and gamepad input; pause screen with build and stats; results screen with per-weapon damage.
- Local records (best time, most kills, runs, evacuations).
- GitHub Pages deploy workflow and single-file bundle script.
