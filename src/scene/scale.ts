import * as THREE from 'three';
import { padTopY, PAN_FLOOR_TOP, panRestY, RIG } from '../physics/rig';
import { POSE_STRIDE } from '../physics/protocol';

const brass = new THREE.MeshStandardMaterial({ color: '#b8892f', metalness: 1, roughness: 0.32 });
const brassDull = new THREE.MeshStandardMaterial({ color: '#a27a2c', metalness: 1, roughness: 0.5 });
const ebony = new THREE.MeshStandardMaterial({ color: '#2a211b', metalness: 0, roughness: 0.42 });

const CHAINS_PER_PAN = 3;
const CHAIN_RADIUS = 0.006;
const RIM_TOP = RIG.rimHalfHeight * 2;

function shadowed<T extends THREE.Mesh>(mesh: T): T {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** A shallow spun-brass dish whose inner floor sits exactly on the collision floor. */
function panGeometry(): THREE.LatheGeometry {
  const R = RIG.panRadius;
  const bottom = PAN_FLOOR_TOP - 2 * RIG.panFloorHalf;
  const profile = [
    [0, bottom],
    [R * 0.82, bottom],
    [R + 0.004, bottom + 0.035],
    [R + 0.016, RIM_TOP],
    [R + 0.02, RIM_TOP + 0.006],
    [R - 0.004, RIM_TOP + 0.004],
    [R - 0.016, PAN_FLOOR_TOP + 0.02],
    [R - 0.06, PAN_FLOOR_TOP],
    [0, PAN_FLOOR_TOP],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  return new THREE.LatheGeometry(profile, 64);
}

/** Thick at the fulcrum, tapering to the tips, like a cast balance beam. */
function beamGeometry(): THREE.ExtrudeGeometry {
  const L = RIG.beamHalf[0];
  const shape = new THREE.Shape();
  shape.moveTo(-L, -0.016);
  shape.quadraticCurveTo(-L * 0.4, -0.03, 0, -0.05);
  shape.quadraticCurveTo(L * 0.4, -0.03, L, -0.016);
  shape.lineTo(L, 0.016);
  shape.quadraticCurveTo(L * 0.4, 0.024, 0, 0.04);
  shape.quadraticCurveTo(-L * 0.4, 0.024, -L, 0.016);
  shape.closePath();
  const depth = 0.036;
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 2, curveSegments: 16 });
  g.translate(0, 0, -depth / 2);
  return g;
}

function staticParts(): THREE.Group {
  const g = new THREE.Group();
  const plinthH = RIG.plinthHalf[1] * 2;
  const plinth = shadowed(new THREE.Mesh(new THREE.BoxGeometry(RIG.plinthHalf[0] * 2, plinthH, RIG.plinthHalf[2] * 2), ebony));
  plinth.position.y = plinthH / 2;
  const foot = shadowed(new THREE.Mesh(new THREE.BoxGeometry(RIG.plinthHalf[0] * 2 + 0.04, 0.012, RIG.plinthHalf[2] * 2 + 0.04), brassDull));
  foot.position.y = 0.006;
  g.add(plinth, foot);

  const padTop = padTopY();
  for (const x of [-RIG.armLength, RIG.armLength]) {
    const h = padTop - plinthH - 0.02;
    const post = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, h, 32), ebony));
    post.position.set(x, plinthH + h / 2, 0);
    const cap = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(RIG.padHalfWidth, RIG.padHalfWidth * 0.9, 0.02, 48), brass));
    cap.position.set(x, padTop - 0.01, 0);
    g.add(post, cap);
  }

  const columnTop = RIG.pivot[1] - 0.06;
  const column = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.045, columnTop - plinthH, 32), brass));
  column.position.y = plinthH + (columnTop - plinthH) / 2;
  const collar = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.05, 32), brass));
  collar.position.y = plinthH + 0.025;
  // the fork that carries the knife edge
  const fork = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.11), brass));
  fork.position.set(0, RIG.pivot[1] - 0.02, 0);
  const finial = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.035, 24, 16), brass));
  finial.position.y = RIG.pivot[1] + 0.09;

  // index plate the pointer reads against
  const plateY = RIG.pivot[1] - 0.42;
  const plate = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.01, 48, 1, false, Math.PI * 0.75, Math.PI * 0.5), ebony));
  plate.rotation.x = Math.PI / 2;
  plate.position.set(0, plateY + 0.1, 0.05);
  const tick = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.03, 0.004), brass);
  tick.position.set(0, plateY + 0.235, 0.058);
  g.add(column, collar, fork, finial, plate, tick);
  return g;
}

export class ScaleModel {
  readonly group = new THREE.Group();
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
    this.group.add(staticParts());

    const beamBody = shadowed(new THREE.Mesh(beamGeometry(), brass));
    const pointer = shadowed(new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.36, 12), brass));
    pointer.rotation.z = Math.PI;
    pointer.position.set(0, -0.22, 0.05);
    const hub = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 24), brassDull));
    hub.rotation.x = Math.PI / 2;
    this.beam.add(beamBody, pointer, hub);
    for (const x of [-RIG.armLength, RIG.armLength]) {
      const hook = shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.005, 8, 20), brass));
      hook.position.set(x, -0.02, 0);
      this.beam.add(hook);
    }
    this.group.add(this.beam);

    this.pin = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.16, 12), brassDull));
    this.pin.rotation.x = Math.PI / 2;
    this.pin.position.set(0, RIG.pivot[1] - 0.22, 0.06);
    const pinHead = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.004, 8, 20), brassDull);
    pinHead.position.y = 0.08;
    pinHead.rotation.x = Math.PI / 2;
    this.pin.add(pinHead);
    this.group.add(this.pin);

    const dish = panGeometry();
    this.pans.forEach((pan, side) => {
      pan.position.set(side === 0 ? -RIG.armLength : RIG.armLength, panRestY(), 0);
      pan.add(shadowed(new THREE.Mesh(dish, brass)));
      this.group.add(pan);
    });

    const link = new THREE.CylinderGeometry(CHAIN_RADIUS, CHAIN_RADIUS, 1, 6, 1, true);
    link.translate(0, 0.5, 0);
    this.chains = new THREE.InstancedMesh(link, brassDull, CHAINS_PER_PAN * 2);
    this.chains.castShadow = true;
    this.chains.frustumCulled = false;
    this.group.add(this.chains);
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
