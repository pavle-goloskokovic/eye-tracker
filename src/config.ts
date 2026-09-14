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

    // Per-frame smoothing factor (0..1). Higher = snappier.
    smoothing: number;

    // Targets smaller than this are treated as centre.
    deadZone: number;

    // Detector input size and cadence.
    detectWidth: number;
    detectHeight: number;
    detectEveryNFrames: number;

    // Detector confidence threshold (0..1).
    minConfidence: number;

    // Lock handling.
    maxMissedDetections: number;
    faceTimeoutSeconds: number;

    // Mirror the camera image horizontally.
    mirror: boolean;
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
    // Use a physically based transmissive glass shell for the
    // outer eye. Heavier on low-end GPUs; set false for a cheap
    // translucent shell instead.
    transmission: boolean;

    // Strength of the normal map on the eyeball.
    normalScale: number;

    // Force the WebGL backend even when WebGPU is available.
    forceWebGL: boolean;

    // Upper bound for devicePixelRatio.
    maxPixelRatio: number;
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
    smoothing: 0.1,
    deadZone: 0.03,
    detectWidth: 320,
    detectHeight: 240,
    detectEveryNFrames: 3,
    minConfidence: 0.6,
    maxMissedDetections: 8,
    faceTimeoutSeconds: 1.0,
    mirror: true,
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
    folder: '/assets/backgrounds/',
    manifest: '/assets/backgrounds/manifest.json',
    rescanSeconds: 5,
  },
  text: {
    message: 'IM LOOKING AT YOU.',
    charDelaySeconds: 0.08,
    fontSizePx: 48,
  },
  rendering: {
    transmission: true,
    normalScale: 1.0,
    forceWebGL: false,
    maxPixelRatio: 2,
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

export async function loadConfig(url = '/config.json'): Promise<Config> {
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
