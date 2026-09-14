// ------------------------------------------------------------
// A VideoSource is anything that can feed frames to the face
// tracker through an HTMLVideoElement: the webcam, a local
// file, or a network stream.
// ------------------------------------------------------------

export interface VideoSource {
  readonly kind: 'webcam' | 'file' | 'url';
  readonly label: string;
  readonly video: HTMLVideoElement;

  start(): Promise<void>;
  stop(): void;
}

export function createVideoElement(): HTMLVideoElement {
  const video = document.createElement('video');

  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;
  video.crossOrigin = 'anonymous';
  video.setAttribute('aria-hidden', 'true');

  // Keep it in the DOM (some browsers throttle detached videos)
  // but out of sight.
  video.style.position = 'fixed';
  video.style.width = '1px';
  video.style.height = '1px';
  video.style.opacity = '0';
  video.style.pointerEvents = 'none';

  document.body.appendChild(video);

  return video;
}

export function removeVideoElement(video: HTMLVideoElement): void {
  video.pause();
  video.removeAttribute('src');
  video.srcObject = null;
  video.load();
  video.remove();
}

// Waits until the element has real dimensions and data.
export function waitForVideo(video: HTMLVideoElement, timeoutMs = 15000): Promise<void> {
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for video data.'));
    }, timeoutMs);

    const onReady = () => {
      if (video.videoWidth > 0) {
        cleanup();
        resolve();
      }
    };

    const onError = () => {
      cleanup();
      reject(new Error(video.error?.message ?? 'Video failed to load.'));
    };

    const cleanup = () => {
      window.clearTimeout(timer);
      video.removeEventListener('loadeddata', onReady);
      video.removeEventListener('canplay', onReady);
      video.removeEventListener('error', onError);
    };

    video.addEventListener('loadeddata', onReady);
    video.addEventListener('canplay', onReady);
    video.addEventListener('error', onError);
  });
}
