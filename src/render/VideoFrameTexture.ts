import * as THREE from 'three/webgpu';

// ------------------------------------------------------------
// A texture fed by copying frames from a video element through
// a canvas. The canvas path works on every backend (Three's
// WebGPU backend binds videos as external textures, which
// Firefox does not fully support), lets the source video be
// swapped at runtime, and downscales large camera feeds.
//
// The canvas has a fixed size: the GPU texture is allocated the
// first time a material using it compiles, and resizing the
// canvas afterwards would not re-allocate it. Frames are drawn
// stretched to fill; `aspect` reports the video's real aspect.
// ------------------------------------------------------------

export class VideoFrameTexture {
  readonly texture: THREE.CanvasTexture;

  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;

  private video: HTMLVideoElement | null = null;
  private lastTime = -1;
  private hasFrame = false;
  private videoAspect = 16 / 9;

  constructor(width = 512, height = 288) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;

    const ctx = this.canvas.getContext('2d');

    if (!ctx) {
      throw new Error('Could not create 2D canvas context.');
    }

    this.ctx = ctx;

    // Start from a black frame rather than transparent garbage.
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
  }

  get ready(): boolean {
    return this.hasFrame;
  }

  // Aspect ratio of the source video (the canvas is stretched).
  get aspect(): number {
    return this.videoAspect;
  }

  setVideo(video: HTMLVideoElement | null): void {
    this.video = video;
    this.lastTime = -1;
    this.hasFrame = false;
  }

  // Copies the latest frame if the video has advanced. Returns
  // true when a new frame was uploaded.
  update(): boolean {
    const { video } = this;

    if (
      !video ||
      video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
      video.videoWidth === 0 ||
      video.currentTime === this.lastTime
    ) {
      return false;
    }

    this.lastTime = video.currentTime;
    this.videoAspect = video.videoWidth / video.videoHeight;

    this.ctx.drawImage(video, 0, 0, this.canvas.width, this.canvas.height);
    this.texture.needsUpdate = true;
    this.hasFrame = true;

    return true;
  }

  dispose(): void {
    this.texture.dispose();
  }
}
