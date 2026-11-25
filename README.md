# Supremacy

Open `Supremacy.html` in a browser. It is self-contained: three.js and the soldier model are embedded, so it also works offline from `file://`.

## 3D third-person battles

Battles are a third-person shooter built with three.js. The rules are the same as the old top-down battle:

- 5 vs 5. Win by wiping out the enemy squad, or by having more troops standing when the timer runs out (now 90 s, up from 60 s, because moving around a 3D field takes longer).
- Rifle (50 rounds) and handgun (12 rounds, harder hitting), with reloads.
- Mortar strikes from both sides, telegraphed by red circles on the ground. A hit leaves 25 % of your health.
- Headshots deal double damage. Sandbags are chest-high, ruins and stacked crates are full cover, and steel hedgehogs block movement but not bullets.
- Each sector gets its own cover layout, and harder sectors field more accurate enemies.

**PC:** click the view to lock the mouse. WASD/arrows move, the mouse looks, click or Space fires, right-click or Q aims down the sights, Shift sprints, R reloads, and 1/2 or the scroll wheel switches weapon. Esc releases the mouse.

**Touch:** drag on the left half to move, drag on the right half to look, hold FIRE to shoot (dragging from it also aims), and tap AIM to zoom.

## Soldier model

`assets/soldier.glb` is a game-ready LOD of `soldier_gunner.glb` from the procedural WWII asset pack: about 30k triangles (down from 955k), with 256 px textures. The source model is unrigged, so `src/battle3d/rig.js` rigs it at load time. It builds a 17-bone skeleton at measured joint positions and skins each material region to the right bones. The walk cycle, rifle and pistol holds (two-bone IK onto the gun's grips), aiming and the death fall are all procedural.

The face shape in the soldier model is derived from the MediaPipe canonical face model (Copyright Google LLC, Apache License 2.0).

## Building

```bash
npm install
npm run build                    # writes Supremacy.html
```

- `src/supremacy-app.html`: the original app bundle (map, diplomacy and so on). The build swaps its 2D battle component for `src/battle-screen.js`.
- `src/battle3d/`: the 3D battle. `game.js` holds the gameplay, AI, camera and input; `world.js` the battlefield and collision; `rig.js` the auto-rig and IK; `hud.js` the overlay; `audio.js` the synthesized sound effects.
- To regenerate the LOD from the full-detail model:

```bash
npm run optimize-model -- path/to/soldier_gunner.glb assets/soldier.glb
```

During a battle, `window.__battle3d.debug` exposes the game state in the dev console.
