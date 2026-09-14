import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import type { Config } from '../config';

// ------------------------------------------------------------
// Renders the 3D eye.
//
// Mirrors EyeRenderer.cpp:
//
//   - camera at (0, 0, 3) looking at the origin, 50 degree FOV
//   - the GLB has an inner eyeball ("in") and a transparent
//     outer shell ("out")
//   - the eye is rotated -90 degrees around Y, then yawed and
//     pitched toward the target with a dead zone, smoothing and
//     a perspective curve
//   - with no face, it wanders to a random idle target
// ------------------------------------------------------------

export interface LookTarget {
  detected: boolean;
  x: number;
  y: number;
}

export class EyeScene {
  readonly renderer: THREE.WebGPURenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;

  private readonly config: Config;
  private readonly clearColor: THREE.Color;

  private readonly eyeGroup = new THREE.Group();

  private smoothX = 0;
  private smoothY = 0;

  private idleTargetX = 0;
  private idleTargetY = 0;
  private idleInterval = 2.5;
  private lastIdleChange = performance.now();

  // Small random fixation offsets so the eye never sits still.
  private saccadeX = 0;
  private saccadeY = 0;
  private saccadeInterval = 1;
  private lastSaccade = performance.now();

  private started = false;

  constructor(container: HTMLElement, config: Config) {
    this.config = config;

    this.renderer = new THREE.WebGPURenderer({
      antialias: true,
      forceWebGL: config.rendering.forceWebGL,
    });

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, config.rendering.maxPixelRatio));
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    container.appendChild(this.renderer.domElement);

    this.clearColor = new THREE.Color(
      config.background.r,
      config.background.g,
      config.background.b,
    );

    this.scene = new THREE.Scene();
    this.scene.background = this.clearColor;

    this.camera = new THREE.PerspectiveCamera(
      50,
      window.innerWidth / window.innerHeight,
      0.1,
      100,
    );
    this.camera.position.set(0, 0, 3);
    this.camera.lookAt(0, 0, 0);

    // Rotate around Y first (yaw) then X (pitch), matching
    // glm::rotate(yaw, Y) * glm::rotate(pitch, X).
    this.eyeGroup.rotation.order = 'YXZ';
    this.scene.add(this.eyeGroup);

    this.createLights();

    window.addEventListener('resize', () => this.onResize());
  }

  get backend(): string {
    const backend = this.renderer.backend as { isWebGPUBackend?: boolean };

    return backend.isWebGPUBackend === true ? 'WebGPU' : 'WebGL';
  }

  // --------------------------------------------------------
  // Setup
  // --------------------------------------------------------

  async start(): Promise<void> {
    await this.renderer.init();

    await this.loadEye();

    this.started = true;

    console.log('Renderer:', this.backend);
  }

  private createLights(): void {
    // Original: point light at (1.5, 2.0, 3.5), ambient 0.30,
    // diffuse 0.75, tight specular highlight.
    const key = new THREE.DirectionalLight(0xffffff, 2.4);

    key.position.set(1.5, 2.0, 3.5);
    key.target.position.set(0, 0, 0);

    this.scene.add(key);
    this.scene.add(key.target);

    const ambient = new THREE.AmbientLight(0xffffff, 0.9);

    this.scene.add(ambient);

    // A soft fill from behind the camera keeps the far side of
    // the eyeball from going fully black when it turns.
    const fill = new THREE.DirectionalLight(0xffffff, 0.35);

    fill.position.set(-1.0, -0.5, 3.0);

    this.scene.add(fill);
  }

  private async loadEye(): Promise<void> {
    const textureLoader = new THREE.TextureLoader();

    const [gltf, baseColor, normal] = await Promise.all([
      new GLTFLoader().loadAsync('/assets/eye.glb'),
      textureLoader.loadAsync('/assets/eye_basecolor.webp'),
      textureLoader.loadAsync('/assets/eye_normal.webp'),
    ]);

    // The GLB's UVs follow the glTF convention (v=0 at the top of
    // the image), so the textures must not be flipped on upload.
    baseColor.flipY = false;
    baseColor.colorSpace = THREE.SRGBColorSpace;
    baseColor.anisotropy = Math.min(8, this.renderer.getMaxAnisotropy());

    normal.flipY = false;
    normal.colorSpace = THREE.NoColorSpace;

    const eyeball = new THREE.MeshStandardMaterial({
      map: baseColor,
      normalMap: normal,
      normalScale: new THREE.Vector2(
        this.config.rendering.normalScale,
        this.config.rendering.normalScale,
      ),
      roughness: 0.3,
      metalness: 0.0,
    });

    // The transmissive shell renders the scene to a texture every
    // frame, so on the WebGL fallback (typically weaker hardware)
    // 'auto' picks the cheap shell instead.
    const transmissionSetting = this.config.rendering.transmission;
    const useTransmission =
      transmissionSetting === 'auto' ? this.backend === 'WebGPU' : transmissionSetting;

    console.log('Outer shell:', useTransmission ? 'transmission' : 'simple');

    const shell = useTransmission
      ? new THREE.MeshPhysicalMaterial({
          color: 0xffffff,
          transmission: 1.0,
          ior: 1.45,
          thickness: 0.02,
          roughness: 0.0,
          metalness: 0.0,
          clearcoat: 1.0,
          clearcoatRoughness: 0.0,
          specularIntensity: 1.0,
          side: THREE.FrontSide,
        })
      : new THREE.MeshPhysicalMaterial({
          color: 0xd9ebff,
          transparent: true,
          opacity: 0.22,
          roughness: 0.0,
          metalness: 0.0,
          clearcoat: 1.0,
          clearcoatRoughness: 0.0,
          depthWrite: false,
          side: THREE.FrontSide,
        });

    const model = gltf.scene;

    let meshCount = 0;

    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) {
        return;
      }

      meshCount++;

      // The GLB uses the node named "out" for the outer shell.
      const outer = object.name === 'out' || object.parent?.name === 'out';

      object.material = outer ? shell : eyeball;
      object.renderOrder = outer ? 1 : 0;

      console.log(`Loaded mesh: ${object.name} | outer shell: ${outer ? 'yes' : 'no'}`);
    });

    if (meshCount === 0) {
      throw new Error('Eye model contains no meshes.');
    }

    // Base orientation: -90 degrees around Y.
    model.rotation.y = THREE.MathUtils.degToRad(-90);

    this.eyeGroup.add(model);

    console.log('Loaded model: /assets/eye.glb | mesh count:', meshCount);
  }

  // --------------------------------------------------------
  // Background
  // --------------------------------------------------------

  setBackgroundTexture(texture: THREE.Texture | null): void {
    this.scene.background = texture ?? this.clearColor;
  }

  // --------------------------------------------------------
  // Per-frame render
  // --------------------------------------------------------

  render(target: LookTarget): void {
    if (!this.started) {
      return;
    }

    const { tracking, motion, idle, camera } = this.config;
    const now = performance.now();

    let targetX: number;
    let targetY: number;

    if (target.detected) {
      targetX = target.x + camera.offsetX;
      targetY = target.y + camera.offsetY;
    } else {
      const elapsed = (now - this.lastIdleChange) / 1000;

      if (elapsed >= this.idleInterval) {
        this.lastIdleChange = now;

        this.idleTargetX = (Math.random() * 2 - 1) * idle.rangeX;
        this.idleTargetY = (Math.random() * 2 - 1) * idle.rangeY;

        this.idleInterval =
          idle.minIntervalSeconds +
          Math.random() * (idle.maxIntervalSeconds - idle.minIntervalSeconds);
      }

      targetX = this.idleTargetX;
      targetY = this.idleTargetY;
    }

    // Small dead zone to ignore tiny detector jitter.
    if (Math.abs(targetX) < motion.deadZone) {
      targetX = 0;
    }

    if (Math.abs(targetY) < motion.deadZone) {
      targetY = 0;
    }

    // Micro-saccades: re-pick a tiny offset every so often.
    if ((now - this.lastSaccade) / 1000 >= this.saccadeInterval) {
      this.lastSaccade = now;

      this.saccadeX = (Math.random() * 2 - 1) * motion.microSaccadeAmplitude;
      this.saccadeY = (Math.random() * 2 - 1) * motion.microSaccadeAmplitude;

      this.saccadeInterval =
        motion.microSaccadeMinSeconds +
        Math.random() * (motion.microSaccadeMaxSeconds - motion.microSaccadeMinSeconds);
    }

    targetX += this.saccadeX;
    targetY += this.saccadeY;

    // Smooth movement. Big moves (a new face, a switch between
    // people) use the faster rate so they read as a deliberate
    // glance; small corrections stay gentle.
    const distance = Math.hypot(targetX - this.smoothX, targetY - this.smoothY);
    const blend = Math.min(distance / 0.5, 1);
    const smoothing = motion.smoothingNear + (motion.smoothingFar - motion.smoothingNear) * blend;

    this.smoothX += (targetX - this.smoothX) * smoothing;
    this.smoothY += (targetY - this.smoothY) * smoothing;

    // Perspective curve: a little extra travel near the edges.
    const perspectiveX = this.smoothX * (0.7 + 0.3 * Math.abs(this.smoothX));
    const perspectiveY = this.smoothY * (0.7 + 0.3 * Math.abs(this.smoothY));

    const yaw = perspectiveX * THREE.MathUtils.degToRad(tracking.maxYaw);
    const pitch = perspectiveY * THREE.MathUtils.degToRad(tracking.maxPitch);

    this.eyeGroup.rotation.y = yaw;
    this.eyeGroup.rotation.x = pitch;

    this.renderer.render(this.scene, this.camera);
  }

  private onResize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height);
  }

  dispose(): void {
    this.renderer.dispose();
  }
}
