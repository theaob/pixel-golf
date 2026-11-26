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

## Courses

| Course | Difficulty | Concept | Unlock |
| --- | --- | --- | --- |
| Front Nine | Easy | The basics | open |
| Back Nine | Medium | Ramps, islands, pinball | open |
| Frost Peak | Medium | Ice (`i`) is nearly frictionless | 12 ★ |
| Desert Canyon | Medium | Boost pads (`→←↑↓`) launch the ball | 24 ★ |
| Volcano Isle | Hard | Water becomes lava; narrow paths | 40 ★ |
| Neon Space | Expert | Portals (`@` in, `&` out) | 56 ★ |

Each course has its own theme (`src/themes.js`): palette, lighting, scenery and sky. The Daily Hole rotates through the themes. Stars unlock later courses, which rewards replaying holes for 3 stars.

`node tests/calibrate.js [courseId] [trials]` runs a bot with human-like aim error (±3°, ±8% power) to estimate strokes per hole. It's how the pars and difficulty labels were set; results are noisy, so use 12+ trials.

## Clubs and ads

Clubs (Pro Shop → Clubs) change how shots play: a longer aim line, more power, or an aim line that previews the real shot path through 1–3 bounces. The game earns money from ads, mostly opt-in rewarded videos (double coins, mulligan, try a club, save a streak, free coins) plus rare, strictly paced interstitials. See [docs/monetization.md](docs/monetization.md) for the full design and the go-live checklist. Ads use Google's test IDs until you replace them. On the web, add `?ads=mock` to try every ad flow with placeholder ads.

## Keep-coming-back features

- **Daily Hole:** a new procedurally generated hole every day (`src/daily.js`), the same for everyone on that date. Your first finish of the day counts; replays are for fun. `npm test` plays 45 days of generated holes with the bot, and `node tests/daily.test.js 365` checks a full year.
- **Streak:** finishing the daily hole on consecutive days grows a 🔥 streak that boosts the coin reward.
- **Daily gift:** coins for opening the game each day, growing for consecutive days.
- **Stars:** every hole awards 1–3 stars (finish / par / under par). Each nine has 27 to collect, and new stars pay a bonus.
- **Ball shop:** spend coins on ball skins with coloured trails.
- **Share:** a spoiler-free result for the daily hole (system share sheet on Android, clipboard on desktop).
- **Reminders (Android):** opt-in local notification the next day, at about the time you played, mentioning your streak. Toggle it in the pause menu.

Progress lives in `src/progress.js` (unit tested in `tests/progress.test.js`). It is saved in local storage and, on Android, backed up to native storage.

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
| `src/native.js` | Android hooks via Capacitor (haptics, back button, app pause, reminders, share, save backup); web fallbacks |
| `src/daily.js` | Daily hole generator (seeded by date) and connectivity check |
| `src/progress.js` | Coins, stars, streaks, gift, skins, clubs, settings |
| `src/ads.js` | AdMob wrapper, consent, interstitial pacing rules, web mock |
| `src/themes.js` | Course themes: palette, lighting, scenery |
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
