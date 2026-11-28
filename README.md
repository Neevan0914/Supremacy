# Supremacy

A hex-map conquest game with real-time 3D squad battles. Everything ships as a
single file: open `Supremacy.html` in a browser.

## Graphics settings

**⚙ Settings** (title screen, or the bottom bar in-game) has a **Graphics
Quality** option. The choice is saved in the browser and takes effect from the
next battle. The default is **High** on desktop and **Medium** on touch devices.

| Level  | What you get |
| ------ | ------------ |
| Low    | The original look. Fastest. |
| Medium | Physical HDR sky with clouds, sun + image-based lighting, procedural PBR textures (albedo/normal/roughness), detailed rifles, pistols, pines, rocks and sandbags, wet puddles that reflect the sky, volumetric-looking smoke and fireballs. |
| High   | Adds wind-animated grass, GTAO ambient occlusion, HDR bloom, filmic grading (vignette, grain, lens fringing), muzzle-flash lighting, 4× MSAA. |
| Ultra  | Adds real-time planar reflections in puddles, 4096 px shadow maps, cloth-sheen and clear-coat materials, denser grass and full device resolution. Needs a strong GPU. |

## Building the 3D battle

The battle engine is readable source in `src/battle3d/` (three.js r169), built
with esbuild and spliced into `Supremacy.html`:

```bash
npm install
npm run build
```

- `src/battle3d/game.js`: battle gameplay, world and soldiers
- `src/battle3d/graphics/`: quality presets, render pipeline, sky, ground,
  grass, procedural textures, detailed models and effects
- `src/app/settings.js`: the Settings dialog, injected into the pre-built app
  by `build/patch_app.py`
