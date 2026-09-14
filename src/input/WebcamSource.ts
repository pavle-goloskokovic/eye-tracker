import {
  createVideoElement,
  removeVideoElement,
  waitForVideo,
  type VideoSource,
} from './VideoSource';

export interface WebcamOptions {
  deviceId?: string;
  width?: number;
  height?: number;
}

export class WebcamSource implements VideoSource {
  readonly kind = 'webcam' as const;
  readonly video: HTMLVideoElement;

  private stream: MediaStream | null = null;
  private readonly options: WebcamOptions;

  constructor(options: WebcamOptions = {}) {
    this.options = options;
    this.video = createVideoElement();
  }

  get label(): string {
    const track = this.stream?.getVideoTracks()[0];

    return track ? `Webcam: ${track.label}` : 'Webcam';
  }

  async start(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Camera access is not available. Use HTTPS or localhost.');
    }

    const constraints: MediaStreamConstraints = {
      audio: false,
      video: {
        deviceId: this.options.deviceId ? { exact: this.options.deviceId } : undefined,
        width: { ideal: this.options.width ?? 1280 },
        height: { ideal: this.options.height ?? 720 },
        frameRate: { ideal: 30 },
      },
    };

    this.stream = await navigator.mediaDevices.getUserMedia(constraints);

    this.video.srcObject = this.stream;

    await this.video.play();
    await waitForVideo(this.video);

    console.log('Webcam started:', this.label, `${this.video.videoWidth}x${this.video.videoHeight}`);
  }

  stop(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;

    removeVideoElement(this.video);
  }

  // Lists cameras. Labels are only available after permission
  // has been granted at least once.
  static async listDevices(): Promise<MediaDeviceInfo[]> {
    if (!navigator.mediaDevices?.enumerateDevices) {
      return [];
    }

    const devices = await navigator.mediaDevices.enumerateDevices();

    return devices.filter((device) => device.kind === 'videoinput');
  }
}
