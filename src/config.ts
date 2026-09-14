import { assetUrl } from './paths';

// ------------------------------------------------------------
// Runtime configuration
//
// Loaded from /config.json. Every key is optional; anything
// missing falls back to the defaults below (which mirror the
// values from the original config.ini).
// ------------------------------------------------------------

export interface Config {
  camera: {
    // Normalized bias (-1..1) added to the detected face position.
    offsetX: number;
    offsetY: number;
  };

  tracking: {
    // Maximum eye rotation in degrees.
    maxYaw: number;
    maxPitch: number;

    // Detector input size (debug preview and CPU fallback).
    detectWidth: number;
    detectHeight: number;

    // How often the detector runs, in milliseconds, while a face
    // is being tracked and while idle. Idle can be much slower
    // since nothing depends on latency until someone shows up.
    detectIntervalTrackingMs: number;
    detectIntervalIdleMs: number;

    // Detector confidence threshold (0..1).
    minConfidence: number;

    // Seconds without a detection before a face is dropped.
    faceTimeoutSeconds: number;

    // Multiple faces: a detection within this distance (normalized
    // frame units, or one face width if larger) of an existing
    // track is the same person.
    matchDistance: number;

    // Consecutive detections before a new face counts. Filters
    // single-frame false positives.
    newFaceConfirmations: number;

    // With several people present, focus rotates to the next one
    // after a random hold time in this range (seconds).
    focusHoldMinSeconds: number;
    focusHoldMaxSeconds: number;

    // Mirror the camera image horizontally.
    mirror: boolean;
  };

  motion: {
    // Per-frame smoothing (0..1) for small corrections and for
    // large moves such as switching to another face. Higher is
    // snappier; the two are blended by distance to the target.
    smoothingNear: number;
    smoothingFar: number;

    // Targets smaller than this are treated as centre.
    deadZone: number;

    // Tiny random fixation shifts so the eye never sits dead
    // still. Amplitude in normalized units, timing in seconds.
    microSaccadeAmplitude: number;
    microSaccadeMinSeconds: number;
    microSaccadeMaxSeconds: number;
  };

  idle: {
    // Random look-around when nobody is detected.
    rangeX: number;
    rangeY: number;
    minIntervalSeconds: number;
    maxIntervalSeconds: number;
  };

  background: {
    // Clear colour shown when no background video is playing.
    r: number;
    g: number;
    b: number;

    // Playlist manifest location and how often to re-read it.
    folder: string;
    manifest: string;
    rescanSeconds: number;
  };

  text: {
    message: string;
    charDelaySeconds: number;
    fontSizePx: number;
  };

  rendering: {
    // Outer eye shell material:
    //   true   physically based transmissive glass (heavier)
    //   false  cheap translucent shell
    //   'auto' glass on WebGPU, cheap shell on the WebGL fallback
    transmission: boolean | 'auto';

    // Strength of the normal map on the eyeball.
    normalScale: number;

    // Force the WebGL backend even when WebGPU is available.
    forceWebGL: boolean;

    // Upper bound for devicePixelRatio.
    maxPixelRatio: number;

    // Frame rate cap for rendering. 0 = display refresh rate.
    maxFps: number;
  };
}

export const DEFAULT_CONFIG: Config = {
  camera: {
    offsetX: 0,
    offsetY: 0,
  },
  tracking: {
    maxYaw: 24,
    maxPitch: 21,
    detectWidth: 320,
    detectHeight: 240,
    detectIntervalTrackingMs: 120,
    detectIntervalIdleMs: 300,
    minConfidence: 0.5,
    faceTimeoutSeconds: 1.0,
    matchDistance: 0.2,
    newFaceConfirmations: 2,
    focusHoldMinSeconds: 3,
    focusHoldMaxSeconds: 7,
    mirror: true,
  },
  motion: {
    smoothingNear: 0.1,
    smoothingFar: 0.28,
    deadZone: 0.03,
    microSaccadeAmplitude: 0.025,
    microSaccadeMinSeconds: 0.6,
    microSaccadeMaxSeconds: 2.5,
  },
  idle: {
    rangeX: 0.5,
    rangeY: 0.3,
    minIntervalSeconds: 1.5,
    maxIntervalSeconds: 3.5,
  },
  background: {
    r: 0.04,
    g: 0.04,
    b: 0.04,
    folder: 'assets/backgrounds/',
    manifest: 'assets/backgrounds/manifest.json',
    rescanSeconds: 5,
  },
  text: {
    message: 'IM LOOKING AT YOU.',
    charDelaySeconds: 0.08,
    fontSizePx: 48,
  },
  rendering: {
    transmission: 'auto',
    normalScale: 1.0,
    forceWebGL: false,
    maxPixelRatio: 1.5,
    maxFps: 30,
  },
};

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

function merge<T extends object>(base: T, override: DeepPartial<T> | undefined): T {
  if (!override) {
    return base;
  }

  const result: Record<string, unknown> = { ...(base as Record<string, unknown>) };

  for (const [key, value] of Object.entries(override)) {
    const current = result[key];

    if (
      value !== null &&
      typeof value === 'object' &&
      current !== null &&
      typeof current === 'object'
    ) {
      result[key] = merge(current as object, value as object);
    } else if (value !== undefined) {
      result[key] = value;
    }
  }

  return result as T;
}

export async function loadConfig(url = assetUrl('config.json')): Promise<Config> {
  try {
    const response = await fetch(url, { cache: 'no-store' });

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    const json = (await response.json()) as DeepPartial<Config>;
    const config = merge(DEFAULT_CONFIG, json);

    console.log('Loaded config:', url);

    return config;
  } catch (error) {
    console.warn('Could not load config, using defaults:', error);

    return DEFAULT_CONFIG;
  }
}
