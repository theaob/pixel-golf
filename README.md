# Pixel Golf

An 18-hole mobile mini golf game (Front Nine and Back Nine) with a low-res pixel-art look and cel shading, built with Three.js and Vite.

## Play

```bash
npm install
npm run dev      # serves on your LAN; open the printed URL on your phone
npm run build    # static build in dist/ (relative paths, host anywhere)
npm test         # headless check: every hole parses and a bot can sink each one
```

**Controls:** drag back from anywhere on the screen and release to putt (slingshot style). Pinch or scroll to zoom. The eye button shows the whole course.

## Android app

The game is wrapped as a native Android app with [Capacitor](https://capacitorjs.com/). The `android/` folder is a normal Android Studio project.

```bash
npm run build && npx cap sync android   # copy the latest web build into the app
npx cap open android                    # open in Android Studio, then Run
```

Every push runs `.github/workflows/android.yml`, which builds a debug APK. Download `pixel-golf-debug-apk` from the run's **Artifacts**, copy it to a phone and install it (allow installs from unknown sources).

Native touches: haptic feedback, the hardware back button opens/closes the pause menu (and exits from the title screen), the game pauses when the app goes to the background, portrait lock, fullscreen, and pixel-art launcher icons and splash screen (`python3 scripts/android-icons.py` regenerates them).

### Google Play release

The workflow also builds a signed release bundle (`.aab`) once these repository secrets exist:

| Secret | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | `base64 -w0 release.jks` |
| `ANDROID_KEYSTORE_PASSWORD` | keystore password |
| `ANDROID_KEY_ALIAS` | key alias |
| `ANDROID_KEY_PASSWORD` | key password |

Create the keystore once with `keytool -genkey -v -keystore release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias pixelgolf` and keep it safe: Play requires every update to be signed with the same key.

## How the look works

- **Cel shading:** every surface uses `MeshToonMaterial` with a 3-step gradient map, plus crisp `BasicShadowMap` shadows.
- **Pixel art:** the scene renders to a small target, about 200 px on the short side. The canvas is then scaled up by an exact integer factor with `image-rendering: pixelated`. The camera snaps to the pixel grid so nothing shimmers while it pans.
- **Outlines:** a composite shader reads the depth and view-space normal buffers. A depth Laplacian draws 1-px dark silhouette lines. Convex normal creases get a light rim highlight.

## Code map

| File | Purpose |
| --- | --- |
| `src/levels.js` | The 18 holes (two nines) as ASCII tile maps (legend at top of file) |
| `src/native.js` | Android hooks via Capacitor (haptics, back button, app pause); no-ops on the web |
| `src/course.js` | Parses levels and works out heights, slopes and walls (no rendering) |
| `src/physics.js` | Fixed-step ball physics: slopes, friction, sand, walls, bumpers, spinners, cup |
| `src/renderer.js` | Low-res render targets + outline/composite shader |
| `src/world.js` | Builds the cel-shaded meshes, water, flag and scenery |
| `src/main.js` | Game loop, camera, touch input, HUD and flow |
| `src/audio.js` | Synthesized chiptune sound effects (WebAudio, no assets) |

To add a hole, append a map to `FRONT_NINE` or `BACK_NINE` in `src/levels.js` (or add a new entry to `COURSES`) and run `npm test`.

## Deploying to GitHub Pages

`.github/workflows/deploy.yml` runs the tests, builds the game and publishes `dist/` to GitHub Pages on every push to `main`. You can also start it by hand from the Actions tab.

One-time setup: in the repo go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**. The game will then be at `https://<owner>.github.io/pixel-golf/`.
