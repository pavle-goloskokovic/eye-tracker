import * as THREE from 'three/webgpu';
import {
  Fn,
  atan,
  cameraPosition,
  dot,
  float,
  max,
  normalWorld,
  normalize,
  positionWorld,
  pow,
  reflect,
  select,
  smoothstep,
  texture,
  uniform,
  vec2,
} from 'three/tsl';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import type { Config } from '../config';
import { assetUrl } from '../paths';
import { VideoFrameTexture } from './VideoFrameTexture';

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

  // Screen-filling plane parented to the camera. Using our own
  // plane instead of scene.background lets the video keep its
  // aspect ratio (cover-style crop) in any viewport shape.
  private readonly backgroundMaterial: THREE.MeshBasicMaterial;
  private readonly backgroundMesh: THREE.Mesh;
  private backgroundAspect = 16 / 9;

  // Camera feed reflected on the eye surface.
  private readonly reflectionFeed: VideoFrameTexture;
  private readonly reflectionIntensity = uniform(0);
  // Half angles (radians) the feed covers horizontally/vertically.
  private readonly reflectionHalfAngle = uniform(new THREE.Vector2(1.2, 0.7));

  // Vertical FOV in landscape; becomes the horizontal FOV in
  // portrait so the eye never gets cut off.
  private static readonly BASE_FOV = 50;
  private static readonly BACKGROUND_DISTANCE = 50;

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
      EyeScene.BASE_FOV,
      window.innerWidth / window.innerHeight,
      0.1,
      100,
    );
    this.camera.position.set(0, 0, 3);
    this.camera.lookAt(0, 0, 0);

    // The camera must be in the scene for its children to render.
    this.scene.add(this.camera);

    this.backgroundMaterial = new THREE.MeshBasicMaterial({
      color: this.clearColor,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
    });

    this.backgroundMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.backgroundMaterial);
    this.backgroundMesh.position.z = -EyeScene.BACKGROUND_DISTANCE;
    this.backgroundMesh.renderOrder = -1000;
    this.backgroundMesh.frustumCulled = false;
    this.backgroundMesh.visible = false;

    this.camera.add(this.backgroundMesh);

    const feedWidth = config.reflection.feedMaxWidth;

    this.reflectionFeed = new VideoFrameTexture(feedWidth, Math.round((feedWidth * 9) / 16));

    this.updateCamera();

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
      new GLTFLoader().loadAsync(assetUrl('assets/eye.glb')),
      textureLoader.loadAsync(assetUrl('assets/eye_basecolor.webp')),
      textureLoader.loadAsync(assetUrl('assets/eye_normal.webp')),
    ]);

    // The GLB's UVs follow the glTF convention (v=0 at the top of
    // the image), so the textures must not be flipped on upload.
    baseColor.flipY = false;
    baseColor.colorSpace = THREE.SRGBColorSpace;
    baseColor.anisotropy = Math.min(8, this.renderer.getMaxAnisotropy());

    normal.flipY = false;
    normal.colorSpace = THREE.NoColorSpace;

    const eyeball = new THREE.MeshStandardNodeMaterial({
      map: baseColor,
      normalMap: normal,
      normalScale: new THREE.Vector2(
        this.config.rendering.normalScale,
        this.config.rendering.normalScale,
      ),
      roughness: 0.3,
      metalness: 0.0,
    });

    if (this.config.reflection.enabled) {
      // The eyeball carries the reflection so it shows even when
      // the shell is the cheap translucent one.
      eyeball.emissiveNode = this.createReflectionNode(1.0);
    }

    // The transmissive shell renders the scene to a texture every
    // frame, so on the WebGL fallback (typically weaker hardware)
    // 'auto' picks the cheap shell instead.
    const transmissionSetting = this.config.rendering.transmission;
    const useTransmission =
      transmissionSetting === 'auto' ? this.backend === 'WebGPU' : transmissionSetting;

    console.log('Outer shell:', useTransmission ? 'transmission' : 'simple');

    const shell = useTransmission
      ? new THREE.MeshPhysicalNodeMaterial({
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
      : new THREE.MeshPhysicalNodeMaterial({
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

    if (this.config.reflection.enabled && useTransmission) {
      // A second, fainter copy on the glass shell adds depth.
      shell.emissiveNode = this.createReflectionNode(0.5);
    }

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
  // Camera-feed reflection
  //
  // The feed is treated as the surroundings in front of the eye,
  // spanning `fieldOfView` degrees horizontally. For each surface
  // point the view direction is reflected off the surface and the
  // reflected direction's angles pick the feed pixel, like the
  // wrapped reflection on a glossy ball. A Fresnel term makes it
  // stronger toward the rim.
  // --------------------------------------------------------

  private createReflectionNode(scale: number) {
    const { reflection } = this.config;
    const feed = this.reflectionFeed.texture;

    const centerStrength = float(reflection.centerStrength);
    const rimStrength = float(reflection.rimStrength);
    const mirrorSign = float(reflection.mirror ? -1 : 1);
    const halfAngle = this.reflectionHalfAngle;
    const intensity = this.reflectionIntensity;

    return Fn(() => {
      const n = normalize(normalWorld);
      const v = normalize(cameraPosition.sub(positionWorld));
      const r = reflect(v.negate(), n);

      // Angles of the reflected direction around the forward axis.
      const rz = max(r.z, 1e-4);
      const angleX = atan(r.x.div(rz));
      const angleY = atan(r.y.div(rz));

      // Map angles to feed UVs (0..1), optionally mirrored.
      const u = angleX.mul(mirrorSign).div(halfAngle.x).mul(0.5).add(0.5);
      const w = angleY.div(halfAngle.y).mul(0.5).add(0.5);

      // Soft fade at the feed edges and no reflection for rays
      // pointing away from the viewer.
      const inside = smoothstep(0.0, 0.1, u)
        .mul(smoothstep(1.0, 0.9, u))
        .mul(smoothstep(0.0, 0.1, w))
        .mul(smoothstep(1.0, 0.9, w))
        .mul(select(r.z.greaterThan(0.001), 1.0, 0.0));

      const facing = max(dot(n, v), 0.0);
      const fresnel = pow(float(1.0).sub(facing), 2.5);
      const weight = centerStrength
        .add(fresnel.mul(rimStrength))
        .mul(intensity)
        .mul(inside)
        .mul(scale);

      return texture(feed, vec2(u, w)).rgb.mul(weight);
    })();
  }

  // Switch the video that is reflected (null disables it).
  setReflectionVideo(video: HTMLVideoElement | null): void {
    this.reflectionFeed.setVideo(video);
  }

  private lastReflectionUpdate = 0;

  private updateReflection(): void {
    const { reflection } = this.config;

    if (!reflection.enabled) {
      return;
    }

    // Throttle uploads; the reflection is a soft secondary effect.
    const now = performance.now();
    const interval = reflection.updateFps > 0 ? 1000 / reflection.updateFps : 0;

    if (now - this.lastReflectionUpdate >= interval - 1) {
      this.lastReflectionUpdate = now;
      this.reflectionFeed.update();
    }

    const ready = this.reflectionFeed.ready;

    this.reflectionIntensity.value = ready ? reflection.intensity : 0;

    if (ready) {
      // Vertical coverage follows the feed's aspect ratio.
      const halfX = THREE.MathUtils.degToRad(reflection.fieldOfView) / 2;

      this.reflectionHalfAngle.value.set(halfX, halfX / this.reflectionFeed.aspect);
    }
  }

  // --------------------------------------------------------
  // Background
  // --------------------------------------------------------

  setBackgroundTexture(
    texture: THREE.Texture | null,
    frameSize: { width: number; height: number } | null = null,
  ): void {
    const material = this.backgroundMaterial;

    if (material.map !== texture) {
      material.map = texture;
      material.color.set(texture ? 0xffffff : this.clearColor);
      material.needsUpdate = true;

      this.backgroundMesh.visible = texture !== null;
    }

    // Keep the plane's aspect in step with the video's.
    if (texture && frameSize && frameSize.width > 0 && frameSize.height > 0) {
      const aspect = frameSize.width / frameSize.height;

      if (Math.abs(aspect - this.backgroundAspect) > 1e-3) {
        this.backgroundAspect = aspect;
        this.layoutBackground();
      }
    }
  }

  // --------------------------------------------------------
  // Camera / viewport
  // --------------------------------------------------------

  private updateCamera(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const aspect = width / height;

    // Landscape: BASE_FOV is the vertical FOV. Portrait: keep
    // BASE_FOV as the horizontal FOV instead, so the eye fits the
    // narrower dimension rather than being cropped at the sides.
    let fov = EyeScene.BASE_FOV;

    if (aspect < 1) {
      const halfHorizontal = THREE.MathUtils.degToRad(EyeScene.BASE_FOV / 2);

      fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(halfHorizontal) / aspect));
    }

    this.camera.fov = fov;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();

    this.layoutBackground();
  }

  // Size the background plane to fill the view at its distance,
  // then enlarge one axis so the video covers the viewport
  // without distortion (like CSS object-fit: cover).
  private layoutBackground(): void {
    const distance = EyeScene.BACKGROUND_DISTANCE;
    const viewHeight = 2 * distance * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const viewWidth = viewHeight * this.camera.aspect;
    const viewAspect = viewWidth / viewHeight;

    if (viewAspect > this.backgroundAspect) {
      this.backgroundMesh.scale.set(viewWidth, viewWidth / this.backgroundAspect, 1);
    } else {
      this.backgroundMesh.scale.set(viewHeight * this.backgroundAspect, viewHeight, 1);
    }
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

    this.updateReflection();

    this.renderer.render(this.scene, this.camera);
  }

  private onResize(): void {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.updateCamera();
  }

  dispose(): void {
    this.renderer.dispose();
  }
}
