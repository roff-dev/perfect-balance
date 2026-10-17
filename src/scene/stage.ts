import * as THREE from 'three';
import CameraControls from 'camera-controls';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

CameraControls.install({ THREE });

const PAPER = new THREE.Color('#efe8dc');
const UP = new THREE.Vector3(0, 1, 0);
/** A little above and to the right of straight on. */
const DEFAULT_DIRECTION = new THREE.Vector3(0.35, 0.9, 4).normalize();

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

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
  /** Shadow-only floor: the studio has no visible horizon, so nothing betrays the round's scale. */
  readonly floor: THREE.Mesh;
  private readonly observer: ResizeObserver;
  private readonly timer = new THREE.Timer();
  private readonly box = new THREE.Box3(new THREE.Vector3(-1.2, 0, -0.4), new THREE.Vector3(1.2, 2.2, 0.4));
  private insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
  private width = 0;
  private height = 0;
  private maxDistance = 60;
  private readonly back = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly centre = new THREE.Vector3();
  private readonly corner = new THREE.Vector3();
  private readonly target = new THREE.Vector3();
  private readonly position = new THREE.Vector3();
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

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({ color: '#4a3a28', opacity: 0.22 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);
    this.floor = floor;

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
  }

  /** Margins, in pixels, kept clear of whatever is framed: the overlays drawn over the scene. */
  setInsets(insets: Insets): void {
    const i = this.insets;
    if (i.top === insets.top && i.right === insets.right && i.bottom === insets.bottom && i.left === insets.left) return;
    this.insets = insets;
    if (this.width > 0) this.frame(this.box, undefined, false);
  }

  /**
   * Fits the camera to a box from a direction (a unit vector from the target towards the camera;
   * the current one if omitted). Each corner is checked against both fields of view, so a wide
   * scale on a tall phone is fitted by its width rather than a loose bounding sphere, and the box
   * is centred in the part of the scene the overlays leave clear.
   */
  frame(box: THREE.Box3, direction: THREE.Vector3 | undefined, animate: boolean): void {
    this.box.copy(box);
    if (this.width === 0) return;
    const back = direction ? this.back.copy(direction) : this.currentDirection();
    const right = this.right.crossVectors(UP, back).normalize();
    const up = this.up.crossVectors(back, right);
    const { top, right: r, bottom, left } = this.insets;
    const sx = Math.max(0.3, 1 - (left + r) / this.width);
    const sy = Math.max(0.3, 1 - (top + bottom) / this.height);
    const tanV = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const tanH = tanV * this.camera.aspect;
    const centre = box.getCenter(this.centre);

    let distance = 0;
    for (let i = 0; i < 8; i++) {
      const p = this.corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).sub(centre);
      const z = p.dot(back);
      distance = Math.max(distance, z + Math.abs(p.dot(right)) / (sx * tanH), z + Math.abs(p.dot(up)) / (sy * tanV));
    }
    distance *= 1.06;

    // shift the target so the box centre lands in the middle of the clear area, not of the canvas
    const cx = (left - r) / this.width;
    const cy = (bottom - top) / this.height;
    const target = this.target.copy(centre).addScaledVector(right, -cx * tanH * distance).addScaledVector(up, -cy * tanV * distance);
    const position = this.position.copy(target).addScaledVector(back, distance);
    this.controls.maxDistance = Math.max(this.maxDistance, distance);
    void this.controls.setLookAt(position.x, position.y, position.z, target.x, target.y, target.z, animate && !reducedMotion());
  }

  /** Closest and furthest the camera may dolly; the fitted distance always fits. */
  setDistanceRange(min: number, max: number): void {
    this.controls.minDistance = min;
    this.maxDistance = max;
    this.controls.maxDistance = Math.max(max, this.controls.distance);
  }

  /** Carries the camera along with something it's looking at that has moved by this much. */
  translate(by: THREE.Vector3): void {
    this.controls.getTarget(this.target).add(by);
    this.controls.getPosition(this.position).add(by);
    const { position: p, target: t } = this;
    void this.controls.setLookAt(p.x, p.y, p.z, t.x, t.y, t.z, !reducedMotion());
  }

  private currentDirection(): THREE.Vector3 {
    this.controls.getPosition(this.position);
    this.controls.getTarget(this.target);
    return this.back.subVectors(this.position, this.target).normalize();
  }

  private resize(): void {
    const { width, height } = this.host.getBoundingClientRect();
    if (width === 0 || height === 0) return;
    const first = this.width === 0;
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    // keep the angle the player chose; only the distance and centring follow the new shape
    this.frame(this.box, first ? DEFAULT_DIRECTION : undefined, !first);
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
