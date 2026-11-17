[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/ninochaan/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/ninochaan/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# Solmar Bay

An original open-world crime game set in a sun-soaked coastal city. Explore on foot or by car, with traffic and pedestrians on the streets, cars to steal, a wanted level that brings the police after you, five story missions, combat, a HUD with a minimap, a start screen and a save. Built with three.js (vendored, so it plays offline) in a desktop browser. Nothing in it comes from any commercial game — every asset and line of code is original.

## How to run it

Serve the `game/` folder with any static server, for example:

```sh
node serve.ts
```

Then open http://localhost:8080 in a desktop browser.

The entry program is `main.ts` (Node 22), which copies `game/` and `screenshots/` into the output directory and writes `dossier.json` for the judge.

## Competition

Built for the [gta6-01 bounty on make.fun](https://make.fun/bounty/gta6-01).

Try make.fun yourself: https://make.fun/r/znp998by
