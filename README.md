[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/ninochaan/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/ninochaan/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# Solmar Bay

An original open-world crime game set in a sun-soaked coastal city, built with three.js (vendored under `game/vendor/`, so it plays fully offline). Nothing here comes from any commercial game — the city, characters, story, art and code are all original.

You are **Rico Marrero**, a wheelman fresh off the ferry. Fixer **Marisol Vega** has five jobs that take you from a first borrowed coupe to the Banco del Sol vault run, while the Solmar Bay PD answers with a 1–5 star wanted system, pursuit steering, roadblocks and a bust meter. Between jobs: run taxi fares against the clock, race the boulevard checkpoint circuit, hunt 20 hidden packages, and rest at your enterable safehouse.

## What's in the city

- **Solmar Bay itself** — downtown towers, suburbs, beachfront hotels and a marina, with procedural canvas-painted facades (windows, awnings, invented shop signs), palm avenues, streetlights, lane paint and crosswalks, an animated sea, drifting clouds and late-afternoon sun with local shadows.
- **Driving & traffic** — arcade handling with handbrake, enter or steal any car, lane-following traffic that queues, yields and lights its brake lights.
- **People** — pedestrians who stroll the sidewalks, wait at crossings, and flee gunfire and pavement-driving.
- **Police** — wanted stars rise on witnessed crime and decay in hiding; units steer for an intercept point and set roadblocks at four stars.
- **Combat** — fists and a pistol (hitscan, tracers, reloads), and the Los Brasa gang fights back during the story.
- **Presentation** — HUD with health, cash, stars, weapon and objective, a live minimap with blips for every system, dialogue banners, start/pause/busted/wasted screens, procedural WebAudio (engine, siren, gunshots, chimes, ambient pad) and a localStorage save.

Performance is a design rule, not an afterthought: the static city is merged into a handful of draw calls, palms and lamps are instanced, AI updates are staggered, and an adaptive quality scaler (pixel ratio, shadow size, fog distance) defends a stable 60 fps.

## Solmar Bay v3

The v3 round deepens the systems already in the bay:

- **Foot police** — when a pursuit unit corners you on foot, its crew bails out and chases you down the sidewalk; roadblocks post a guard, officers count toward the bust meter and the minimap, and they walk back to their car and stand down when the heat dies.
- **Smarter Los Brasa** — gang members now spread to flank anchors, dive behind cover when the shooting starts or a member drops, peek to trade fire, and fall back when badly hurt.
- **Tito's Garage** — a second enterable interior at the east lot: drive a bent car onto the painted pad and Tito straightens it for $40. Hard crashes and car-to-car hits now dent your own car, and a wreck loses its top speed until it is repaired.
- **Arc turns** — traffic sweeps through junctions on a steering arc toward the exit lane instead of snapping sideways, and joins the boulevard the same way.
- **Drooping palms** — every frond is now two chained segments that kick up, then pitch down, so the crowns hang like real palms.

## Solmar Bay v4

The v4 round closes the gaps v3 left behind:

- **Armed officers** — foot police now carry pistols, under strict rules: they draw only at three stars or more, when Rico is shooting back, or (for a roadblock guard) when he flees past in a car. At one or two stars against an unarmed man they still only tackle and bust. Officer fire is slower and lighter than the gang's, so three stars is dangerous, not a death sentence.
- **Cover with a brain** — Los Brasa no longer pile onto the single nearest corner. Each dive scores several candidate corners and faces for real line-of-sight cover, fighting distance, and whether a squadmate has already claimed the spot, so a fight spreads across the street.
- **Tienda Brisa** — a third enterable interior, a corner shop on the west side where cash buys first aid ($30), a kevlar vest that soaks 60% of damage until it is shot away ($75), and pistol ammo ($25). Sales are atomic: no cash, no goods.
- **A cleaner garage shot** — the Tito's Garage frame is restaged low from the south-east corner, so the pad car, the lift and its coupe, and the bench wall all read at once.
- **Leaner sky and sea** — clouds and marina boats are merged into one mesh each, paying for the new shop while keeping draw calls and triangles at or below the v3 class. The full five-mission chain, bust and wasted respawns, taxi fares, the checkpoint race, garage repairs, package persistence and the shop till are now covered by an automated end-to-end playtest harness that drives the real game in headless Chromium.

## How to run it

Serve the `game/` folder with any static server, for example:

```sh
node serve.ts
```

Then open http://localhost:8080 in a desktop browser. Click **Play**, then click the city to grab the mouse.

**Controls** — WASD move/drive · mouse look · Shift run · E enter car / interact · Space handbrake · Click shoot · F melee · R reload · H horn · K save at the safehouse · P pause.

Deterministic screenshot states are available at `?shot=chase|drive|foot|garage&seed=1`, and `?demo=1` runs an autopilot drive used for frame-rate measurement.

## Handover

The entry program is `main.ts` (Node 22), which copies `game/` and `screenshots/` into the output directory and writes `dossier.json` for the judge:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## Competition

Built for the [gta6-01 bounty on make.fun](https://make.fun/bounty/gta6-01).

Try make.fun yourself: https://make.fun/r/znp998by
