# EyeTracker

EyeTracker is a browser-based interactive display that renders a 3D eye which
follows people seen by a camera.

It combines real-time face detection, Three.js rendering (WebGPU with WebGL
fallback), background video playback and a typewriter text overlay to create an
eye that appears to watch people as they move in front of the display.

When nobody is detected, the eye performs a slow idle animation. When a face is
detected, the eye locks onto that person and follows them.

## Features

- Real-time face detection with MediaPipe (BlazeFace), GPU accelerated
- Tracking input from a webcam, a local video file, or a network stream
  (direct MP4/WebM, HLS, or WebRTC via WHEP)
- 3D eye rendered with Three.js on WebGPU, falling back to WebGL
- GLB model with base colour and normal-map textures
- Physically based transmissive outer shell (optional cheap mode)
- Smooth eye tracking with dead zone, perspective curve and micro-saccades
- Multiple people tracked separately; newcomers get attention first, then
  focus rotates between people at random intervals
- Random idle eye movement when no face is visible
- Background video playlist, shuffled, with hot-reload from a manifest
- Priority background videos using the `01_` filename prefix
- Typewriter-style text when a face is detected
- Keyboard controls for the next background, debug view, settings and fullscreen
- Runs fully offline once built; no backend required

## Requirements

- Node.js 20 or newer (for building)
- A browser with WebGL 2 or WebGPU. Chrome or Chromium is recommended.
- Camera access requires HTTPS or `localhost`.

## Getting started

```bash
npm install
npm run dev
```

Open the printed URL. The settings panel appears on first run; pick a source
and press **Start**. The choice is remembered for next time, so a kiosk can
restart unattended.

Production build:

```bash
npm run build
npm run preview
```

The `dist/` folder is a static site and can be served by any web server.

## Controls

| Key | Action                       |
| --- | ---------------------------- |
| S   | Show / hide the settings panel |
| D   | Show / hide the detector debug view |
| F   | Toggle fullscreen            |
| →   | Skip to the next background video |

## Tracking sources

- **Webcam** uses `getUserMedia`. On a Raspberry Pi the camera module is
  exposed through V4L2 and shows up as a normal camera.
- **Video file** plays a local file in a loop.
- **Stream URL** accepts a direct MP4/WebM URL, an HLS playlist (`.m3u8`), or
  a WebRTC WHEP endpoint such as `http://host:8889/cam/whep` from MediaMTX.
  RTSP cannot be played by browsers; relay it through MediaMTX to WebRTC or
  HLS first. The remote server must send CORS headers, otherwise the browser
  will not let the tracker read the pixels.

YouTube is not supported directly because the embedded player runs in a
cross-origin frame and its pixels cannot be read. Resolve the video to a
direct stream URL with a tool such as yt-dlp and use that instead.

## Background videos

Put `.mp4` or `.webm` files in `public/assets/backgrounds/` and list them in
`public/assets/backgrounds/manifest.json`:

```json
{
  "videos": ["forest.mp4", "01_priority.mp4"]
}
```

The manifest is re-read every few seconds. Existing entries keep their
shuffled order, new entries are appended, and new entries whose name starts
with `01_` are queued to play next.

Two placeholder clips ship with the project: a CRT television showing static
(["Analog TV noise"](https://commons.wikimedia.org/wiki/File:Analog_TV_noise.ogv)
by JussiClone, CC BY-SA 3.0) and full-frame VHS tape static
(["FREE real VHS static"](https://commons.wikimedia.org/wiki/File:FREE_real_VHS_static.webm)
by Caleb Minear, CC0), both trimmed and re-encoded. See
`public/assets/backgrounds/README.md` for details.

For best results on low-end hardware, encode backgrounds at 640x360, 24 fps,
H.264, with no audio.

## Configuration

`public/config.json` is read at startup. Every key is optional; missing keys
fall back to the defaults in `src/config.ts`.

```json
{
  "camera": { "offsetX": 0, "offsetY": 0 },
  "tracking": { "maxYaw": 24, "maxPitch": 21 },
  "background": { "r": 0.04, "g": 0.04, "b": 0.04 },
  "text": { "message": "IM LOOKING AT YOU." },
  "rendering": {
    "transmission": "auto",
    "normalScale": 1.0,
    "forceWebGL": false,
    "maxPixelRatio": 1.5,
    "maxFps": 30
  }
}
```

- `camera.offsetX/Y` is a normalized bias (-1..1) added to the detected face position.
- `tracking.maxYaw/maxPitch` are the maximum rotation angles in degrees.
- `tracking.detectIntervalTrackingMs` and `detectIntervalIdleMs` set how
  often the detector runs while following a face and while nobody is
  present (defaults 120 and 300). Raise them on slow hardware.
- `tracking.focusHoldMinSeconds` / `focusHoldMaxSeconds` set the random hold
  time before the eye moves on to the next person when several are present.
  A newly arrived face always gets looked at immediately.
- `tracking.matchDistance`, `newFaceConfirmations`, `detectWidth/Height`,
  `minConfidence`, `faceTimeoutSeconds` and `mirror` tune the rest of the
  tracker.
- `motion.smoothingNear` / `smoothingFar` control how quickly the eye moves
  for small corrections and for big glances. `motion.microSaccade*` add tiny
  random fixation shifts; set the amplitude to `0` to disable them.
- `idle.*` controls the random look-around when nobody is present.
- `background.r/g/b` is the clear colour when no background video plays.
- `rendering.transmission` switches the outer shell between a transmissive
  glass material (`true`), a cheaper translucent one (`false`), or `"auto"`,
  which uses glass on WebGPU and the cheap shell on the WebGL fallback.
- `rendering.maxFps` caps the render rate; `0` renders at the display refresh
  rate. The tracker runs at the video's frame rate regardless.
- `rendering.maxPixelRatio` limits the device pixel ratio. Use `1` on a
  Raspberry Pi driving a 1080p display.
- `rendering.forceWebGL` disables WebGPU.

## Deploying to GitHub Pages

The workflow in `.github/workflows/deploy.yml` builds the site and publishes
it to GitHub Pages on every push to `main`. One-time setup in the repository:

1. Open **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.

The next push to `main` (or a manual run from the Actions tab) deploys to
`https://<user>.github.io/<repo>/`. The build sets `BASE_PATH` to the
repository name so all asset URLs resolve under that sub-path. Pages serves
over HTTPS, so webcam access works there.

To build for a sub-path locally:

```bash
BASE_PATH=/eye-tracker/ npm run build
npm run preview   # serves at http://localhost:4173/eye-tracker/
```

## Raspberry Pi kiosk

Build the site, serve `dist/` (for example with `npx serve dist` or nginx),
and launch Chromium in kiosk mode:

```bash
chromium-browser --kiosk --autoplay-policy=no-user-gesture-required \
  --use-fake-ui-for-media-stream http://localhost:3000/
```

`--use-fake-ui-for-media-stream` auto-accepts the camera permission prompt.

## Project structure

```text
EyeTracker/
├── index.html
├── .github/workflows/deploy.yml   GitHub Pages deployment
├── package.json
├── vite.config.ts
├── tsconfig.json
├── scripts/
│   └── copy-mediapipe.mjs     copies the MediaPipe WASM runtime into public/
├── public/
│   ├── config.json
│   ├── assets/
│   │   ├── eye.glb
│   │   ├── eye_basecolor.webp
│   │   ├── eye_normal.webp
│   │   ├── backgrounds/       videos + manifest.json
│   │   └── fonts/pixel.ttf
│   └── models/
│       └── blaze_face_short_range.tflite
└── src/
    ├── main.ts                wires everything together
    ├── config.ts              config loading and defaults
    ├── style.css
    ├── input/                 VideoSource, Webcam, File and URL sources
    ├── tracking/FaceTracker.ts
    ├── render/EyeScene.ts     Three.js scene, eye model, tracking rotation
    ├── render/Background.ts   background playlist and video texture
    └── ui/                    text overlay, source picker, debug view
```

## Software

- [Three.js](https://threejs.org/) (WebGPU renderer)
- [MediaPipe Tasks Vision](https://ai.google.dev/edge/mediapipe/solutions/vision/face_detector)
- [hls.js](https://github.com/video-dev/hls.js)
- [Vite](https://vite.dev/) and TypeScript
