import * as THREE from 'three';
import { CONFIG } from '../game/config';
import type { Item, Round } from '../game/practice';
import { PhysicsClient } from '../physics/client';
import { POSE_STRIDE, RIG_ENTRIES, type Snapshot } from '../physics/protocol';
import { locate, panRestY, RIG, type Quat, type Vec3 } from '../physics/rig';
import { BodyMeshes, hullGeometry } from '../scene/bodies';
import { Ghost, type Pose } from '../scene/ghost';
import { Gestures, type Aim, type CarrySource, type GestureTarget } from '../scene/gestures';
import { ScaleModel } from '../scene/scale';
import { Stage } from '../scene/stage';
import { renderThumbnails } from '../scene/thumbnails';

/** On touch the object is aimed this far above the finger, so the finger doesn't hide it. */
const TOUCH_LIFT = 48;
/** A body has to stay on (or off) the pan this long before it counts, so one sliding past the rim doesn't flicker. */
const SETTLE_SECONDS = 0.3;
const UP = new THREE.Vector3(0, 1, 0);
const INK = '#1f1b17';

export interface FloorGroup {
  itemId: string;
  name: string;
  count: number;
}

export interface PlacingState {
  ready: boolean;
  onPan: Record<string, number>;
  panCount: number;
  floor: FloorGroup[];
  full: boolean;
  carrying: string | undefined;
  putBack: boolean;
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
  geometry: THREE.BufferGeometry;
  material: THREE.MeshStandardMaterial;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export class Game implements GestureTarget {
  onState: (state: PlacingState) => void = () => {};
  onAnnounce: (message: string) => void = () => {};
  onSelection: (selection: Selection | null) => void = () => {};
  onThumbnails: (urls: Map<string, string>) => void = () => {};
  onError: (message: string) => void = () => {};

  readonly canvas: HTMLCanvasElement;
  private readonly stage: Stage;
  private readonly scale = new ScaleModel();
  private readonly meshes = new BodyMeshes();
  private readonly physics = new PhysicsClient();
  private readonly ghost = new Ghost();
  private readonly gestures: Gestures;
  private readonly kinds = new Map<string, Kind>();
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
  private thumbnails = new Map<string, string>();
  private nextId = 1;
  private time = 0;
  private ready = false;
  private carrying: { itemId: string; restore?: Pose } | undefined;
  private putBack = false;
  private selected: number | undefined;
  private lastSelection = '';
  private lastState = '';
  private disposed = false;

  constructor(
    host: HTMLElement,
    private readonly sheet: () => HTMLElement | undefined,
    private readonly round: Round,
  ) {
    const lowEnd = (navigator.hardwareConcurrency ?? 8) <= 4;
    this.stage = new Stage(host, { shadowMapSize: lowEnd ? 1024 : 2048, maxPixelRatio: lowEnd ? 1.5 : 2 });
    this.selectionRing.visible = false;
    this.selectionRing.renderOrder = 1;
    this.stage.scene.add(this.scale.group, this.meshes.group, this.ghost.group, this.selectionRing);
    this.stage.setFraming([this.scale.group]);
    this.canvas = this.stage.renderer.domElement;
    this.physics.onError = (m) => this.onError(m);

    for (const item of [round.prompt, ...round.inventory]) {
      this.kinds.set(item.id, {
        item,
        geometry: hullGeometry(item.points),
        material: new THREE.MeshStandardMaterial({ color: item.color, roughness: 0.8, flatShading: true }),
      });
    }
    this.gestures = new Gestures(this);
    this.canvas.addEventListener('pointermove', this.hover);
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
              carrying: this.ghost.active,
              placed: this.bodies.size,
              ...this.counts(),
              azimuth: controls.azimuthAngle,
              polar: controls.polarAngle,
              distance: controls.distance,
              heading: this.ghost.heading,
              selected: this.selected,
              selectedYaw: selected ? yawOf(selected.quaternion) : undefined,
              positions: [...this.bodies.keys()].map((id) => this.meshes.get(id)!.position.toArray()),
            };
          },
          project: (x: number, y: number, z: number) => {
            const r = this.canvas.getBoundingClientRect();
            const v = new THREE.Vector3(x, y, z).project(this.stage.camera);
            return [r.left + ((v.x + 1) / 2) * r.width, r.top + ((1 - v.y) / 2) * r.height];
          },
          spawn: (n: number, itemId = this.round.inventory[0]!.id) => {
            for (let i = 0; i < n && this.bodies.size < CONFIG.maxDynamicBodies; i++) {
              const a = i * 2.4;
              const r = 0.12 + (i % 3) * 0.1;
              this.addBody(itemId, { pos: [RIG.armLength + Math.cos(a) * r, panRestY() + 0.15 + i * 0.06, Math.sin(a) * r], quat: [0, 0, 0, 1] });
            }
          },
        },
      });
    }
  }

  async start(): Promise<void> {
    this.stage.start((dt) => this.frame(dt));
    void renderThumbnails(this.round.inventory.map((item) => ({ id: item.id, ...this.kind(item.id) })))
      .then((urls) => {
        if (this.disposed) return urls.forEach((url) => URL.revokeObjectURL(url));
        this.thumbnails = urls;
        this.onThumbnails(urls);
      })
      // the tiles fall back to flat colour swatches
      .catch(() => {});
    await this.physics.init({ unitsPerMetre: this.round.unitsPerMetre });
    const prompt = this.kind(this.round.prompt.id);
    const pose: Pose = { pos: [-RIG.armLength, panRestY() + 0.25, 0], quat: [0, 0, 0, 1] };
    const id = this.nextId++;
    this.meshes.add(id, prompt.geometry, prompt.material, pose);
    this.physics.add({ id, points: this.round.prompt.points, ...pose });
    this.ready = true;
  }

  private kind(itemId: string): Kind {
    return this.kinds.get(itemId)!;
  }

  private addBody(itemId: string, pose: Pose): number {
    const kind = this.kind(itemId);
    const id = this.nextId++;
    this.meshes.add(id, kind.geometry, kind.material, pose);
    this.physics.add({ id, points: kind.item.points, ...pose });
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
    if (!this.ready || this.ghost.active) return false;
    let itemId: string;
    let restore: Pose | undefined;
    if (source.kind === 'item') {
      if (this.bodies.size >= CONFIG.maxDynamicBodies) return false;
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
    const onPan = [...this.bodies].filter(([, b]) => b.onPan);
    if (onPan.length === 0) return;
    for (const [id] of onPan) this.removeBody(id);
    this.onAnnounce('Pan cleared.');
  }

  returnAll(): void {
    const fallen = [...this.bodies].filter(([, b]) => !b.onPan);
    if (fallen.length === 0) return;
    for (const [id] of fallen) this.removeBody(id);
    this.onAnnounce(`Returned ${plural(fallen.length, 'thing', 'things')}.`);
  }

  private frame(dt: number): void {
    this.time += dt;
    this.physics.tick(dt);
    const snap = this.physics.latest;
    if (snap) {
      this.scale.sync(snap.poses);
      this.meshes.sync(snap);
      this.classify(snap);
    }
    this.ghost.update(dt);
    this.emitSelection();
    this.emitState();
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
        if (!onPan) this.onAnnounce(`Fell off: ${this.kind(body.itemId).item.name}. ${this.counts().floor} on the floor.`);
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
      onPan,
      panCount,
      floor: this.round.inventory
        .filter((item) => floor.has(item.id))
        .map((item) => ({ itemId: item.id, name: item.name, count: floor.get(item.id)! })),
      full: this.bodies.size >= CONFIG.maxDynamicBodies,
      carrying: this.carrying?.itemId,
      putBack: this.putBack,
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
    this.stage.dispose();
    this.physics.dispose();
    for (const url of this.thumbnails.values()) URL.revokeObjectURL(url);
    for (const { geometry, material } of this.kinds.values()) {
      geometry.dispose();
      material.dispose();
    }
  }
}
