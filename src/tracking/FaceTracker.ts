import { FaceDetector, FilesetResolver } from '@mediapipe/tasks-vision';

import type { Config } from '../config';

// ------------------------------------------------------------
// Face tracking
//
// Mirrors the behaviour of the original Camera.cpp:
//
//   - frames are downscaled (and mirrored) into a small canvas
//   - the detector runs every N frames
//   - with no lock, the biggest face wins
//   - once locked, the face nearest the previous one wins
//   - the lock drops after N misses or a timeout
// ------------------------------------------------------------

export interface FaceBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FacePosition {
  detected: boolean;

  // Normalized position:
  //   x = -1 left,  0 centre, +1 right
  //   y = -1 top,   0 centre, +1 bottom
  x: number;
  y: number;

  // Face width relative to the detector frame width.
  size: number;

  // Box in detector-canvas pixels (for the debug view).
  box: FaceBox | null;
}

const EMPTY_FACE: FacePosition = {
  detected: false,
  x: 0,
  y: 0,
  size: 0,
  box: null,
};

export class FaceTracker {
  // Detector input; also doubles as the debug preview.
  readonly canvas: HTMLCanvasElement;

  private readonly ctx: CanvasRenderingContext2D;
  private readonly settings: Config['tracking'];

  private detector: FaceDetector | null = null;
  private delegate: 'GPU' | 'CPU' = 'GPU';

  private latest: FacePosition = { ...EMPTY_FACE };

  private targetLocked = false;
  private lockedCenterX = 0;
  private lockedCenterY = 0;
  private missedDetections = 0;
  private lastFaceSeen = performance.now();

  private frameCounter = 0;
  private lastVideoTime = -1;
  private lastTimestamp = 0;

  private fpsFrames = 0;
  private fpsTime = performance.now();
  private fps = 0;

  constructor(settings: Config['tracking']) {
    this.settings = settings;

    this.canvas = document.createElement('canvas');
    this.canvas.width = settings.detectWidth;
    this.canvas.height = settings.detectHeight;

    const ctx = this.canvas.getContext('2d', { willReadFrequently: true });

    if (!ctx) {
      throw new Error('Could not create 2D canvas context.');
    }

    this.ctx = ctx;
  }

  get backend(): string {
    return this.delegate;
  }

  // --------------------------------------------------------
  // Model loading
  // --------------------------------------------------------

  async init(): Promise<void> {
    const fileset = await FilesetResolver.forVisionTasks('/mediapipe/wasm');

    const create = (delegate: 'GPU' | 'CPU') =>
      FaceDetector.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: '/models/blaze_face_short_range.tflite',
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

  // Forget the current lock, e.g. when the input source changes.
  reset(): void {
    this.clearLock();
    this.latest = { ...EMPTY_FACE };
    this.lastVideoTime = -1;
    this.frameCounter = 0;
  }

  // --------------------------------------------------------
  // Per-frame update
  // --------------------------------------------------------

  update(video: HTMLVideoElement | null): FacePosition {
    const now = performance.now();

    if (
      !this.detector ||
      !video ||
      video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
      video.videoWidth === 0
    ) {
      this.applyTimeout(now);

      return this.latest;
    }

    // Only do work when the video has advanced.
    if (video.currentTime === this.lastVideoTime) {
      this.applyTimeout(now);

      return this.latest;
    }

    this.lastVideoTime = video.currentTime;

    // ----------------------------------------------------
    // Downscale (and mirror) into the detector canvas
    // ----------------------------------------------------

    const { width, height } = this.canvas;
    const ctx = this.ctx;

    ctx.save();

    if (this.settings.mirror) {
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(video, 0, 0, width, height);
    ctx.restore();

    // ----------------------------------------------------
    // Detect every N frames
    // ----------------------------------------------------

    this.frameCounter++;

    const result: FacePosition = { ...this.latest };

    if (this.frameCounter >= this.settings.detectEveryNFrames) {
      this.frameCounter = 0;

      // MediaPipe requires strictly increasing timestamps.
      const timestamp = Math.max(now, this.lastTimestamp + 1);

      this.lastTimestamp = timestamp;

      const detections = this.detector.detectForVideo(this.canvas, timestamp).detections;

      const faces: FaceBox[] = [];

      for (const detection of detections) {
        const box = detection.boundingBox;

        if (box) {
          faces.push({
            x: box.originX,
            y: box.originY,
            w: box.width,
            h: box.height,
          });
        }
      }

      this.selectFace(faces, result, now);
    }

    // ----------------------------------------------------
    // Timeout
    // ----------------------------------------------------

    const timeSinceFace = (now - this.lastFaceSeen) / 1000;

    if (result.detected && timeSinceFace >= this.settings.faceTimeoutSeconds) {
      console.log('Face timeout - target cleared');

      this.clearLock();

      Object.assign(result, EMPTY_FACE);
    }

    this.latest = result;

    this.updateFps(now);
    this.drawDebug(result);

    return this.latest;
  }

  // --------------------------------------------------------
  // Pick which detected face to follow
  // --------------------------------------------------------

  private selectFace(faces: FaceBox[], result: FacePosition, now: number): void {
    if (faces.length === 0) {
      this.missedDetections++;

      if (this.missedDetections >= this.settings.maxMissedDetections) {
        if (this.targetLocked) {
          console.log('Target lost - searching again');
        }

        this.targetLocked = false;
        this.missedDetections = 0;
      }

      return;
    }

    let best = -1;

    if (!this.targetLocked) {
      // No target yet: choose the biggest face.
      let bestArea = 0;

      faces.forEach((face, index) => {
        const area = face.w * face.h;

        if (area > bestArea) {
          bestArea = area;
          best = index;
        }
      });
    } else {
      // Already tracking: choose the face closest to the previous one.
      let bestDistance = Number.POSITIVE_INFINITY;

      faces.forEach((face, index) => {
        const dx = face.x + face.w * 0.5 - this.lockedCenterX;
        const dy = face.y + face.h * 0.5 - this.lockedCenterY;
        const distance = dx * dx + dy * dy;

        if (distance < bestDistance) {
          bestDistance = distance;
          best = index;
        }
      });
    }

    if (best < 0) {
      return;
    }

    const face = faces[best];
    const centerX = face.x + face.w * 0.5;
    const centerY = face.y + face.h * 0.5;

    this.lockedCenterX = centerX;
    this.lockedCenterY = centerY;
    this.lastFaceSeen = now;
    this.targetLocked = true;
    this.missedDetections = 0;

    result.detected = true;
    result.x = (centerX / this.canvas.width) * 2 - 1;
    result.y = (centerY / this.canvas.height) * 2 - 1;
    result.size = face.w / this.canvas.width;
    result.box = { ...face };
  }

  private applyTimeout(now: number): void {
    const timeSinceFace = (now - this.lastFaceSeen) / 1000;

    if (this.latest.detected && timeSinceFace >= this.settings.faceTimeoutSeconds) {
      this.clearLock();
      this.latest = { ...EMPTY_FACE };
    }
  }

  private clearLock(): void {
    this.targetLocked = false;
    this.missedDetections = 0;
    this.lockedCenterX = 0;
    this.lockedCenterY = 0;
  }

  // --------------------------------------------------------
  // Debug overlay drawn on the detector canvas
  // --------------------------------------------------------

  private updateFps(now: number): void {
    this.fpsFrames++;

    const elapsed = (now - this.fpsTime) / 1000;

    if (elapsed >= 1) {
      this.fps = this.fpsFrames / elapsed;
      this.fpsFrames = 0;
      this.fpsTime = now;
    }
  }

  private drawDebug(face: FacePosition): void {
    const ctx = this.ctx;

    if (face.detected && face.box) {
      const { x, y, w, h } = face.box;

      ctx.strokeStyle = '#00ff00';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);

      ctx.fillStyle = '#ff0000';
      ctx.beginPath();
      ctx.arc(x + w * 0.5, y + h * 0.5, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = '#00ff00';
    ctx.font = 'bold 18px sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText(`FPS: ${Math.round(this.fps)} (${this.delegate})`, 10, 10);
  }
}
