import * as THREE from 'three/webgpu';

import type { Config } from '../config';
import { assetUrl } from '../paths';

// ------------------------------------------------------------
// Background video playlist
//
// Mirrors BackgroundVideo.cpp:
//
//   - the playlist is shuffled once at start
//   - the manifest is re-read periodically; existing entries
//     keep their order, new ones are appended
//   - new entries prefixed "01_" are queued to play next
//   - the right arrow key skips to the next video
//
// The browser cannot list a directory, so the folder contents
// come from a manifest.json file: { "videos": ["a.mp4", ...] }
// ------------------------------------------------------------

interface Manifest {
  videos?: string[];
}

export class Background {
  readonly video: HTMLVideoElement;
  readonly texture: THREE.VideoTexture;

  private readonly settings: Config['background'];

  private playlist: string[] = [];
  private currentIndex = 0;

  // Entries whose "01_" priority has already been honoured.
  private readonly consumedPriority = new Set<string>();

  private rescanTimer = 0;
  private opened = false;

  constructor(settings: Config['background']) {
    this.settings = settings;

    this.video = document.createElement('video');
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.autoplay = true;
    this.video.preload = 'auto';
    this.video.crossOrigin = 'anonymous';
    this.video.addEventListener('ended', () => void this.next());
    this.video.addEventListener('error', () => {
      console.error('Background video error:', this.video.error?.message);
      void this.next();
    });

    this.texture = new THREE.VideoTexture(this.video);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
  }

  get isPlaying(): boolean {
    return this.opened && this.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
  }

  // --------------------------------------------------------
  // Start
  // --------------------------------------------------------

  async start(): Promise<boolean> {
    await this.rescan();

    if (this.playlist.length === 0) {
      console.warn('No background videos listed in', this.settings.manifest);
    } else {
      shuffle(this.playlist);
      this.currentIndex = 0;

      await this.openCurrent();
    }

    this.rescanTimer = window.setInterval(
      () => void this.rescan().then(() => this.resumeIfIdle()),
      this.settings.rescanSeconds * 1000,
    );

    return this.playlist.length > 0;
  }

  stop(): void {
    window.clearInterval(this.rescanTimer);

    this.video.pause();
    this.video.removeAttribute('src');
    this.video.load();

    this.opened = false;
  }

  // --------------------------------------------------------
  // Playlist navigation
  // --------------------------------------------------------

  async next(): Promise<boolean> {
    if (this.playlist.length === 0) {
      return false;
    }

    this.currentIndex = (this.currentIndex + 1) % this.playlist.length;

    return this.openCurrent();
  }

  private async openCurrent(): Promise<boolean> {
    if (this.playlist.length === 0) {
      return false;
    }

    const name = this.playlist[this.currentIndex];

    if (name.startsWith('01_')) {
      // The original renamed the file to drop the prefix. We
      // cannot rename, so just remember that it has been played.
      this.consumedPriority.add(name);
      console.log('Priority video started:', name);
    }

    this.video.src = assetUrl(this.settings.folder) + encodeURIComponent(name);

    try {
      await this.video.play();
    } catch (error) {
      console.error('Could not play background video:', name, error);

      return false;
    }

    this.opened = true;

    console.log(`Playing background video ${this.currentIndex + 1}/${this.playlist.length}: ${name}`);

    return true;
  }

  // If the playlist was empty at start and videos appeared later,
  // start playing.
  private resumeIfIdle(): void {
    if (!this.opened && this.playlist.length > 0) {
      shuffle(this.playlist);
      this.currentIndex = 0;

      void this.openCurrent();
    }
  }

  // --------------------------------------------------------
  // Manifest scanning
  // --------------------------------------------------------

  private async rescan(): Promise<void> {
    let found: string[];

    try {
      const response = await fetch(assetUrl(this.settings.manifest), { cache: 'no-store' });

      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }

      const manifest = (await response.json()) as Manifest;

      found = (manifest.videos ?? []).filter(
        (name) => typeof name === 'string' && /\.(mp4|webm|ogv|mov)$/i.test(name),
      );
    } catch (error) {
      console.warn('Could not read background manifest:', error);

      return;
    }

    const sortedFound = [...found].sort();
    const sortedExisting = [...this.playlist].sort();

    // Same files still exist: keep the shuffled order.
    if (sortedFound.length === sortedExisting.length &&
        sortedFound.every((name, index) => name === sortedExisting[index])) {
      return;
    }

    console.log(`Background folder changed. Found ${found.length} videos.`);

    const currentName = this.playlist[this.currentIndex];

    // Keep existing order for videos that still exist.
    const newPlaylist = this.playlist.filter((name) => found.includes(name));

    // Append newly discovered videos.
    for (const name of found) {
      if (newPlaylist.includes(name)) {
        continue;
      }

      console.log('New background added:', name);

      if (name.startsWith('01_') && !this.consumedPriority.has(name)) {
        const insertAt = Math.min(this.currentIndex + 1, newPlaylist.length);

        newPlaylist.splice(insertAt, 0, name);

        console.log('Priority background queued next:', name);
      } else {
        newPlaylist.push(name);
      }
    }

    this.playlist = newPlaylist;

    const index = currentName ? this.playlist.indexOf(currentName) : -1;

    this.currentIndex = index >= 0 ? index : 0;
  }
}

function shuffle<T>(items: T[]): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));

    [items[i], items[j]] = [items[j], items[i]];
  }
}
