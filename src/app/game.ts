import * as THREE from 'three';
import { CONFIG } from '../game/config';
import { judge, spokenResult, type Margin, type Result } from '../game/judge';
import type { RoundSupply } from '../game/freeplay';
import type { Item, Round } from '../game/round';
import { tipFor, WOBBLE, type BeamMotion } from '../physics/beam';
import { PhysicsClient } from '../physics/client';
import { POSE_STRIDE, RIG_ENTRIES, type Snapshot } from '../physics/protocol';
import { locate, PAN_FLOOR_TOP, panRestY, RIG, type Quat, type Vec3 } from '../physics/rig';
import { BodyMeshes } from '../scene/bodies';
import { Ghost, type Pose } from '../scene/ghost';
import { Gestures, type Aim, type CarrySource, type GestureTarget } from '../scene/gestures';
import { ScaleModel } from '../scene/scale';
import { Stage, type Insets } from '../scene/stage';
import { renderThumbnails } from '../scene/thumbnails';

/** On touch the object is aimed this far above the finger, so the finger doesn't hide it. */
const TOUCH_LIFT = 48;
/** A body has to stay on (or off) the pan this long before it counts, so one sliding past the rim doesn't flicker. */
const SETTLE_SECONDS = 0.3;
const UP = new THREE.Vector3(0, 1, 0);
const INK = '#1f1b17';
/** Close-up distance limits, in pan diameters. */
const CLOSE_MIN = 0.6;
const CLOSE_MAX = 3;
const OVERVIEW_DIRECTION = new THREE.Vector3(0.35, 0.9, 4).normalize();
/** From the front right and above, looking down into the pan. */
const CLOSE_DIRECTION = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(52), 0.5);

/** What a game allows: its win window, and how many things can be out at once. */
export interface Limits {
  margin: Margin;
  maxBodies: number;
}

export const DAILY_LIMITS: Limits = { margin: CONFIG.margin, maxBodies: CONFIG.maxDynamicBodies };

export type View = 'overview' | 'close';
export type Phase = 'loading' | 'intro' | 'placing' | 'locking' | 'revealing' | 'result' | 'clearing';

/** Lock-in choreography, in seconds; the second number is the reduced-motion version. */
const FADE_SECONDS = 0.18;
const LOCK_AT = [0.9, 0.2] as const;
const PIN_SECONDS = [0.35, 0.1] as const;
const RESULT_DELAY = [0.5, 0.3] as const;
const LEVEL_SECONDS = [0.5, 0.15] as const;
const PIN_TRAVEL = 0.14;
/** The prompt is lowered onto its pan from this far above, over this long. */
const INTRO_DROP = 1.2;
const INTRO_SECONDS = 1.1;

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export interface FloorGroup {
  itemId: string;
  name: string;
  count: number;
}

export interface PlacingState {
  ready: boolean;
  /** Which of the game's rounds is on the scale. */
  round: number;
  onPan: Record<string, number>;
  panCount: number;
  floor: FloorGroup[];
  full: boolean;
  carrying: string | undefined;
  putBack: boolean;
  phase: Phase;
  result: Result | undefined;
  /** Objects left out of this round because their models wouldn't load. */
  missing: string[];
  /** The round being loaded, which is ahead of `round` until it opens. */
  opening: number;
  /** The round's models wouldn't load, and it can't be played without them. */
  failed: boolean;
}

/** Where to draw the rotate buttons: just under the selected object, in client pixels. */
export interface Selection {
  x: number;
  y: number;
}

interface Placed {
  itemId: string;
  onPan: boolean;
  /** When its position first disagreed with `onPan`. */
  since?: number;
}

interface Kind {
  item: Item;
  /** Stretched to the object's size; the material is shared. */
  geometry: THREE.BufferGeometry;
  material: THREE.MeshStandardMaterial;
  /** In physics units, in the body's frame. */
  hulls: Float32Array[];
}

interface Loaded {
  kinds: Map<string, Kind>;
  missing: string[];
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export class Game implements GestureTarget {
  onState: (state: PlacingState) => void = () => {};
  onAnnounce: (message: string) => void = () => {};
  onSelection: (selection: Selection | null) => void = () => {};
  onThumbnails: (urls: Map<string, string>) => void = () => {};
  onError: (message: string) => void = () => {};
  onView: (view: View) => void = () => {};
  onResult: (round: number, result: Result) => void = () => {};

  readonly canvas: HTMLCanvasElement;
  private readonly stage: Stage;
  private readonly scale = new ScaleModel();
  private readonly meshes = new BodyMeshes();
  private readonly physics = new PhysicsClient();
  private readonly ghost = new Ghost();
  private readonly gestures: Gestures;
  private kinds = new Map<string, Kind>();
  private missing: string[] = [];
  /** A round's objects, loading in the background: the next one's start while this result shows. */
  private prepared: { index: number; loaded: Promise<Loaded> } | undefined;
  private failed = false;
  /** The round being loaded, for a retry. */
  private opening = 0;
  private index: number;
  private readonly bodies = new Map<number, Placed>();
  private readonly ray = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly v = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private readonly bounds = new THREE.Box3();
  private readonly selectionRing = new THREE.Mesh(
    new THREE.RingGeometry(0.92, 1, 32).rotateX(-Math.PI / 2),
    // drawn over the stack, which would otherwise hide it
    new THREE.MeshBasicMaterial({ color: INK, transparent: true, opacity: 0.7, depthTest: false, depthWrite: false }),
  );
  /** Kept across rounds: an object looks the same whatever the round's scale. */
  private readonly thumbnails = new Map<string, string>();
  private promptRest: Pose | undefined;
  private introTime = 0;
  private nextId = 1;
  private time = 0;
  private ready = false;
  private carrying: { itemId: string; restore?: Pose } | undefined;
  private putBack = false;
  private selected: number | undefined;
  private lastSelection = '';
  private lastState = '';
  private disposed = false;
  private view: View = 'overview';
  private readonly panAt = new THREE.Vector3();
  private readonly panMoved = new THREE.Vector3();
  private promptId = 0;
  private phase: Phase = 'intro';
  private phaseTime = 0;
  private calm = false;
  private result: Result | undefined;
  private motion: BeamMotion = { kind: 'locked' };
  private fading: number[] = [];
  private beamStarted = false;
  private pinOut = 0;
  private pinTarget = 0;

  constructor(
    host: HTMLElement,
    private readonly sheet: () => HTMLElement | undefined,
    private readonly rounds: RoundSupply,
    /** Where a resumed game picks up. */
    first = 0,
    private readonly limits: Limits = DAILY_LIMITS,
  ) {
    const lowEnd = (navigator.hardwareConcurrency ?? 8) <= 4;
    this.stage = new Stage(host, { shadowMapSize: lowEnd ? 1024 : 2048, maxPixelRatio: lowEnd ? 1.5 : 2 });
    this.selectionRing.visible = false;
    this.selectionRing.renderOrder = 1;
    this.stage.scene.add(this.scale.group, this.meshes.group, this.ghost.group, this.selectionRing);
    this.scale.pans[1].getWorldPosition(this.panAt);
    this.setView('overview', false);
    this.canvas = this.stage.renderer.domElement;
    this.physics.onError = (m) => this.onError(m);
    this.index = first;
    this.gestures = new Gestures(this);
    this.canvas.addEventListener('pointermove', this.hover);
    addEventListener('pointerdown', this.skipIntro, true);
    // hooks for the browser tests; the whole block is dropped from production builds
    if (import.meta.env.DEV) {
      const yawOf = (q: THREE.Quaternion) => new THREE.Euler().setFromQuaternion(q, 'YXZ').y;
      Object.assign(window, {
        __pb: {
          state: () => {
            const { controls } = this.stage;
            const selected = this.selected === undefined ? undefined : this.meshes.get(this.selected);
            return {
              ready: this.ready,
              round: this.index,
              carrying: this.ghost.active,
              placed: this.bodies.size,
              ...this.counts(),
              azimuth: controls.azimuthAngle,
              polar: controls.polarAngle,
              distance: controls.distance,
              heading: this.ghost.heading,
              selected: this.selected,
            view: this.view,
            phase: this.phase,
            prompt: this.meshes.get(this.promptId)?.position.toArray(),
            result: this.result,
            beam: this.scale.beam.rotation.z,
            pin: this.pinOut,
            target: controls.getTarget(new THREE.Vector3()).toArray(),
              selectedYaw: selected ? yawOf(selected.quaternion) : undefined,
              positions: [...this.bodies.keys()].map((id) => this.meshes.get(id)!.position.toArray()),
            };
          },
          project: (x: number, y: number, z: number) => {
            const r = this.canvas.getBoundingClientRect();
            const v = new THREE.Vector3(x, y, z).project(this.stage.camera);
            return [r.left + ((v.x + 1) / 2) * r.width, r.top + ((1 - v.y) / 2) * r.height];
          },
          /** Client-pixel rectangle of everything the current view should show. */
          framed: () => {
            const box = this.view === 'overview' ? this.overviewBox() : this.closeBox();
            const r = this.canvas.getBoundingClientRect();
            const rect = [Infinity, Infinity, -Infinity, -Infinity];
            this.stage.camera.updateMatrixWorld();
            for (let i = 0; i < 8; i++) {
              const v = new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(this.stage.camera);
              const x = r.left + ((v.x + 1) / 2) * r.width;
              const y = r.top + ((1 - v.y) / 2) * r.height;
              rect[0] = Math.min(rect[0]!, x);
              rect[1] = Math.min(rect[1]!, y);
              rect[2] = Math.max(rect[2]!, x);
              rect[3] = Math.max(rect[3]!, y);
            }
            return rect;
          },
          spawn: (n: number, itemId = this.round.inventory[0]!.id) => {
            for (let i = 0; i < n && this.bodies.size < this.limits.maxBodies; i++) {
              const k = this.bodies.size;
              const a = k * 2.4;
              const r = 0.12 + (k % 3) * 0.1;
              this.addBody(itemId, { pos: [RIG.armLength + Math.cos(a) * r, panRestY() + 0.15 + k * 0.06, Math.sin(a) * r], quat: [0, 0, 0, 1] });
            }
          },
          put: (itemId: string, x: number, y: number, z: number) => this.addBody(itemId, { pos: [x, y, z], quat: [0, 0, 0, 1] }),
          lockIn: () => this.lockIn(),
          round: () => ({
            index: this.index,
            prompt: { id: this.round.prompt.id, kg: this.round.prompt.kg },
            inventory: this.round.inventory.map(({ id, kg }) => ({ id, kg })),
            solution: this.round.solution,
          }),
        },
      });
    }
  }

  private get round(): Round {
    return this.rounds.at(this.index);
  }

  async start(): Promise<void> {
    this.stage.start((dt) => this.frame(dt));
    this.prepare(this.index);
    await this.physics.init({ unitsPerMetre: this.round.unitsPerMetre });
    await this.open(this.index);
  }

  /**
   * Loads a round's models and stretches each to its object's size. One that won't load (after
   * its retries) is left out, unless the round can't be played without it.
   */
  private async load(index: number): Promise<Loaded> {
    const round = this.rounds.at(index);
    const { loadModel, shapeModel, MATERIAL } = await import('../scene/models');
    const items = [round.prompt, ...round.inventory];
    const models = await Promise.allSettled(items.map(({ model }) => ('file' in model ? loadModel(model.file) : shapeModel(model.shape, model.color))));
    const missing = items.filter((_, i) => models[i]!.status === 'rejected').map((item) => item.id);
    if (missing.length && !this.rounds.playableWithout(index, missing)) throw new Error(`Round ${index + 1} couldn't load: ${missing.join(', ')}`);
    const kinds = new Map<string, Kind>();
    items.forEach((item, i) => {
      const result = models[i]!;
      if (result.status === 'rejected') return;
      const [x, y, z] = item.size;
      kinds.set(item.id, {
        item,
        geometry: result.value.geometry.clone().scale(x, y, z),
        material: MATERIAL,
        hulls: result.value.hulls.map((hull) => hull.map((v, k) => v * item.size[k % 3]!)),
      });
    });
    return { kinds, missing };
  }

  /** Starts loading a round in the background, once. */
  private prepare(index: number): Promise<Loaded> {
    if (this.prepared?.index !== index) {
      const loaded = this.load(index);
      // the failure is dealt with when the round opens
      loaded.catch(() => {});
      this.prepared = { index, loaded };
    }
    return this.prepared.loaded;
  }

  /** Waits for a round's objects, then lowers its prompt in. If they won't load, it waits for a retry. */
  private async open(index: number): Promise<void> {
    this.failed = false;
    this.opening = index;
    this.setPhase('loading');
    let loaded: Loaded;
    try {
      loaded = await this.prepare(index);
    } catch {
      this.failed = true;
      return;
    } finally {
      if (this.prepared?.index === index) this.prepared = undefined;
    }
    if (this.disposed) return this.disposeKinds(loaded.kinds);
    this.disposeKinds(this.kinds);
    this.kinds = loaded.kinds;
    this.missing = loaded.missing;
    this.index = index;
    // the world is empty here, so it can change size
    this.physics.scale({ unitsPerMetre: this.round.unitsPerMetre });
    this.ready = true;
    this.renderThumbnails(this.round);
    this.beginIntro();
  }

  /** Tries a round that wouldn't load again. */
  retry(): void {
    if (this.failed) void this.open(this.opening);
  }

  private disposeKinds(kinds: Map<string, Kind>): void {
    for (const { geometry } of kinds.values()) geometry.dispose();
  }

  /** Pictures for a round's tiles, from its kinds once they're built. */
  private renderThumbnails(round: Round, kinds = this.kinds): void {
    const missing = round.inventory.filter((item) => !this.thumbnails.has(item.id) && kinds.has(item.id)).map((item) => ({ id: item.id, ...kinds.get(item.id)! }));
    void renderThumbnails(missing)
      .then((urls) => {
        if (this.disposed) return urls.forEach((url) => URL.revokeObjectURL(url));
        for (const [id, url] of urls) this.thumbnails.set(id, url);
        this.onThumbnails(new Map(this.thumbnails));
      })
      // the tiles fall back to flat colour swatches
      .catch(() => {});
  }

  /**
   * The prompt is lowered onto the left pan outside physics, then set down; it's never one of
   * the player's bodies. Any tap skips the rest of the descent.
   */
  private beginIntro(): void {
    const prompt = this.kind(this.round.prompt.id);
    let bottom = Infinity;
    for (const hull of prompt.hulls) for (let i = 1; i < hull.length; i += 3) bottom = Math.min(bottom, hull[i]!);
    this.promptRest = { pos: [-RIG.armLength, panRestY() + PAN_FLOOR_TOP - bottom + 0.005, 0], quat: [0, 0, 0, 1] };
    const id = this.nextId++;
    this.promptId = id;
    const mesh = this.meshes.add(id, prompt.geometry, prompt.material, this.promptRest);
    // framed where it will rest, not where it starts
    if (this.view === 'overview') this.setView('overview');
    this.introTime = 0;
    this.setPhase('intro');
    if (reducedMotion()) this.endIntro();
    else mesh.position.y += INTRO_DROP;
  }

  private endIntro(): void {
    if (this.phase !== 'intro' || !this.promptRest) return;
    this.meshes.get(this.promptId)?.position.fromArray(this.promptRest.pos);
    this.physics.add({ id: this.promptId, hulls: this.kind(this.round.prompt.id).hulls, ...this.promptRest });
    this.setPhase('placing');
  }

  private readonly skipIntro = (): void => this.endIntro();

  setView(view: View, animate = true): void {
    this.view = view;
    if (view === 'overview') {
      this.stage.setDistanceRange(CLOSE_MIN, 0);
      this.stage.frame(this.overviewBox(), OVERVIEW_DIRECTION, animate);
    } else {
      this.stage.setDistanceRange(CLOSE_MIN, CLOSE_MAX);
      this.stage.frame(this.closeBox(), CLOSE_DIRECTION, animate);
    }
    this.onView(view);
  }

  toggleView(): void {
    // the reveal always plays in the overview
    if (this.phase === 'locking' || this.phase === 'revealing') return;
    this.setView(this.view === 'overview' ? 'close' : 'overview');
  }

  /** Space taken by the overlays at each edge of the scene, so framing keeps clear of them. */
  setInsets(insets: Insets): void {
    this.stage.setInsets(insets);
  }

  /** The scale, the prompt and the player's stack; fallen objects don't pull the camera back. */
  private overviewBox(): THREE.Box3 {
    const box = new THREE.Box3().setFromObject(this.scale.group);
    for (const mesh of this.meshes.group.children) {
      const body = this.bodies.get(mesh.userData.bodyId as number);
      if (!body || body.onPan) box.expandByObject(mesh);
    }
    return box;
  }

  /** The player's pan with a little headroom, plus whatever is stacked on it. */
  private closeBox(): THREE.Box3 {
    const { x, y, z } = this.scale.pans[1].position;
    const r = RIG.panRadius + 0.06;
    const box = new THREE.Box3(new THREE.Vector3(x - r, y - 0.08, z - r), new THREE.Vector3(x + r, y + 0.35, z + r));
    for (const [id, body] of this.bodies) {
      const mesh = this.meshes.get(id);
      if (mesh && body.onPan) box.expandByObject(mesh);
    }
    return box;
  }

  private kind(itemId: string): Kind {
    return this.kinds.get(itemId)!;
  }

  private addBody(itemId: string, pose: Pose): number {
    const kind = this.kind(itemId);
    const id = this.nextId++;
    this.meshes.add(id, kind.geometry, kind.material, pose);
    this.physics.add({ id, hulls: kind.hulls, ...pose });
    this.bodies.set(id, { itemId, onPan: this.isOnPan(pose.pos) });
    return id;
  }

  private removeBody(id: number): void {
    this.physics.remove(id);
    this.meshes.remove(id);
    this.bodies.delete(id);
    if (this.selected === id) this.selected = undefined;
  }

  private isOnPan(pos: Vec3): boolean {
    const pan = this.scale.pans[1];
    const quat = pan.quaternion;
    return locate([pan.position.x, pan.position.y, pan.position.z], [quat.x, quat.y, quat.z, quat.w], pos) === 'pan';
  }

  private setRay(x: number, y: number): void {
    const r = this.canvas.getBoundingClientRect();
    this.ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.stage.camera);
  }

  bodyAt(x: number, y: number): number | undefined {
    this.setRay(x, y);
    for (const hit of this.ray.intersectObjects(this.meshes.group.children, false)) {
      const id = hit.object.userData.bodyId as number;
      if (this.bodies.has(id)) return id;
    }
    return undefined;
  }

  pickUp(source: CarrySource): boolean {
    this.endIntro();
    if (!this.ready || this.phase !== 'placing' || this.ghost.active) return false;
    let itemId: string;
    let restore: Pose | undefined;
    if (source.kind === 'item') {
      if (this.bodies.size >= this.limits.maxBodies) return false;
      itemId = source.itemId;
    } else if (source.kind === 'floor') {
      const id = [...this.bodies].find(([, b]) => b.itemId === source.itemId && !b.onPan)?.[0];
      if (id === undefined) return false;
      itemId = source.itemId;
      this.removeBody(id);
    } else {
      const body = this.bodies.get(source.id);
      const mesh = this.meshes.get(source.id);
      if (!body || !mesh) return false;
      itemId = body.itemId;
      restore = { pos: mesh.position.toArray() as Vec3, quat: mesh.quaternion.toArray() as Quat };
      this.removeBody(source.id);
    }
    const kind = this.kind(itemId);
    this.ghost.begin(kind.geometry, kind.material, restore);
    this.carrying = { itemId, restore };
    this.selected = undefined;
    this.canvas.style.cursor = 'grabbing';
    return true;
  }

  carry(aim: Aim): void {
    if (!this.carrying) return;
    const sheet = this.sheet()?.getBoundingClientRect();
    this.putBack = !!sheet && aim.x >= sheet.left && aim.x <= sheet.right && aim.y >= sheet.top && aim.y <= sheet.bottom;
    if (this.putBack) {
      this.ghost.aim(undefined);
      return;
    }
    this.setRay(aim.x, aim.y - (aim.touch ? TOUCH_LIFT : 0));
    const targets = [...this.scale.surfaces, this.stage.floor, this.meshes.group];
    this.ghost.aim(this.ray.intersectObjects(targets, true)[0]?.point);
  }

  drop(aim: Aim): void {
    if (!this.carrying) return;
    this.carry(aim);
    const { itemId } = this.carrying;
    const name = this.kind(itemId).item.name;
    if (this.putBack || !this.ghost.aiming) {
      this.onAnnounce(`Put back: ${name}.`);
    } else {
      const id = this.addBody(itemId, this.ghost.pose());
      const counts = this.counts();
      this.onAnnounce(
        this.bodies.get(id)!.onPan
          ? `Placed: ${name}. ${plural(counts.pan, 'object', 'objects')} on your pan.`
          : `Placed: ${name}. ${counts.floor} on the floor.`,
      );
    }
    this.endCarry();
  }

  tap(id: number | undefined): void {
    if (this.carrying?.restore) {
      // tapped without dragging: set it back exactly where it was and select it
      this.selected = this.addBody(this.carrying.itemId, this.carrying.restore);
      this.endCarry();
    } else if (id === undefined) {
      this.selected = undefined;
    }
  }

  rotate(radians: number): void {
    if (this.phase !== 'placing') return;
    if (this.ghost.active) {
      this.ghost.rotate(radians);
      return;
    }
    const id = this.selected;
    const body = id === undefined ? undefined : this.bodies.get(id);
    const mesh = id === undefined ? undefined : this.meshes.get(id);
    if (id === undefined || !body || !mesh) return;
    // lift it a touch, turn it and set it back down in the same place
    const quat = this.q.setFromAxisAngle(UP, radians).multiply(mesh.quaternion);
    const pos = mesh.position;
    this.removeBody(id);
    this.selected = this.addBody(body.itemId, { pos: [pos.x, pos.y + 0.01, pos.z], quat: quat.toArray() as Quat });
  }

  private endCarry(): void {
    this.ghost.end();
    this.carrying = undefined;
    this.putBack = false;
    this.canvas.style.cursor = '';
  }

  private readonly hover = (e: PointerEvent): void => {
    if (e.pointerType !== 'mouse' || this.carrying || e.buttons !== 0) return;
    this.canvas.style.cursor = this.bodyAt(e.clientX, e.clientY) === undefined ? '' : 'grab';
  };

  /** Clears the player's pan. Fallen objects stay until they're returned. */
  reset(): void {
    if (this.phase !== 'placing') return;
    const onPan = [...this.bodies].filter(([, b]) => b.onPan);
    if (onPan.length === 0) return;
    for (const [id] of onPan) this.removeBody(id);
    this.onAnnounce('Pan cleared.');
  }

  returnAll(): void {
    if (this.phase !== 'placing') return;
    const fallen = [...this.bodies].filter(([, b]) => !b.onPan);
    if (fallen.length === 0) return;
    for (const [id] of fallen) this.removeBody(id);
    this.onAnnounce(`Returned ${plural(fallen.length, 'thing', 'things')}.`);
  }

  /**
   * Judges what's on the pan, clears the floor, unlocks the beam and lets it show the result.
   * The verdict is settled here: the beam is scripted from it, so nothing that slides during
   * the reveal can change it.
   */
  lockIn(): void {
    this.endIntro();
    if (!this.ready || this.phase !== 'placing' || this.carrying) return;
    this.calm = reducedMotion();
    const bodies = [...this.bodies].map(([id, b]) => ({ id, kg: this.kind(b.itemId).item.kg, onPan: b.onPan }));
    this.result = judge(bodies, this.round.prompt.kg, this.limits.margin);
    const win = this.result.verdict === 'balanced';
    this.motion = win
      ? this.calm
        ? { kind: 'locked' }
        : WOBBLE
      : this.calm
        ? { kind: 'tip', direction: this.result.ratio > 1 ? 1 : -1, duration: 0.3 }
        : tipFor(this.result.ratio);
    this.fading = bodies.filter((b) => !b.onPan).map((b) => b.id);
    this.selected = undefined;
    this.beamStarted = false;
    this.setPhase('locking');
    this.setView('overview');
  }

  /**
   * Clears both pans and eases the beam back to level before relocking it. Snapping it level
   * in one step would yank the pans and fling anything on them.
   */
  nextRound(): void {
    if (this.phase !== 'result' || this.index + 1 >= this.rounds.count) return;
    this.calm = reducedMotion();
    for (const id of [...this.bodies.keys()]) this.removeBody(id);
    this.physics.remove(this.promptId);
    this.meshes.remove(this.promptId);
    const q = this.scale.beam.quaternion;
    this.physics.beam({ kind: 'level', from: -2 * Math.atan2(q.z, q.w), duration: LEVEL_SECONDS[this.calm ? 1 : 0] });
    this.result = undefined;
    this.setPhase('clearing');
  }

  private setPhase(phase: Phase): void {
    this.phase = phase;
    this.phaseTime = 0;
  }

  private advanceReveal(dt: number): void {
    this.phaseTime += dt;
    const i = this.calm ? 1 : 0;
    if (this.phase === 'locking') {
      const shrink = Math.max(0.001, 1 - this.phaseTime / FADE_SECONDS);
      for (const id of this.fading) this.meshes.get(id)?.scale.setScalar(shrink);
      if (this.phaseTime >= FADE_SECONDS && this.fading.length) {
        for (const id of this.fading) this.removeBody(id);
        this.fading = [];
      }
      if (this.phaseTime >= LOCK_AT[i]) {
        const masses: [number, number][] = [[this.promptId, this.round.prompt.kg]];
        for (const [id, b] of this.bodies) masses.push([id, this.kind(b.itemId).item.kg]);
        this.physics.lock(masses);
        this.pinTarget = 1;
        this.setPhase('revealing');
      }
    } else if (this.phase === 'revealing') {
      if (!this.beamStarted && this.phaseTime >= PIN_SECONDS[i]) {
        this.physics.beam(this.motion);
        this.beamStarted = true;
      }
      if (this.phaseTime >= PIN_SECONDS[i] + RESULT_DELAY[i]) {
        this.setPhase('result');
        this.onAnnounce(spokenResult(this.result!));
        this.onResult(this.index, this.result!);
        this.prepareNext();
      }
    } else if (this.phase === 'clearing' && this.phaseTime >= LEVEL_SECONDS[i] + 0.1) {
      this.physics.unlock();
      this.pinTarget = 0;
      void this.open(this.index + 1);
    } else if (this.phase === 'intro') {
      this.introTime += dt;
      const t = Math.min(1, this.introTime / INTRO_SECONDS);
      const mesh = this.meshes.get(this.promptId);
      if (mesh && this.promptRest) mesh.position.y = this.promptRest.pos[1] + INTRO_DROP * (1 - t) ** 3;
      if (t >= 1) this.endIntro();
    }
    this.pinOut += (this.pinTarget - this.pinOut) * Math.min(1, dt * (this.calm ? 40 : 14));
    this.scale.pin.position.z = 0.07 + this.pinOut * PIN_TRAVEL;
  }

  /** Loads the next round's objects and draws their tile pictures while this result is on screen. */
  private prepareNext(): void {
    const index = this.index + 1;
    if (index >= this.rounds.count) return;
    void this.prepare(index)
      .then(({ kinds }) => this.renderThumbnails(this.rounds.at(index), kinds))
      .catch(() => {});
  }

  private frame(dt: number): void {
    this.time += dt;
    this.advanceReveal(dt);
    this.physics.tick(dt);
    const snap = this.physics.latest;
    if (snap) {
      this.scale.sync(snap.poses);
      this.meshes.sync(snap);
      this.classify(snap);
      if (this.view === 'close') this.followPan();
    }
    this.ghost.update(dt);
    this.emitSelection();
    this.emitState();
  }

  private followPan(): void {
    const pan = this.scale.pans[1].position;
    this.panMoved.subVectors(pan, this.panAt);
    if (this.panMoved.lengthSq() < 1e-8) return;
    this.panAt.copy(pan);
    this.stage.translate(this.panMoved);
  }

  private classify({ ids, poses }: Snapshot): void {
    const panPos: Vec3 = [poses[POSE_STRIDE]!, poses[POSE_STRIDE + 1]!, poses[POSE_STRIDE + 2]!];
    const panQuat: Quat = [poses[POSE_STRIDE + 3]!, poses[POSE_STRIDE + 4]!, poses[POSE_STRIDE + 5]!, poses[POSE_STRIDE + 6]!];
    for (let i = 0; i < ids.length; i++) {
      // the snapshot can be a tick behind adds and removes
      const body = this.bodies.get(ids[i]!);
      if (!body) continue;
      const o = (RIG_ENTRIES + i) * POSE_STRIDE;
      const onPan = locate(panPos, panQuat, [poses[o]!, poses[o + 1]!, poses[o + 2]!]) === 'pan';
      if (onPan === body.onPan) {
        body.since = undefined;
      } else if (body.since === undefined) {
        body.since = this.time;
      } else if (this.time - body.since >= SETTLE_SECONDS) {
        body.onPan = onPan;
        body.since = undefined;
        if (!onPan && this.phase === 'placing') this.onAnnounce(`Fell off: ${this.kind(body.itemId).item.name}. ${this.counts().floor} on the floor.`);
      }
    }
  }

  private counts(): { pan: number; floor: number } {
    let pan = 0;
    for (const b of this.bodies.values()) if (b.onPan) pan++;
    return { pan, floor: this.bodies.size - pan };
  }

  private emitSelection(): void {
    const mesh = this.selected === undefined ? undefined : this.meshes.get(this.selected);
    let selection: Selection | null = null;
    this.selectionRing.visible = !!mesh;
    if (mesh) {
      const { min, max } = this.bounds.setFromObject(mesh);
      this.selectionRing.position.set(mesh.position.x, min.y + 0.003, mesh.position.z);
      this.selectionRing.scale.setScalar(Math.max(max.x - min.x, max.z - min.z) * 0.6 + 0.02);
      const r = this.canvas.getBoundingClientRect();
      const radius = mesh.geometry.boundingSphere?.radius ?? 0.1;
      this.v.copy(mesh.position).addScaledVector(UP, -radius).project(this.stage.camera);
      selection = { x: Math.round(r.left + ((this.v.x + 1) / 2) * r.width), y: Math.round(r.top + ((1 - this.v.y) / 2) * r.height) };
    } else {
      this.selected = undefined;
    }
    const key = selection ? `${selection.x},${selection.y}` : '';
    if (key === this.lastSelection) return;
    this.lastSelection = key;
    this.onSelection(selection);
  }

  private emitState(): void {
    const onPan: Record<string, number> = {};
    const floor = new Map<string, number>();
    let panCount = 0;
    for (const b of this.bodies.values()) {
      if (b.onPan) {
        onPan[b.itemId] = (onPan[b.itemId] ?? 0) + 1;
        panCount++;
      } else {
        floor.set(b.itemId, (floor.get(b.itemId) ?? 0) + 1);
      }
    }
    const state: PlacingState = {
      ready: this.ready,
      round: this.index,
      onPan,
      panCount,
      floor: this.round.inventory
        .filter((item) => floor.has(item.id))
        .map((item) => ({ itemId: item.id, name: item.name, count: floor.get(item.id)! })),
      full: this.bodies.size >= this.limits.maxBodies,
      carrying: this.carrying?.itemId,
      putBack: this.putBack,
      phase: this.phase,
      result: this.phase === 'result' ? this.result : undefined,
      missing: this.missing,
      opening: this.opening,
      failed: this.failed,
    };
    const key = JSON.stringify(state);
    if (key === this.lastState) return;
    this.lastState = key;
    this.onState(state);
  }

  dispose(): void {
    this.disposed = true;
    this.gestures.dispose();
    this.canvas.removeEventListener('pointermove', this.hover);
    removeEventListener('pointerdown', this.skipIntro, true);
    this.stage.dispose();
    this.physics.dispose();
    for (const url of this.thumbnails.values()) URL.revokeObjectURL(url);
    this.disposeKinds(this.kinds);
    void this.prepared?.loaded.then(({ kinds }) => this.disposeKinds(kinds)).catch(() => {});
  }
}
