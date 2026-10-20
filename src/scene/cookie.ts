// The cookie on the cookie notice: the cookie model on its own small, transparent canvas, lit like
// the item tiles. It turns slowly and leans towards the pointer. It loads with three.js, so the
// notice imports it lazily and the start screen doesn't wait for it.

import * as THREE from 'three';
import { loadModel, MATERIAL } from './models';

/** The model's own proportions (it's built into a unit cube): a flat, six-sided biscuit. */
const SIZE: [number, number, number] = [1, 0.23, 0.87];
/** Radians a second. */
const SPIN = 0.4;
/** The furthest it leans towards the pointer, in radians. */
const LEAN = 0.25;
/** How quickly the lean catches up with the pointer, per second. */
const FOLLOW = 6;

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v: number) => Math.max(-1, Math.min(1, v));

export interface CookieView {
  /** Stops it turning, so the bites stay where they were taken. */
  hold(): void;
  dispose(): void;
}

export async function showCookie(canvas: HTMLCanvasElement): Promise<CookieView> {
  const model = await loadModel('cookie');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const key = new THREE.DirectionalLight('#fff6e8', 2.4);
  key.position.set(-2.2, 5, 3.2);
  scene.add(key, new THREE.HemisphereLight('#fffaf2', '#b8a88f', 1.3));

  const cookie = new THREE.Mesh(model.geometry, MATERIAL);
  cookie.scale.set(...SIZE);
  // leans as a whole while the cookie turns inside it
  const lean = new THREE.Group();
  lean.add(cookie);
  scene.add(lean);

  // looking down on it, so it reads as a round thing with a bite out of the edge
  const camera = new THREE.PerspectiveCamera(30, canvas.clientWidth / canvas.clientHeight, 0.1, 20);
  camera.position.set(0, 2, 1.3);
  camera.lookAt(0, -0.05, 0);

  const still = reducedMotion();
  const target = { x: 0, y: 0 };
  const now = { x: 0, y: 0 };
  let turning = !still;
  let frame = 0;
  let last = performance.now();

  const point = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    target.x = clamp((e.clientX - (r.left + r.width / 2)) / (innerWidth / 2));
    target.y = clamp((e.clientY - (r.top + r.height / 2)) / (innerHeight / 2));
  };

  const draw = (t: number) => {
    const dt = Math.min(0.1, (t - last) / 1000);
    last = t;
    if (turning) cookie.rotation.y += SPIN * dt;
    const k = 1 - Math.exp(-FOLLOW * dt);
    now.x += (target.x - now.x) * k;
    now.y += (target.y - now.y) * k;
    // the edge nearest the pointer dips towards it
    lean.rotation.set(now.y * LEAN, 0, -now.x * LEAN);
    renderer.render(scene, camera);
    frame = requestAnimationFrame(draw);
  };

  if (still) {
    renderer.render(scene, camera);
  } else {
    addEventListener('pointermove', point);
    frame = requestAnimationFrame(draw);
  }

  return {
    hold: () => (turning = false),
    dispose() {
      cancelAnimationFrame(frame);
      removeEventListener('pointermove', point);
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
