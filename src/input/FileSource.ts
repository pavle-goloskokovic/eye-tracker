import {
  createVideoElement,
  removeVideoElement,
  waitForVideo,
  type VideoSource,
} from './VideoSource';

export class FileSource implements VideoSource {
  readonly kind = 'file' as const;
  readonly video: HTMLVideoElement;

  private readonly file: File;
  private objectUrl: string | null = null;

  constructor(file: File) {
    this.file = file;
    this.video = createVideoElement();
    this.video.loop = true;
  }

  get label(): string {
    return `File: ${this.file.name}`;
  }

  async start(): Promise<void> {
    this.objectUrl = URL.createObjectURL(this.file);

    this.video.src = this.objectUrl;

    await this.video.play();
    await waitForVideo(this.video);

    console.log('File started:', this.label, `${this.video.videoWidth}x${this.video.videoHeight}`);
  }

  stop(): void {
    removeVideoElement(this.video);

    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }
}
