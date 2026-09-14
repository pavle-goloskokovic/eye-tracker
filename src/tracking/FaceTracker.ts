import { FaceDetector, FilesetResolver } from '@mediapipe/tasks-vision';

import type { Config } from '../config';
import { assetUrl } from '../paths';

// ------------------------------------------------------------
// Face tracking
//
//   - the detector runs on a timer: faster while tracking,
//     slower while idle
//   - every detected face is matched to a track by proximity,
//     so several people are followed separately
//   - one track is the focus: a newly confirmed face takes focus
//     immediately, otherwise focus rotates between people after
//     a randomized hold time
//   - tracks disappear after a timeout without detections
//
// With the GPU delegate the video element is handed straight to
// MediaPipe, which resizes on the GPU. With the CPU delegate the
// frame is first downscaled into a small canvas. Mirroring is
// applied to the results, not the pixels.
// ------------------------------------------------------------

export interface FaceBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FacePosition {
  detected: boolean;

  // Normalized position of the focused face:
  //   x = -1 left,  0 centre, +1 right
  //   y = -1 top,   0 centre, +1 bottom
  x: number;
  y: number;

  // Face width relative to the frame width.
  size: number;

  // Focused face box in normalized (0..1) frame coordinates.
  box: FaceBox | null;

  // Number of confirmed faces currently tracked.
  faceCount: number;
}

interface Track {
  id: number;
  box: FaceBox;
  lastSeen: number;
  hits: number;
  confirmed: boolean;
  // When this track last held focus (for round-robin).
  lastFocused: number;
}

const EMPTY_FACE: FacePosition = {
  detected: false,
  x: 0,
  y: 0,
  size: 0,
  box: null,
  faceCount: 0,
};

export class FaceTracker {
  // Debug preview (and detector input on the CPU path).
  readonly canvas: HTMLCanvasElement;

  private readonly ctx: CanvasRenderingContext2D;
  private readonly settings: Config['tracking'];

  private detector: FaceDetector | null = null;
  private delegate: 'GPU' | 'CPU' = 'GPU';

  // When false, nothing is drawn into the canvas.
  private debugEnabled = false;

  private latest: FacePosition = { ...EMPTY_FACE };

  private tracks: Track[] = [];
  private nextTrackId = 1;

  private focusId: number | null = null;
  private focusSince = 0;
  private focusHoldMs = 0;

  private lastDetectionTime = -Infinity;
  private lastVideoTime = -1;
  private lastTimestamp = 0;

  private fpsFrames = 0;
  private fpsDetections = 0;
  private fpsTime = performance.now();
  private fps = 0;
  private detectionsPerSecond = 0;
  private lastRawDetections = 0;

  constructor(settings: Config['tracking']) {
    this.settings = settings;

    this.canvas = document.createElement('canvas');
    this.canvas.width = settings.detectWidth;
    this.canvas.height = settings.detectHeight;

    const ctx = this.canvas.getContext('2d');

    if (!ctx) {
      throw new Error('Could not create 2D canvas context.');
    }

    this.ctx = ctx;
  }

  get backend(): string {
    return this.delegate;
  }

  setDebugEnabled(enabled: boolean): void {
    this.debugEnabled = enabled;
  }

  // --------------------------------------------------------
  // Model loading
  // --------------------------------------------------------

  async init(): Promise<void> {
    const fileset = await FilesetResolver.forVisionTasks(assetUrl('mediapipe/wasm'));

    const create = (delegate: 'GPU' | 'CPU') =>
      FaceDetector.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: assetUrl('models/blaze_face_short_range.tflite'),
          delegate,
        },
        runningMode: 'VIDEO',
        minDetectionConfidence: this.settings.minConfidence,
      });

    try {
      this.detector = await create('GPU');
      this.delegate = 'GPU';
    } catch (error) {
      console.warn('GPU face detector failed, falling back to CPU:', error);

      this.detector = await create('CPU');
      this.delegate = 'CPU';
    }

    console.log(`Face detector loaded (${this.delegate})`);
  }

  // Forget all tracks, e.g. when the input source changes.
  reset(): void {
    this.tracks = [];
    this.nextTrackId = 1;
    this.focusId = null;
    this.latest = { ...EMPTY_FACE };
    this.lastVideoTime = -1;
    this.lastDetectionTime = -Infinity;
  }

  // --------------------------------------------------------
  // Per-frame update
  // --------------------------------------------------------

  update(video: HTMLVideoElement | null): FacePosition {
    const now = performance.now();

    const hasFrame =
      !!this.detector &&
      !!video &&
      video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
      video.videoWidth > 0 &&
      video.currentTime !== this.lastVideoTime;

    if (!hasFrame) {
      // No new frame: still expire stale tracks.
      this.pruneTracks(now);
      this.updateFocus(now);
      this.latest = this.buildResult();

      return this.latest;
    }

    this.lastVideoTime = video.currentTime;

    // The CPU path detects on a downscaled copy; the GPU path
    // reads the video directly.
    const useCanvas = this.delegate === 'CPU';

    // Detect on a timer, faster while tracking than while idle.
    const interval =
      this.focusId !== null
        ? this.settings.detectIntervalTrackingMs
        : this.settings.detectIntervalIdleMs;

    const runDetection = now - this.lastDetectionTime >= interval;

    if (useCanvas && (runDetection || this.debugEnabled)) {
      this.drawFrame(video);
    }

    if (runDetection) {
      this.lastDetectionTime = now;
      this.fpsDetections++;

      const source = useCanvas ? this.canvas : video;
      const frameWidth = useCanvas ? this.canvas.width : video.videoWidth;
      const frameHeight = useCanvas ? this.canvas.height : video.videoHeight;

      // MediaPipe requires strictly increasing timestamps.
      const timestamp = Math.max(now, this.lastTimestamp + 1);

      this.lastTimestamp = timestamp;

      const detections = this.detector!.detectForVideo(source, timestamp).detections;

      this.lastRawDetections = detections.length;

      const faces: FaceBox[] = [];

      for (const detection of detections) {
        const box = detection.boundingBox;

        if (!box) {
          continue;
        }

        // Normalize to 0..1 and mirror if requested.
        const w = box.width / frameWidth;
        const h = box.height / frameHeight;
        const x = box.originX / frameWidth;
        const y = box.originY / frameHeight;

        // Tiny boxes are almost always false positives.
        if (w < this.settings.minFaceSize) {
          continue;
        }

        faces.push({
          x: this.settings.mirror ? 1 - x - w : x,
          y,
          w,
          h,
        });
      }

      this.matchTracks(faces, now);
    }

    this.pruneTracks(now);
    this.updateFocus(now);

    this.latest = this.buildResult();

    this.updateFps(now);

    if (this.debugEnabled) {
      if (!useCanvas) {
        this.drawFrame(video);
      }

      this.drawDebug();
    }

    return this.latest;
  }

  // --------------------------------------------------------
  // Track matching
  // --------------------------------------------------------

  private matchTracks(faces: FaceBox[], now: number): void {
    // Biggest faces first so they get first pick of tracks.
    const ordered = [...faces].sort((a, b) => b.w * b.h - a.w * a.h);
    const claimed = new Set<number>();

    for (const face of ordered) {
      const cx = face.x + face.w * 0.5;
      const cy = face.y + face.h * 0.5;

      // Allow a bit more slack for big (close) faces, which move
      // more pixels per step.
      const maxDistance = Math.max(this.settings.matchDistance, face.w);

      let best: Track | null = null;
      let bestDistance = maxDistance;

      for (const track of this.tracks) {
        if (claimed.has(track.id)) {
          continue;
        }

        const tx = track.box.x + track.box.w * 0.5;
        const ty = track.box.y + track.box.h * 0.5;
        const distance = Math.hypot(cx - tx, cy - ty);

        if (distance < bestDistance) {
          bestDistance = distance;
          best = track;
        }
      }

      if (best) {
        best.box = face;
        best.lastSeen = now;
        best.hits++;

        if (!best.confirmed && best.hits >= this.settings.newFaceConfirmations) {
          best.confirmed = true;

          console.log(`Face ${best.id} confirmed`);

          // A newcomer gets looked at right away.
          this.setFocus(best, now);
        }

        claimed.add(best.id);
      } else {
        const track: Track = {
          id: this.nextTrackId++,
          box: face,
          lastSeen: now,
          hits: 1,
          confirmed: this.settings.newFaceConfirmations <= 1,
          lastFocused: -Infinity,
        };

        this.tracks.push(track);
        claimed.add(track.id);

        if (track.confirmed) {
          this.setFocus(track, now);
        }
      }
    }
  }

  private pruneTracks(now: number): void {
    const timeoutMs = this.settings.faceTimeoutSeconds * 1000;

    this.tracks = this.tracks.filter((track) => {
      const alive = now - track.lastSeen < timeoutMs;

      if (!alive && track.confirmed) {
        console.log(`Face ${track.id} lost`);
      }

      return alive;
    });

    // Ids must stay unique while faces are present (that is how a
    // newcomer is told apart from someone already here), but they
    // can start over once the scene is empty.
    if (this.tracks.length === 0) {
      this.nextTrackId = 1;
    }
  }

  // --------------------------------------------------------
  // Focus selection
  // --------------------------------------------------------

  private get focused(): Track | null {
    return this.tracks.find((track) => track.id === this.focusId) ?? null;
  }

  private updateFocus(now: number): void {
    const confirmed = this.tracks.filter((track) => track.confirmed);
    const current = this.focused;

    if (confirmed.length === 0) {
      if (this.focusId !== null) {
        console.log('No faces - idle');
      }

      this.focusId = null;

      return;
    }

    // Focused face is gone: move on immediately.
    if (!current) {
      this.setFocus(this.pickNext(confirmed, null), now);

      return;
    }

    // Several people: rotate after the hold time.
    if (confirmed.length > 1 && now - this.focusSince >= this.focusHoldMs) {
      this.setFocus(this.pickNext(confirmed, current), now);
    }
  }

  // Least recently focused track other than `except`; ties go
  // to the biggest face.
  private pickNext(candidates: Track[], except: Track | null): Track {
    let best: Track | null = null;

    for (const track of candidates) {
      if (track === except) {
        continue;
      }

      if (
        !best ||
        track.lastFocused < best.lastFocused ||
        (track.lastFocused === best.lastFocused &&
          track.box.w * track.box.h > best.box.w * best.box.h)
      ) {
        best = track;
      }
    }

    return best ?? except!;
  }

  private setFocus(track: Track, now: number): void {
    if (track.id === this.focusId) {
      return;
    }

    const previous = this.focused;

    if (previous) {
      previous.lastFocused = now;
    }

    this.focusId = track.id;
    this.focusSince = now;

    const { focusHoldMinSeconds, focusHoldMaxSeconds } = this.settings;

    this.focusHoldMs =
      (focusHoldMinSeconds + Math.random() * (focusHoldMaxSeconds - focusHoldMinSeconds)) * 1000;

    console.log(`Focus -> face ${track.id} (${(this.focusHoldMs / 1000).toFixed(1)}s)`);
  }

  private buildResult(): FacePosition {
    const focus = this.focused;
    const faceCount = this.tracks.filter((track) => track.confirmed).length;

    if (!focus) {
      return { ...EMPTY_FACE, faceCount };
    }

    const { box } = focus;

    return {
      detected: true,
      x: (box.x + box.w * 0.5) * 2 - 1,
      y: (box.y + box.h * 0.5) * 2 - 1,
      size: box.w,
      box: { ...box },
      faceCount,
    };
  }

  // --------------------------------------------------------
  // Canvas drawing (CPU detector input and debug preview)
  // --------------------------------------------------------

  private drawFrame(video: HTMLVideoElement): void {
    const { width, height } = this.canvas;
    const ctx = this.ctx;

    ctx.save();

    if (this.settings.mirror) {
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(video, 0, 0, width, height);
    ctx.restore();
  }

  private updateFps(now: number): void {
    this.fpsFrames++;

    const elapsed = (now - this.fpsTime) / 1000;

    if (elapsed >= 1) {
      this.fps = this.fpsFrames / elapsed;
      this.detectionsPerSecond = this.fpsDetections / elapsed;
      this.fpsFrames = 0;
      this.fpsDetections = 0;
      this.fpsTime = now;
    }
  }

  private drawDebug(): void {
    const ctx = this.ctx;
    const { width, height } = this.canvas;

    for (const track of this.tracks) {
      const x = track.box.x * width;
      const y = track.box.y * height;
      const w = track.box.w * width;
      const h = track.box.h * height;

      const focused = track.id === this.focusId;
      const color = focused ? '#00ff00' : track.confirmed ? '#ffdd00' : '#888888';

      ctx.strokeStyle = color;
      ctx.lineWidth = focused ? 3 : 1.5;
      ctx.strokeRect(x, y, w, h);

      ctx.fillStyle = color;
      ctx.font = 'bold 14px sans-serif';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`#${track.id}`, x + 3, y - 2);

      if (focused) {
        ctx.fillStyle = '#ff0000';
        ctx.beginPath();
        ctx.arc(x + w * 0.5, y + h * 0.5, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.fillStyle = '#00ff00';
    ctx.font = 'bold 16px sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText(
      `FPS: ${Math.round(this.fps)}  det/s: ${this.detectionsPerSecond.toFixed(1)}  raw: ${this.lastRawDetections}  faces: ${this.latest.faceCount}  (${this.delegate})`,
      10,
      10,
    );
  }
}
