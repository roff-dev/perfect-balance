// The scale on the start screen: the game's own scale model, lit like the game, on a transparent
// canvas over the page's paper. On the first visit it opens the page: alone in the middle of the
// screen it turns a full circle while it moves and shrinks into its place. After that it sways
// gently, leans towards the pointer, a tap presses a pan down, and a sideways drag turns it.
// There's no physics: the beam is a spring and the pans hang straight from its hooks.
//
// The scale is always drawn fitted to a rectangle on screen: the middle of the screen at first,
// its place on the page at the end. The canvas covers the whole screen during the opening and only
// its place afterwards, and the camera's view offset maps the one onto the other, so the hand-over
// is exact.

import * as THREE from 'three';
import { RIG } from '../physics/rig';
import { POSE_STRIDE } from '../physics/protocol';
import { ScaleModel } from './scale';

const DEG = Math.PI / 180;
/** A little above and to the right of straight on, as in the game. */
const DIRECTION = new THREE.Vector3(0.35, 1.1, 4).normalize();
/** Everything the scale can reach while it sways or tips. */
const BOX = new THREE.Box3(new THREE.Vector3(-1.5, 0, -0.5), new THREE.Vector3(1.5, 2.2, 0.5));
/** The opening: its length, when the move into place starts (as a share of it), and when the words come. */
const INTRO_MS = 2800;
const INTRO_MOVE_FROM = 0.3;
const INTRO_REVEAL_AT = 0.72;
/** How big the scale starts, as a share of the screen's width and height (whichever is reached first). */
const INTRO_SIZE = { width: 0.96, height: 0.56 };
/** A skipped opening finishes this quickly instead. */
const SKIP_MS = 450;
/** The sway: how far each way, seconds for a full swing there and back, and seconds to build up. */
const SWAY = 25 * DEG;
const SWAY_PERIOD = 14;
const SWAY_RAMP = 2;
/** The furthest the beam leans towards the pointer. */
const LEAN = 3 * DEG;
/** How far a tap presses a pan down, and for how long. */
const PRESS = 9 * DEG;
const PRESS_MS = 220;
/** The beam's spring: the same 1.1 Hz and 0.55 s decay as the game's wobble. */
const STIFFNESS = (2 * Math.PI * 1.1) ** 2;
const DAMPING = 2 / 0.55;
/** Radians of turn per pixel dragged, and how fast a flick slows down (per second). */
const TURN_PER_PX = 0.012;
const FRICTION = 3;
/** After a drag, the scale drifts back to its sway over this many seconds. */
const RETURN = 1.6;
/** Reduced motion: every beam move takes this long, with no overshoot. */
const STILL_MOVE_MS = 300;
/** A pointer that moves further than this is turning the scale, not tapping it. */
const DRAG_PX = 6;
/** How far the crumbs from the eaten cookie tip the beam. */
const CRUMB_LEAN = 1.4 * DEG;
/** The sky light and an even fill, standing in for the game's room reflections (its sky light is 0.9). */
const SKY = 1.4;
const FILL = 1.3;
/** The render probe: after a warm-up, below this many frames a second the scale only moves when touched. */
const PROBE_WARMUP_MS = 500;
const PROBE_FPS = 30;

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const smooth = (k: number) => k * k * (3 - 2 * k);
const easeInOut = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ShowcaseOptions {
  /** The scale's place on the page; its pointer input comes from here too. */
  slot: HTMLElement;
  /** A WebGL 2 context already made on the canvas (see ui/webgl.ts). */
  context: WebGL2RenderingContext;
  /** The opening has got far enough for the words to come in. */
  onreveal: () => void;
  /** The opening has finished, or it was never played. */
  ondone: () => void;
}

export interface ScaleView {
  /** Plays the opening, or just fades the scale in where it belongs. */
  start(intro: boolean): void;
  /** Hurries the opening to its end. */
  skip(): void;
  /** Crumbs fall into the left pan and the beam dips a little. */
  crumbs(): void;
  dispose(): void;
}

export interface ShowcaseState {
  angle: number;
  yaw: number;
  frames: number;
  running: boolean;
  /** No sway: it's drawn only while something moves (the render probe found it slow). */
  quiet: boolean;
  /** 'waiting' until started, then 'intro' while the opening plays, then 'placed'. */
  phase: 'waiting' | 'intro' | 'placed';
  /** Where the scale is fitted on screen, in CSS pixels. */
  rect: Rect;
}

/** Puts the camera where the box fits its view, checked corner by corner. */
function fit(camera: THREE.PerspectiveCamera): void {
  const back = DIRECTION;
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), back).normalize();
  const up = new THREE.Vector3().crossVectors(back, right);
  const tanV = Math.tan((camera.fov / 2) * DEG);
  const tanH = tanV * camera.aspect;
  const centre = BOX.getCenter(new THREE.Vector3());
  const p = new THREE.Vector3();
  let distance = 0;
  for (let i = 0; i < 8; i++) {
    p.set(i & 1 ? BOX.max.x : BOX.min.x, i & 2 ? BOX.max.y : BOX.min.y, i & 4 ? BOX.max.z : BOX.min.z).sub(centre);
    const z = p.dot(back);
    distance = Math.max(distance, z + Math.abs(p.dot(right)) / tanH, z + Math.abs(p.dot(up)) / tanV);
  }
  camera.position.copy(centre).addScaledVector(back, distance * 1.04);
  camera.lookAt(centre);
}

export async function showScale(canvas: HTMLCanvasElement, options: ShowcaseOptions): Promise<ScaleView> {
  const { slot } = options;
  const renderer = new THREE.WebGLRenderer({ canvas, context: options.context, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.debug.checkShaderErrors = import.meta.env.DEV;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setClearColor(0x000000, 0);

  // the game's key light; a sky light and an even fill stand in for its room reflections, which
  // take a long first frame to bake
  const scene = new THREE.Scene();

  const key = new THREE.DirectionalLight('#fff6e8', 2.4);
  key.position.set(-2.2, 5, 3.2);
  key.castShadow = true;
  key.shadow.mapSize.set(512, 512);
  key.shadow.radius = 3;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.01;
  Object.assign(key.shadow.camera, { left: -2.2, right: 2.2, top: 2.8, bottom: -1.2, near: 1, far: 12 });
  scene.add(key, new THREE.HemisphereLight('#fffaf2', '#b8a88f', SKY), new THREE.AmbientLight('#fff4e4', FILL));

  // the page's paper is the studio; only the shadow is drawn
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.ShadowMaterial({ color: '#4a3a28', opacity: 0.22 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const scale = new ScaleModel();
  // this scale is always free to swing, so its locking pin isn't drawn
  scale.pin.visible = false;
  scene.add(scale.group);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 30);

  // the beam and pans as a pose snapshot, so ScaleModel moves them exactly as the physics would
  const poses = new Float32Array(3 * POSE_STRIDE);
  const q = new THREE.Quaternion();
  const zAxis = new THREE.Vector3(0, 0, 1);
  function pose(angle: number): void {
    // positive angles lower the right-hand pan
    q.setFromAxisAngle(zAxis, -angle);
    const [px, py, pz] = RIG.pivot;
    [-1, 1].forEach((side, entry) => {
      const i = entry * POSE_STRIDE;
      poses.set([px + side * RIG.armLength * Math.cos(angle), py - side * RIG.armLength * Math.sin(angle) - RIG.hangDrop, pz, 0, 0, 0, 1], i);
    });
    poses.set([px, py, pz, q.x, q.y, q.z, q.w], 2 * POSE_STRIDE);
    scale.sync(poses);
  }

  const still = reducedMotion();
  let phase: ShowcaseState['phase'] = 'waiting';
  let introAt = 0;
  /** Set when the opening is skipped: how far it had got, and when. */
  let skippedAt: { progress: number; at: number } | undefined;
  let revealed = false;
  /** Where the opening starts: the scale's place, scaled up into the middle of the screen. */
  let rect: Rect = { x: 0, y: 0, width: 1, height: 1 };

  let quiet = false;
  /** Frames counted for the render probe, from `probeStart`. */
  let probeFrames = 0;
  let probeStart = -1;
  let probed = false;
  let angle = 0;
  let speed = 0;
  /** Where the beam is heading: the pointer's lean, a pressed pan, the crumbs. */
  let lean = 0;
  let press = 0;
  let pressUntil = 0;
  let crumbLean = 0;
  // reduced motion: a straight move from `moveFrom` to wherever the target was when it started
  let moveFrom = 0;
  let moveTo = 0;
  let moveStart = -Infinity;

  /** When the sway began (it builds up from nothing), and how long it has run. */
  let swayFrom = -1;
  let swayTime = 0;
  /** Turn added by dragging, on top of the sway. */
  let turn = 0;
  let turnSpeed = 0;
  let dragging = false;
  let released = -Infinity;

  const crumbs: { mesh: THREE.Mesh; y: number; v: number; born: number }[] = [];
  const crumbShape = new THREE.BoxGeometry(0.05, 0.03, 0.04);
  const crumbMaterial = new THREE.MeshStandardMaterial({ color: '#b07a3c', roughness: 0.9, flatShading: true });

  const target = (now: number) => {
    if (now > pressUntil) press = 0;
    return clamp(lean + press + crumbLean, -RIG.stopAngle, RIG.stopAngle);
  };

  let frame = 0;
  let frames = 0;
  let last = 0;
  let visible = true;
  let width = 0;
  let height = 0;

  /** The sway: off with reduced motion, and in quiet mode. */
  const ambient = () => !still && !quiet;
  const home = () => Math.round(turn / (2 * Math.PI)) * 2 * Math.PI;

  /** Something is still moving, so it keeps drawing even without the sway. */
  const moving = (now: number) =>
    phase === 'intro' ||
    dragging ||
    crumbs.length > 0 ||
    now < pressUntil ||
    now - moveStart < STILL_MOVE_MS ||
    Math.abs(angle - target(now)) > 1e-4 ||
    Math.abs(speed) > 1e-3 ||
    (!still && (Math.abs(turnSpeed) > 1e-3 || Math.abs(turn - home()) > 1e-3));

  const slotRect = (): Rect => {
    const r = slot.getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  };

  /** The slot's rectangle grown about the middle of the screen until it fills most of it. */
  const centreRect = (to: Rect): Rect => {
    const k = Math.min((innerWidth * INTRO_SIZE.width) / to.width, (innerHeight * INTRO_SIZE.height) / to.height);
    const w = to.width * Math.max(1, k);
    const h = to.height * Math.max(1, k);
    return { x: (innerWidth - w) / 2, y: (innerHeight - h) / 2, width: w, height: h };
  };

  const mix = (a: Rect, b: Rect, k: number): Rect => ({
    x: a.x + (b.x - a.x) * k,
    y: a.y + (b.y - a.y) * k,
    width: a.width + (b.width - a.width) * k,
    height: a.height + (b.height - a.height) * k,
  });

  /**
   * The canvas follows the slot unless it's covering the screen for the opening. It keeps its
   * place in the layout either way: for the opening it's sized to the screen from the same corner
   * and moved over it with a transform, so the hand-over doesn't count as a layout shift.
   */
  function layout(flying: boolean): void {
    canvas.classList.toggle('flying', flying);
    const style = canvas.style;
    style.width = style.height = style.transform = '';
    if (flying) {
      const corner = canvas.getBoundingClientRect();
      style.width = `${innerWidth}px`;
      style.height = `${innerHeight}px`;
      style.transform = `translate(${-corner.left}px, ${-corner.top}px)`;
    }
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w && h && (w !== width || h !== height)) {
      [width, height] = [w, h];
      renderer.setSize(w, h, false);
    }
  }

  /** Fits the scale to `on` (screen pixels) and draws the part of that view the canvas covers. */
  function aim(on: Rect): void {
    const c = canvas.getBoundingClientRect();
    camera.aspect = on.width / on.height;
    fit(camera);
    camera.setViewOffset(on.width, on.height, c.left - on.x, c.top - on.y, c.width, c.height);
  }

  /** How far through the opening it is, from 0 to 1. */
  function progress(now: number): number {
    if (skippedAt) return Math.min(1, skippedAt.progress + ((1 - skippedAt.progress) * (now - skippedAt.at)) / SKIP_MS);
    return clamp((now - introAt) / INTRO_MS, 0, 1);
  }

  function reveal(): void {
    if (revealed) return;
    revealed = true;
    options.onreveal();
  }

  function place(now: number): void {
    phase = 'placed';
    layout(false);
    swayFrom = now;
    reveal();
    options.ondone();
  }

  function draw(now: number): void {
    frame = 0;
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    const goal = target(now);
    let yaw = 0;

    if (phase === 'intro') {
      const p = progress(now);
      // one full turn, ending face on, while it moves and shrinks into place
      yaw = -2 * Math.PI * (1 - easeInOut(p));
      const to = slotRect();
      rect = mix(centreRect(to), to, easeInOut(clamp((p - INTRO_MOVE_FROM) / (1 - INTRO_MOVE_FROM), 0, 1)));
      if (p >= INTRO_REVEAL_AT) reveal();
      if (p >= 1) place(now);
    }
    if (phase === 'placed') rect = slotRect();

    if (still) {
      if (goal !== moveTo) [moveFrom, moveTo, moveStart] = [angle, goal, now];
      angle = moveFrom + (moveTo - moveFrom) * smooth(clamp((now - moveStart) / STILL_MOVE_MS, 0, 1));
    } else {
      speed += (-STIFFNESS * (angle - goal) - DAMPING * speed) * dt;
      angle = clamp(angle + speed * dt, -RIG.stopAngle, RIG.stopAngle);
      if (phase === 'placed') {
        if (ambient()) swayTime += dt;
        // the sway builds up from nothing, so it carries on from the opening without a jolt
        const ramp = smooth(clamp((now - swayFrom) / 1000 / SWAY_RAMP, 0, 1));
        yaw = ramp * SWAY * Math.sin((2 * Math.PI * swayTime) / SWAY_PERIOD);
      }
      if (!dragging) {
        turn += turnSpeed * dt;
        turnSpeed *= Math.exp(-FRICTION * dt);
        // once a flick has slowed, drift back to the nearest front-facing turn
        if (now - released > 600 && Math.abs(turnSpeed) < 0.2) turn += (home() - turn) * (1 - Math.exp((-3 / RETURN) * dt));
      }
    }
    scale.group.rotation.y = yaw + turn;
    pose(angle);

    for (let i = crumbs.length - 1; i >= 0; i--) {
      const c = crumbs[i]!;
      const age = (now - c.born) / 1000;
      if (still) c.y = 0.03;
      else if (c.y > 0.03) {
        c.v -= 9 * dt;
        c.y = Math.max(0.03, c.y + c.v * dt);
      }
      c.mesh.position.y = c.y;
      // they sit a moment, then go
      if (age > 1.8) c.mesh.scale.setScalar(Math.max(0, 1 - (age - 1.8) / 0.5));
      if (age > 2.3) {
        c.mesh.removeFromParent();
        crumbs.splice(i, 1);
        if (!crumbs.length) crumbLean = 0;
      }
    }

    aim(rect);
    renderer.render(scene, camera);
    frames++;
    // the render probe: a device that can't keep up with the sway goes quiet
    if (phase === 'placed' && ambient() && !probed) {
      if (probeStart < 0) probeStart = now + PROBE_WARMUP_MS;
      else if (now >= probeStart + 1000) [probed, quiet] = [true, probeFrames < PROBE_FPS];
      else if (now >= probeStart) probeFrames++;
    }
    if (phase !== 'waiting' && (visible || phase === 'intro') && (ambient() || moving(now))) frame = requestAnimationFrame(draw);
  }

  function wake(): void {
    if (frame || phase === 'waiting' || !visible) return;
    // a probe cut short by a hidden tab starts again
    [probeStart, probeFrames] = [-1, 0];
    last = performance.now();
    frame = requestAnimationFrame(draw);
  }

  // drawn only while its place is on screen and the tab is showing
  let onScreen = true;
  const observer = new IntersectionObserver(([entry]) => {
    onScreen = !!entry?.isIntersecting;
    visible = onScreen && document.visibilityState === 'visible';
    wake();
  });
  observer.observe(slot);
  const onVisibility = () => {
    visible = onScreen && document.visibilityState === 'visible';
    wake();
  };
  document.addEventListener('visibilitychange', onVisibility);
  const onResize = () => {
    layout(phase !== 'placed');
    wake();
  };
  const sizer = new ResizeObserver(onResize);
  sizer.observe(slot);
  addEventListener('resize', onResize);

  // the side the pointer is on dips a little; only for a mouse or trackpad, where there's a hover
  const hover = matchMedia('(hover: hover) and (pointer: fine)').matches && !still;
  const onPointerMove = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' || phase !== 'placed') return;
    const r = slot.getBoundingClientRect();
    lean = clamp((e.clientX - (r.left + r.width / 2)) / (innerWidth / 2), -1, 1) * LEAN;
    wake();
  };
  if (hover) addEventListener('pointermove', onPointerMove);

  let downX = 0;
  let downAt = 0;
  let lastX = 0;
  let lastAt = 0;
  let pointer: number | undefined;
  const onDown = (e: PointerEvent) => {
    if (pointer !== undefined || phase !== 'placed') return;
    pointer = e.pointerId;
    downX = lastX = e.clientX;
    downAt = lastAt = performance.now();
  };
  const onMove = (e: PointerEvent) => {
    if (e.pointerId !== pointer) return;
    if (!dragging && Math.abs(e.clientX - downX) > DRAG_PX) {
      dragging = true;
      slot.setPointerCapture(e.pointerId);
      wake();
    }
    if (!dragging) return;
    const now = performance.now();
    const step = (e.clientX - lastX) * TURN_PER_PX;
    turn += step;
    turnSpeed = (step / Math.max(1, now - lastAt)) * 1000;
    lastX = e.clientX;
    lastAt = now;
    if (still) wake();
  };
  const onUp = (e: PointerEvent) => {
    if (e.pointerId !== pointer) return;
    pointer = undefined;
    if (dragging) {
      dragging = false;
      released = performance.now();
      if (still || released - lastAt > 80) turnSpeed = 0;
      return;
    }
    if (performance.now() - downAt > 600) return;
    // a tap: the pan on that side goes down, and the beam swings back when it's let go
    const r = slot.getBoundingClientRect();
    const side = e.clientX < r.left + r.width / 2 ? -1 : 1;
    press = side * PRESS;
    pressUntil = performance.now() + (still ? STILL_MOVE_MS + 300 : PRESS_MS);
    wake();
  };
  const onCancel = (e: PointerEvent) => {
    if (e.pointerId !== pointer) return;
    pointer = undefined;
    dragging = false;
  };
  slot.addEventListener('pointerdown', onDown);
  slot.addEventListener('pointermove', onMove);
  slot.addEventListener('pointerup', onUp);
  slot.addEventListener('pointercancel', onCancel);

  if (import.meta.env.DEV) {
    Object.assign(window, {
      __pbStart: { state: (): ShowcaseState => ({ angle, yaw: scale.group.rotation.y, frames, running: frame !== 0, quiet, phase, rect }) },
    });
  }

  // set up for the opening's first frame, so compiling covers exactly what it will draw
  layout(true);
  rect = centreRect(slotRect());
  scale.group.rotation.y = -2 * Math.PI;
  pose(0);
  aim(rect);
  // compiled off the main thread where the browser can, so setting up doesn't stall the page
  await renderer.compileAsync(scene, camera);

  return {
    start(intro) {
      if (phase !== 'waiting') return;
      const now = performance.now();
      if (intro && !still) {
        phase = 'intro';
        introAt = now;
        layout(true);
        canvas.classList.add('shown');
        last = now;
        frame = requestAnimationFrame(draw);
      } else {
        place(now);
        canvas.classList.add('shown');
        wake();
      }
    },
    skip() {
      if (phase === 'intro' && !skippedAt) skippedAt = { progress: progress(performance.now()), at: performance.now() };
    },
    crumbs() {
      const pan = scale.pans[0];
      for (let i = 0; i < 6; i++) {
        const mesh = new THREE.Mesh(crumbShape, crumbMaterial);
        mesh.castShadow = true;
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * RIG.panRadius * 0.6;
        mesh.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
        mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
        pan.add(mesh);
        crumbs.push({ mesh, y: 0.9 + Math.random() * 0.5, v: 0, born: performance.now() + i * 40 });
      }
      crumbLean = -CRUMB_LEAN;
      wake();
    },
    dispose() {
      cancelAnimationFrame(frame);
      frame = 0;
      observer.disconnect();
      sizer.disconnect();
      removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
      removeEventListener('pointermove', onPointerMove);
      slot.removeEventListener('pointerdown', onDown);
      slot.removeEventListener('pointermove', onMove);
      slot.removeEventListener('pointerup', onUp);
      slot.removeEventListener('pointercancel', onCancel);
      crumbShape.dispose();
      crumbMaterial.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      if (import.meta.env.DEV) delete (window as { __pbStart?: unknown }).__pbStart;
    },
  };
}
