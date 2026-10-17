import * as THREE from 'three';
import { PhysicsClient } from '../physics/client';
import { tipFor, WOBBLE } from '../physics/beam';
import { box, prism, RIG, type Quat } from '../physics/rig';
import { POSE_STRIDE, RIG_ENTRIES } from '../physics/protocol';
import { BodyMeshes, hullGeometry } from '../scene/bodies';
import { ScaleModel } from '../scene/scale';
import { Stage } from '../scene/stage';

const COLOURS = ['#c9a27a', '#8f9a7a', '#b9775e', '#d8c39a', '#7d8b99', '#a8906c', '#c4b5a0', '#6f7f6a'];
const materials = COLOURS.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, flatShading: true }));

export interface Stats {
  fps: number;
  stepMs: number;
  bodies: number;
  inline: boolean;
}

export interface CheckResult {
  meanFps: number;
  lowFps: number;
  stepMs: number;
  bodies: number;
  passed: boolean;
}

export type Phase = 'loading' | 'idle' | 'placing' | 'settling' | 'measuring';

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rough stand-ins for real objects: boxes, tins and pebbles 8–26 cm across. */
function randomHull(rng: () => number): Float32Array {
  const size = 0.04 + rng() * 0.09;
  const kind = Math.floor(rng() * 3);
  if (kind === 0) return box(size, size * (0.3 + rng() * 0.9), size * (0.5 + rng() * 0.8));
  if (kind === 1) return prism(size * 0.7, size * (0.4 + rng()), 6 + Math.floor(rng() * 8));
  const p: number[] = [];
  for (let i = 0; i < 20; i++) {
    const u = rng() * 2 - 1, th = rng() * Math.PI * 2, s = Math.sqrt(1 - u * u), k = size * (0.85 + rng() * 0.2);
    p.push(Math.cos(th) * s * k * 1.3, u * k * 0.6, Math.sin(th) * s * k);
  }
  return new Float32Array(p);
}

function randomQuat(rng: () => number): Quat {
  const u1 = rng(), u2 = rng() * Math.PI * 2, u3 = rng() * Math.PI * 2;
  const a = Math.sqrt(1 - u1), b = Math.sqrt(u1);
  return [a * Math.sin(u2), a * Math.cos(u2), b * Math.sin(u3), b * Math.cos(u3)];
}

const CHECK_BODIES = 80;
const SETTLE_SECONDS = 3;
const MEASURE_SECONDS = 4;

export class Sandbox {
  onStats: (stats: Stats) => void = () => {};
  onPhase: (phase: Phase) => void = () => {};
  onResult: (result: CheckResult) => void = () => {};
  onError: (message: string) => void = () => {};

  private readonly stage: Stage;
  private readonly scale = new ScaleModel();
  private readonly bodies = new BodyMeshes();
  private readonly physics = new PhysicsClient();
  private readonly rng = mulberry32(42);
  private nextId = 1;
  private promptId = 0;
  private frameCount = 0;
  private toPlace = 0;
  private phaseTime = 0;
  private phase: Phase = 'loading';
  private frameTimes: number[] = [];
  private fpsFrames = 0;
  private fpsTime = 0;
  private pinOut = 0;
  private pinTarget = 0;
  private runningCheck = false;
  private realKg = new Map<number, number>();

  constructor(host: HTMLElement) {
    const lowEnd = (navigator.hardwareConcurrency ?? 8) <= 4;
    this.stage = new Stage(host, { shadowMapSize: lowEnd ? 1024 : 2048, maxPixelRatio: lowEnd ? 1.5 : 2 });
    this.stage.scene.add(this.scale.group, this.bodies.group);
    this.stage.setFraming([this.scale.group]);
    this.physics.onError = (m) => this.onError(m);
  }

  async start(): Promise<void> {
    this.stage.start((dt) => this.frame(dt));
    await this.physics.init({ unitsPerMetre: 1 });
    this.addPrompt();
    this.setPhase('idle');
  }

  private setPhase(phase: Phase): void {
    this.phase = phase;
    this.phaseTime = 0;
    this.onPhase(phase);
  }

  private addPrompt(): void {
    const points = box(0.22, 0.18, 0.2);
    const id = this.nextId++;
    this.promptId = id;
    this.bodies.add(id, hullGeometry(points), new THREE.MeshStandardMaterial({ color: '#5d6b7a', roughness: 0.6, flatShading: true }));
    this.physics.add({ id, points, pos: [-RIG.armLength, RIG.pivot[1] - RIG.hangDrop + 0.25, 0], quat: [0, 0, 0, 1] });
    this.realKg.set(id, 40);
  }

  /** Sets an object down above whatever is already stacked at that spot. */
  private placeOne(): void {
    const ang = this.rng() * Math.PI * 2;
    const r = Math.sqrt(this.rng()) * 0.3;
    const x = RIG.armLength + Math.cos(ang) * r;
    const z = Math.sin(ang) * r;
    const snap = this.physics.latest;
    let y = (snap ? snap.poses[POSE_STRIDE + 1]! : RIG.pivot[1] - RIG.hangDrop) + 0.16;
    if (snap) {
      for (let i = 0; i < snap.ids.length; i++) {
        const o = (RIG_ENTRIES + i) * POSE_STRIDE;
        if (snap.ids[i] !== this.promptId && Math.hypot(snap.poses[o]! - x, snap.poses[o + 2]! - z) < 0.2) y = Math.max(y, snap.poses[o + 1]! + 0.2);
      }
    }
    const points = randomHull(this.rng);
    const id = this.nextId++;
    this.bodies.add(id, hullGeometry(points), materials[id % materials.length]!);
    this.physics.add({ id, points, pos: [x, y, z], quat: randomQuat(this.rng) });
    this.realKg.set(id, Math.exp(Math.log(0.02) + this.rng() * Math.log(2000)));
  }

  add(count: number): void {
    if (this.phase === 'loading') return;
    this.unlock();
    this.toPlace += count;
    this.setPhase('placing');
  }

  clear(): void {
    if (this.phase === 'loading') return;
    this.runningCheck = false;
    this.toPlace = 0;
    this.physics.clear();
    this.bodies.clear();
    this.realKg.clear();
    this.unlock();
    this.addPrompt();
    this.setPhase('idle');
  }

  private unlock(): void {
    this.physics.unlock();
    this.pinTarget = 0;
  }

  private release(kind: 'wobble' | 'tip'): void {
    this.physics.lock([...this.realKg]);
    this.physics.beam(kind === 'wobble' ? WOBBLE : tipFor(2));
    this.pinTarget = 1;
  }

  wobble(): void {
    if (this.phase === 'idle') this.release('wobble');
  }

  tip(): void {
    if (this.phase === 'idle') this.release('tip');
  }

  runCheck(): void {
    if (this.phase === 'loading') return;
    this.clear();
    this.runningCheck = true;
    this.toPlace = CHECK_BODIES;
    this.setPhase('placing');
  }

  private frame(dt: number): void {
    this.frameCount++;
    this.physics.tick(dt);
    const snap = this.physics.latest;
    if (snap) {
      this.scale.sync(snap.poses);
      this.bodies.sync(snap);
    }
    this.pinOut += (this.pinTarget - this.pinOut) * Math.min(1, dt * 12);
    this.scale.pin.position.z = 0.07 + this.pinOut * 0.14;

    this.phaseTime += dt;
    if (this.phase === 'placing') {
      // one every other frame keeps each new object clear of the last
      if (this.toPlace > 0 && this.frameCount % 2 === 0) {
        this.placeOne();
        this.toPlace--;
      }
      if (this.toPlace === 0) this.setPhase(this.runningCheck ? 'settling' : 'idle');
    } else if (this.phase === 'settling' && this.phaseTime >= SETTLE_SECONDS) {
      this.frameTimes = [];
      this.release('tip');
      this.setPhase('measuring');
    } else if (this.phase === 'measuring') {
      this.frameTimes.push(dt);
      if (this.phaseTime >= MEASURE_SECONDS) this.finishCheck();
    }

    this.fpsFrames++;
    this.fpsTime += dt;
    if (this.fpsTime >= 0.5) {
      this.onStats({ fps: this.fpsFrames / this.fpsTime, stepMs: snap?.stepMs ?? 0, bodies: this.bodies.size, inline: this.physics.inline });
      this.fpsFrames = 0;
      this.fpsTime = 0;
    }
  }

  private finishCheck(): void {
    const times = this.frameTimes.slice(1);
    const total = times.reduce((a, b) => a + b, 0);
    const sorted = times.slice().sort((a, b) => b - a);
    const worst = sorted.slice(0, Math.max(1, Math.ceil(sorted.length / 100)));
    const meanFps = times.length / total;
    const lowFps = worst.length / worst.reduce((a, b) => a + b, 0);
    this.runningCheck = false;
    this.onResult({
      meanFps,
      lowFps,
      stepMs: this.physics.latest?.stepMs ?? 0,
      bodies: this.bodies.size,
      passed: meanFps >= 55,
    });
    this.setPhase('idle');
  }

  dispose(): void {
    this.stage.dispose();
    this.physics.dispose();
  }
}
