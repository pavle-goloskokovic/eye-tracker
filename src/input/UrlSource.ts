import type Hls from 'hls.js';

import {
  createVideoElement,
  removeVideoElement,
  waitForVideo,
  type VideoSource,
} from './VideoSource';

// ------------------------------------------------------------
// Plays a network stream:
//
//   - direct MP4 / WebM URLs
//   - HLS (.m3u8) through hls.js, or natively on Safari
//   - WebRTC through a WHEP endpoint (e.g. MediaMTX:
//     http://host:8889/<path>/whep)
//
// The remote server must send CORS headers, otherwise the
// browser will refuse to let the tracker read the pixels.
// ------------------------------------------------------------

export class UrlSource implements VideoSource {
  readonly kind = 'url' as const;
  readonly video: HTMLVideoElement;

  private readonly url: string;
  private hls: Hls | null = null;
  private peer: RTCPeerConnection | null = null;

  constructor(url: string) {
    this.url = url.trim();
    this.video = createVideoElement();
    this.video.loop = true;
  }

  get label(): string {
    return `URL: ${this.url}`;
  }

  async start(): Promise<void> {
    if (!this.url) {
      throw new Error('No URL given.');
    }

    if (UrlSource.isWhep(this.url)) {
      await this.startWhep();
    } else if (UrlSource.isHls(this.url)) {
      await this.startHls();
    } else {
      this.video.src = this.url;
    }

    await this.video.play();
    await waitForVideo(this.video);

    console.log('Stream started:', this.label, `${this.video.videoWidth}x${this.video.videoHeight}`);
  }

  stop(): void {
    this.hls?.destroy();
    this.hls = null;

    this.peer?.close();
    this.peer = null;

    removeVideoElement(this.video);
  }

  // --------------------------------------------------------
  // HLS
  // --------------------------------------------------------

  private async startHls(): Promise<void> {
    if (this.video.canPlayType('application/vnd.apple.mpegurl')) {
      this.video.src = this.url;

      return;
    }

    // hls.js is a large library only needed for HLS streams, so
    // it is loaded on demand.
    const { default: HlsLib } = await import('hls.js');

    if (!HlsLib.isSupported()) {
      throw new Error('HLS playback is not supported in this browser.');
    }

    const hls = new HlsLib({ enableWorker: true });

    this.hls = hls;

    await new Promise<void>((resolve, reject) => {
      hls.on(HlsLib.Events.MANIFEST_PARSED, () => resolve());

      hls.on(HlsLib.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          reject(new Error(`HLS error: ${data.details}`));
        }
      });

      hls.loadSource(this.url);
      hls.attachMedia(this.video);
    });
  }

  // --------------------------------------------------------
  // WebRTC (WHEP)
  // --------------------------------------------------------

  private async startWhep(): Promise<void> {
    const peer = new RTCPeerConnection();

    this.peer = peer;

    peer.addTransceiver('video', { direction: 'recvonly' });

    const stream = new MediaStream();

    peer.addEventListener('track', (event) => {
      stream.addTrack(event.track);
    });

    this.video.srcObject = stream;

    const offer = await peer.createOffer();

    await peer.setLocalDescription(offer);

    // Wait for ICE gathering so the offer contains candidates.
    await new Promise<void>((resolve) => {
      if (peer.iceGatheringState === 'complete') {
        resolve();

        return;
      }

      const onChange = () => {
        if (peer.iceGatheringState === 'complete') {
          peer.removeEventListener('icegatheringstatechange', onChange);
          resolve();
        }
      };

      peer.addEventListener('icegatheringstatechange', onChange);

      window.setTimeout(resolve, 2000);
    });

    const endpoint = this.url.replace(/^whep:/, '');

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/sdp' },
      body: peer.localDescription?.sdp ?? '',
    });

    if (!response.ok) {
      throw new Error(`WHEP request failed: ${response.status} ${response.statusText}`);
    }

    const answer = await response.text();

    await peer.setRemoteDescription({ type: 'answer', sdp: answer });
  }

  // --------------------------------------------------------
  // Helpers
  // --------------------------------------------------------

  static isHls(url: string): boolean {
    return /\.m3u8(\?|#|$)/i.test(url);
  }

  static isWhep(url: string): boolean {
    return /\/whep(\?|#|$)/i.test(url) || url.startsWith('whep:');
  }
}
