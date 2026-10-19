import * as THREE from 'three';
import { padTopY, PAN_FLOOR_TOP, panRestY, RIG } from '../physics/rig';
import { POSE_STRIDE } from '../physics/protocol';

// Low-poly to match the objects: few facets, flat shading, matte colour, no reflections.
const matte = (color: string) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, flatShading: true });
const brass = matte('#c4963c');
const brassShade = matte('#9c742c');
const wood = matte('#4a3627');
const woodDark = matte('#33261d');

const CHAINS_PER_PAN = 3;
const CHAIN_HALF_WIDTH = 0.009;
const RIM_TOP = RIG.rimHalfHeight * 2;
const PAN_SIDES = 12;

function shadowed<T extends THREE.Mesh>(mesh: T): T {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** An n-sided prism whose flat faces, not its corners, sit at `apothem`, so it never looks smaller than its collider. */
function facetedCylinder(apothemTop: number, apothemBottom: number, height: number, sides: number): THREE.CylinderGeometry {
  const k = 1 / Math.cos(Math.PI / sides);
  return new THREE.CylinderGeometry(apothemTop * k, apothemBottom * k, height, sides);
}

/** A faceted dish whose inner floor sits exactly on the collision floor. */
function panGeometry(): THREE.LatheGeometry {
  const R = RIG.panRadius;
  const k = 1 / Math.cos(Math.PI / PAN_SIDES);
  const bottom = PAN_FLOOR_TOP - 2 * RIG.panFloorHalf;
  const profile: [number, number][] = [
    [0, bottom],
    [R * 0.8, bottom],
    [R + 0.03, RIM_TOP + 0.012],
    [R - 0.012, RIM_TOP + 0.012],
    [R - 0.06, PAN_FLOOR_TOP],
    [0, PAN_FLOOR_TOP],
  ];
  return new THREE.LatheGeometry(
    profile.map(([x, y]) => new THREE.Vector2(x * k, y)),
    PAN_SIDES,
  );
}

/** Deepest at the fulcrum and tapering to the tips, in straight facets. */
function beamGeometry(): THREE.ExtrudeGeometry {
  const L = RIG.beamHalf[0];
  const shape = new THREE.Shape();
  shape.moveTo(-L, -0.022);
  shape.lineTo(0, -0.06);
  shape.lineTo(L, -0.022);
  shape.lineTo(L, 0.026);
  shape.lineTo(0, 0.05);
  shape.lineTo(-L, 0.026);
  shape.closePath();
  const depth = 0.06;
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  g.translate(0, 0, -depth / 2);
  return g;
}

function staticParts(): THREE.Group {
  const g = new THREE.Group();
  const plinthH = RIG.plinthHalf[1] * 2;
  const plinth = shadowed(new THREE.Mesh(new THREE.BoxGeometry(RIG.plinthHalf[0] * 2, plinthH * 0.6, RIG.plinthHalf[2] * 2), wood));
  plinth.position.y = plinthH * 0.7;
  const foot = shadowed(new THREE.Mesh(new THREE.BoxGeometry(RIG.plinthHalf[0] * 2 + 0.06, plinthH * 0.4, RIG.plinthHalf[2] * 2 + 0.06), woodDark));
  foot.position.y = plinthH * 0.2;
  g.add(plinth, foot);

  const padTop = padTopY();
  for (const x of [-RIG.armLength, RIG.armLength]) {
    const h = padTop - plinthH - 0.04;
    const post = shadowed(new THREE.Mesh(facetedCylinder(0.06, 0.1, h, 6), wood));
    post.position.set(x, plinthH + h / 2, 0);
    const cap = shadowed(new THREE.Mesh(facetedCylinder(RIG.padHalfWidth, RIG.padHalfWidth * 0.8, 0.04, 8), brass));
    cap.position.set(x, padTop - 0.02, 0);
    g.add(post, cap);
  }

  const columnTop = RIG.pivot[1] - 0.06;
  const column = shadowed(new THREE.Mesh(facetedCylinder(0.04, 0.055, columnTop - plinthH, 6), brass));
  column.position.y = plinthH + (columnTop - plinthH) / 2;
  const collar = shadowed(new THREE.Mesh(facetedCylinder(0.1, 0.13, 0.08, 6), brassShade));
  collar.position.y = plinthH + 0.04;
  const fork = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.13), brass));
  fork.position.set(0, RIG.pivot[1] - 0.02, 0);
  const finial = shadowed(new THREE.Mesh(new THREE.IcosahedronGeometry(0.05, 0), brass));
  finial.position.y = RIG.pivot[1] + 0.11;

  // index plate the pointer reads against
  const plateY = RIG.pivot[1] - 0.42;
  const plate = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.02, 5, 1, false, Math.PI * 0.75, Math.PI * 0.5), woodDark));
  plate.rotation.x = Math.PI / 2;
  plate.position.set(0, plateY + 0.1, 0.06);
  const tick = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.04, 0.012), brass);
  tick.position.set(0, plateY + 0.245, 0.072);
  g.add(column, collar, fork, finial, plate, tick);
  return g;
}

export class ScaleModel {
  readonly group = new THREE.Group();
  /** Plinth, pads and column: everything that never moves. */
  readonly base = staticParts();
  readonly beam = new THREE.Group();
  readonly pans: [THREE.Group, THREE.Group] = [new THREE.Group(), new THREE.Group()];
  /** Slides out along +Z when the beam is released. */
  readonly pin: THREE.Mesh;
  private readonly chains: THREE.InstancedMesh;
  private readonly m = new THREE.Matrix4();
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();

  constructor() {
    this.group.add(this.base);

    const beamBody = shadowed(new THREE.Mesh(beamGeometry(), brass));
    const pointer = shadowed(new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.36, 4), brass));
    pointer.rotation.z = Math.PI;
    pointer.position.set(0, -0.22, 0.06);
    const hub = shadowed(new THREE.Mesh(facetedCylinder(0.04, 0.04, 0.16, 6), brassShade));
    hub.rotation.x = Math.PI / 2;
    this.beam.add(beamBody, pointer, hub);
    for (const x of [-RIG.armLength, RIG.armLength]) {
      const hook = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.075), brassShade));
      hook.position.set(x, 0, 0);
      this.beam.add(hook);
    }
    // level on its pivot until the first physics pose arrives, so the scale is whole from the first frame
    this.beam.position.set(...RIG.pivot);
    this.group.add(this.beam);

    this.pin = shadowed(new THREE.Mesh(facetedCylinder(0.012, 0.012, 0.18, 6), brassShade));
    this.pin.rotation.x = Math.PI / 2;
    this.pin.position.set(0, RIG.pivot[1] - 0.22, 0.07);
    const pinHead = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.008, 4, 6), brassShade);
    pinHead.position.y = 0.09;
    pinHead.rotation.x = Math.PI / 2;
    this.pin.add(pinHead);
    this.group.add(this.pin);

    const dish = panGeometry();
    this.pans.forEach((pan, side) => {
      pan.position.set(side === 0 ? -RIG.armLength : RIG.armLength, panRestY(), 0);
      pan.add(shadowed(new THREE.Mesh(dish, brass)));
      this.group.add(pan);
    });

    const link = new THREE.BoxGeometry(CHAIN_HALF_WIDTH * 2, 1, CHAIN_HALF_WIDTH * 2);
    link.translate(0, 0.5, 0);
    this.chains = new THREE.InstancedMesh(link, brassShade, CHAINS_PER_PAN * 2);
    this.chains.castShadow = true;
    this.chains.frustumCulled = false;
    this.group.add(this.chains);
    this.updateChains();
  }

  /** What a carried object can be set down on. Not the beam or chains: nothing should be parked up there. */
  get surfaces(): THREE.Object3D[] {
    return [...this.pans, this.base];
  }

  /** Applies the rig entries (left pan, right pan, beam) of a pose snapshot. */
  sync(poses: Float32Array): void {
    const apply = (o: THREE.Object3D, entry: number) => {
      const i = entry * POSE_STRIDE;
      o.position.set(poses[i]!, poses[i + 1]!, poses[i + 2]!);
      o.quaternion.set(poses[i + 3]!, poses[i + 4]!, poses[i + 5]!, poses[i + 6]!);
    };
    apply(this.pans[0], 0);
    apply(this.pans[1], 1);
    apply(this.beam, 2);
    this.updateChains();
  }

  private updateChains(): void {
    this.beam.updateMatrixWorld();
    let n = 0;
    this.pans.forEach((pan, side) => {
      pan.updateMatrixWorld();
      this.a.set(side === 0 ? -RIG.armLength : RIG.armLength, -0.02, 0).applyMatrix4(this.beam.matrixWorld);
      for (let c = 0; c < CHAINS_PER_PAN; c++) {
        const angle = (c / CHAINS_PER_PAN) * Math.PI * 2 + Math.PI / 2;
        const r = RIG.panRadius + 0.01;
        this.b.set(Math.cos(angle) * r, RIM_TOP, Math.sin(angle) * r).applyMatrix4(pan.matrixWorld);
        const length = this.b.distanceTo(this.a);
        this.q.setFromUnitVectors(this.up, this.dir.subVectors(this.a, this.b).normalize());
        this.m.compose(this.b, this.q, this.s.set(1, length, 1));
        this.chains.setMatrixAt(n++, this.m);
      }
    });
    this.chains.instanceMatrix.needsUpdate = true;
  }
}
