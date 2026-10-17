import * as THREE from 'three';
import CameraControls from 'camera-controls';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

CameraControls.install({ THREE });

const PAPER = new THREE.Color('#efe8dc');

export interface StageOptions {
  shadowMapSize: number;
  maxPixelRatio: number;
}

/** Renderer, light and camera: a seamless paper studio with the scale lit like a product shot. */
export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(32, 1, 0.05, 60);
  readonly controls: CameraControls;
  private readonly observer: ResizeObserver;
  private readonly timer = new THREE.Timer();
  private readonly framing = new THREE.Sphere(new THREE.Vector3(0, 1.15, 0), 1.8);
  private frameCallback: ((dt: number) => void) | undefined;

  constructor(
    private readonly host: HTMLElement,
    options: StageOptions,
  ) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio, options.maxPixelRatio));
    renderer.toneMapping = THREE.NeutralToneMapping;
    // shader logs are only useful while developing, and reading them stalls each compile
    renderer.debug.checkShaderErrors = import.meta.env.DEV;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.domElement.style.touchAction = 'none';
    host.appendChild(renderer.domElement);
    this.renderer = renderer;

    this.scene.background = PAPER;
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;
    pmrem.dispose();

    const key = new THREE.DirectionalLight('#fff6e8', 2.4);
    key.position.set(-2.2, 5, 3.2);
    key.castShadow = true;
    key.shadow.mapSize.set(options.shadowMapSize, options.shadowMapSize);
    key.shadow.radius = 4;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.01;
    Object.assign(key.shadow.camera, { left: -2.6, right: 2.6, top: 3, bottom: -1.5, near: 1, far: 12 });
    this.scene.add(key, new THREE.HemisphereLight('#fffaf2', '#b8a88f', 0.9));

    // Shadow-only floor: the studio has no visible horizon, so nothing betrays the round's scale.
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({ color: '#4a3a28', opacity: 0.22 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const controls = new CameraControls(this.camera, renderer.domElement);
    controls.smoothTime = 0.18;
    controls.minPolarAngle = (10 * Math.PI) / 180;
    controls.maxPolarAngle = (80 * Math.PI) / 180;
    controls.mouseButtons.right = CameraControls.ACTION.NONE;
    controls.touches.one = CameraControls.ACTION.TOUCH_ROTATE;
    controls.touches.two = CameraControls.ACTION.TOUCH_DOLLY;
    controls.touches.three = CameraControls.ACTION.NONE;
    this.controls = controls;

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
    this.frameOverview(false);
  }

  /** Frames the overview around these objects. */
  setFraming(objects: THREE.Object3D[]): void {
    const bounds = new THREE.Box3();
    for (const o of objects) bounds.expandByObject(o);
    bounds.getBoundingSphere(this.framing);
    this.frameOverview(false);
  }

  /** Fits the scale to the narrower of the two fields of view, so portrait phones never crop the beam. */
  frameOverview(animate: boolean): void {
    const { center } = this.framing;
    this.controls.setLookAt(center.x + 0.35, center.y + 0.9, center.z + 4, center.x, center.y, center.z, false);
    void this.controls.fitToSphere(this.framing, animate);
  }

  private resize(): void {
    const { width, height } = this.host.getBoundingClientRect();
    if (width === 0 || height === 0) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.frameOverview(false);
  }

  start(onFrame: (dt: number) => void): void {
    this.frameCallback = onFrame;
    this.renderer.setAnimationLoop((time) => {
      this.timer.update(time);
      const dt = this.timer.getDelta();
      this.frameCallback?.(dt);
      this.controls.update(dt);
      this.renderer.render(this.scene, this.camera);
    });
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    this.observer.disconnect();
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
