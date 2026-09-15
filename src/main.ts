import { loadConfig } from './config';
import type { VideoSource } from './input/VideoSource';
import { Background } from './render/Background';
import { EyeScene } from './render/EyeScene';
import { FaceTracker } from './tracking/FaceTracker';
import { DebugView } from './ui/DebugView';
import { SourcePicker } from './ui/SourcePicker';
import { TextOverlay } from './ui/TextOverlay';

// ------------------------------------------------------------
// Entry point. Wires the input source, face tracker, eye
// renderer, background playlist and text overlay together.
// ------------------------------------------------------------

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);

  if (!found) {
    throw new Error(`Missing element: #${id}`);
  }

  return found as T;
}

async function main(): Promise<void> {
  const loading = element('loading');

  const setStatus = (message: string, error = false) => {
    loading.textContent = message;
    loading.hidden = false;
    loading.classList.toggle('error', error);
  };

  try {
    setStatus('Loading configuration…');

    const config = await loadConfig();

    // ----------------------------------------------------
    // Renderer
    // ----------------------------------------------------

    setStatus('Starting renderer…');

    const eye = new EyeScene(element('app'), config);

    await eye.start();

    // ----------------------------------------------------
    // Background playlist
    // ----------------------------------------------------

    setStatus('Loading backgrounds…');

    // On WebGPU, upload video frames via a canvas: Three binds
    // videos as external textures there, which Firefox's WebGPU
    // does not fully support yet.
    const background = new Background(config.background, {
      copyThroughCanvas: eye.backend === 'WebGPU',
    });

    await background.start();

    // ----------------------------------------------------
    // Text overlay
    // ----------------------------------------------------

    const text = new TextOverlay(element('text'), config.text);

    // ----------------------------------------------------
    // Face tracker
    // ----------------------------------------------------

    setStatus('Loading face detector…');

    const tracker = new FaceTracker(config.tracking);

    await tracker.init();

    const debug = new DebugView(element('debug'), tracker.canvas, (visible) =>
      tracker.setDebugEnabled(visible),
    );

    // ----------------------------------------------------
    // Input source
    // ----------------------------------------------------

    let source: VideoSource | null = null;

    const picker = new SourcePicker(element('panel'), async (next) => {
      await next.start();

      source?.stop();
      source = next;

      tracker.reset();
      eye.setReflectionVideo(next.video);

      console.log('Tracking source:', next.label);
    });

    // ----------------------------------------------------
    // Keyboard
    // ----------------------------------------------------

    window.addEventListener('keydown', (event) => {
      switch (event.key) {
        case 'ArrowRight':
          void background.next();
          break;

        case 'd':
        case 'D':
          debug.toggle();
          break;

        case 's':
        case 'S':
          picker.toggle();
          break;

        case 'f':
        case 'F':
          if (document.fullscreenElement) {
            void document.exitFullscreen();
          } else {
            void document.documentElement.requestFullscreen();
          }
          break;
      }
    });

    // ----------------------------------------------------
    // Frame loop
    // ----------------------------------------------------

    // Cap the frame rate: the tracker runs at the video's rate
    // and smoothing hides the difference, so rendering faster
    // than ~30 fps only burns GPU time.
    const frameInterval = config.rendering.maxFps > 0 ? 1000 / config.rendering.maxFps : 0;

    let lastFrameTime = 0;

    eye.renderer.setAnimationLoop((time) => {
      if (frameInterval > 0) {
        // Snap to the interval grid so drift does not accumulate.
        if (time - lastFrameTime < frameInterval - 1) {
          return;
        }

        lastFrameTime = time - ((time - lastFrameTime) % frameInterval);
      }

      const face = tracker.update(source?.video ?? null);

      text.setVisible(face.detected);

      if (face.detected) {
        text.update(config.text.message);
      }

      background.update();

      eye.setBackgroundTexture(
        background.isPlaying ? background.texture : null,
        background.frameSize,
      );

      eye.render(face);
    });

    loading.hidden = true;

    console.log(`EyeTracker ready: ${eye.backend} renderer, ${tracker.backend} detector`);

    // ----------------------------------------------------
    // Start the remembered source (webcam by default)
    // ----------------------------------------------------

    await picker.autoStart();
  } catch (error) {
    console.error(error);

    const message = error instanceof Error ? error.message : String(error);

    setStatus(`Error: ${message}`, true);
  }
}

void main();
