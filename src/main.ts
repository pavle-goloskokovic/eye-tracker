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
  const loadingText = element('loading-text');
  const loadingBar = element('loading-bar');

  // ------------------------------------------------------
  // Loading progress
  //
  // The stages give no byte-level progress (the detector's WASM
  // runtime loads inside MediaPipe), so each stage owns a share
  // of the bar sized by how long it typically takes, and the bar
  // creeps toward the end of the current stage while waiting.
  // ------------------------------------------------------

  const stages = [
    { label: 'Loading configuration…', weight: 2, seconds: 0.2 },
    { label: 'Starting renderer…', weight: 10, seconds: 1.5 },
    { label: 'Loading backgrounds…', weight: 5, seconds: 0.5 },
    { label: 'Loading face detector…', weight: 68, seconds: 5 },
    { label: 'Starting camera…', weight: 15, seconds: 1.5 },
  ];

  const totalWeight = stages.reduce((sum, stage) => sum + stage.weight, 0);

  let stageIndex = -1;
  let stageStart = 0;
  let creepTimer = 0;

  const renderProgress = () => {
    const stage = stages[stageIndex];
    const before = stages.slice(0, stageIndex).reduce((sum, s) => sum + s.weight, 0);
    const elapsed = (performance.now() - stageStart) / 1000;

    // Approach the end of the stage without reaching it.
    const within = 1 - Math.exp(-elapsed / stage.seconds);
    const percent = ((before + stage.weight * within) / totalWeight) * 100;

    loadingBar.style.width = `${percent.toFixed(1)}%`;
    loadingText.textContent = `${stage.label} ${Math.min(99, Math.round(percent))}%`;
  };

  const setStage = (index: number) => {
    stageIndex = index;
    stageStart = performance.now();
    loading.hidden = false;
    loading.classList.remove('error');

    window.clearInterval(creepTimer);
    creepTimer = window.setInterval(renderProgress, 100);

    renderProgress();
  };

  const finishLoading = () => {
    window.clearInterval(creepTimer);
    loadingBar.style.width = '100%';
    loadingText.textContent = 'Ready';
    loading.hidden = true;
  };

  const showError = (message: string) => {
    window.clearInterval(creepTimer);
    loading.hidden = false;
    loading.classList.add('error');
    loadingText.textContent = `Error: ${message}`;
  };

  try {
    setStage(0);

    const config = await loadConfig();

    // ----------------------------------------------------
    // Renderer
    // ----------------------------------------------------

    setStage(1);

    const eye = new EyeScene(element('app'), config);

    await eye.start();

    // ----------------------------------------------------
    // Background playlist
    // ----------------------------------------------------

    setStage(2);

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

    setStage(3);

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

    console.log(`EyeTracker ready: ${eye.backend} renderer, ${tracker.backend} detector`);

    // ----------------------------------------------------
    // Start the remembered source (webcam by default)
    // ----------------------------------------------------

    setStage(4);

    await picker.autoStart();

    finishLoading();
  } catch (error) {
    console.error(error);

    showError(error instanceof Error ? error.message : String(error));
  }
}

void main();
