# torus-24 A/B candidate capture

- Captured: 2026-07-29 04:34 KST
- Viewport: 1280×720
- Seed: `20260728`
- Build: `torus-24`
- Baselines consulted first: `locked/wrong-transition-strip.png`, `locked/b-composition.png`, `experiments/projectile-silhouette-ab.png`

## A — heavy interceptor control

- `torus-24-a-reward.png`: full frame after the first correct word physically settled. HUD shows `ESCORT 1/1` and `4 BARRELS`; one large escort is visible beside the player.
- `torus-24-a-escort-crop.png`: crop of player + single escort.
- `torus-24-a-wrong.png`: full frame 260ms after the wrong-answer confirmation. Round red bodies preserve the v21 control silhouette, palette, source-position warning, and 11px velocity-opposed tail.
- `torus-24-a-round-crop.png`: crop of the round control volley.

## B — blizzard arrow experiment

- `torus-24-b-reward.png`: full frame after the first physical reward, followed by actual rightward movement. A broad circular blizzard remains along the movement path.
- `torus-24-b-blizzard-crop.png`: crop showing the field center, radial fill, broad rings, snow streaks, and player offset.
- `torus-24-b-wrong.png`: full frame 260ms after the wrong-answer confirmation. The same red palette/source/timing/velocity layer uses only the explicitly opened arrow silhouette.
- `torus-24-b-arrow-crop.png`: crop of the arrow experiment volley.

`torus-24-ab-plate.png` is the 2×2 comparison plate. These are candidate evidence and do not replace any locked golden master.
