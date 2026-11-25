# Pixel Golf

A mobile-first mini golf game with a low-res pixel-art look and cel shading, built with Three.js and Vite.

## Play

```bash
npm install
npm run dev      # serves on your LAN; open the printed URL on your phone
npm run build    # static build in dist/ (relative paths, host anywhere)
npm test         # headless check: every hole parses and a bot can sink each one
```

**Controls:** drag back from anywhere on the screen and release to putt (slingshot style). Pinch or scroll to zoom. The eye button shows the whole course.

## How the look works

- **Cel shading:** every surface uses `MeshToonMaterial` with a 3-step gradient map, plus crisp `BasicShadowMap` shadows.
- **Pixel art:** the scene renders to a small target, about 200 px on the short side. The canvas is then scaled up by an exact integer factor with `image-rendering: pixelated`. The camera snaps to the pixel grid so nothing shimmers while it pans.
- **Outlines:** a composite shader reads the depth and view-space normal buffers. A depth Laplacian draws 1-px dark silhouette lines. Convex normal creases get a light rim highlight.

## Code map

| File | Purpose |
| --- | --- |
| `src/levels.js` | The 9 holes as ASCII tile maps (legend at top of file) |
| `src/course.js` | Parses levels and works out heights, slopes and walls (no rendering) |
| `src/physics.js` | Fixed-step ball physics: slopes, friction, sand, walls, bumpers, spinners, cup |
| `src/renderer.js` | Low-res render targets + outline/composite shader |
| `src/world.js` | Builds the cel-shaded meshes, water, flag and scenery |
| `src/main.js` | Game loop, camera, touch input, HUD and flow |
| `src/audio.js` | Synthesized chiptune sound effects (WebAudio, no assets) |

To add a hole, append a map to `LEVELS` in `src/levels.js` and run `npm test`.
