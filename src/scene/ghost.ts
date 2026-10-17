import * as THREE from 'three';
import type { Quat, Vec3 } from '../physics/rig';

/** Clearance between the held object and whatever is under it, in physics units. */
const HOVER = 0.03;
const INK = '#1f1b17';
const UP = new THREE.Vector3(0, 1, 0);

export interface Pose {
  pos: Vec3;
  quat: Quat;
}

/**
 * The object being carried. It is not in the physics world, so it can't shove the stack
 * or tunnel through it; it joins the world where it hovers when it's let go.
 */
export class Ghost {
  readonly group = new THREE.Group();
  private mesh: THREE.Mesh | undefined;
  private material: THREE.Material | undefined;
  private readonly ring: THREE.Mesh;
  private readonly guide: THREE.Line;
  private readonly base = new THREE.Quaternion();
  private readonly target = new THREE.Vector3();
  private readonly surface = new THREE.Vector3();
  private readonly v = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private yaw = 0;
  private aimed = false;
  private snap = true;

  constructor() {
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.92, 1, 32),
      new THREE.MeshBasicMaterial({ color: INK, transparent: true, opacity: 0.55, depthWrite: false }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.guide = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.45 }),
    );
    this.group.add(this.ring, this.guide);
    this.group.visible = false;
  }

  get active(): boolean {
    return this.mesh !== undefined;
  }

  /** Turn about the vertical since it was picked up. */
  get heading(): number {
    return this.yaw;
  }

  /** Whether it's over something it could be set down on. */
  get aiming(): boolean {
    return this.aimed;
  }

  /** Starts carrying. With `from`, it waits there until the first `aim`. */
  begin(geometry: THREE.BufferGeometry, material: THREE.MeshStandardMaterial, from?: Pose): void {
    this.end();
    this.material = material.clone();
    this.material.transparent = true;
    this.material.opacity = 0.82;
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.castShadow = true;
    this.group.add(this.mesh);
    this.yaw = 0;
    this.snap = true;
    if (from) {
      this.base.fromArray(from.quat);
      this.mesh.position.fromArray(from.pos);
      this.mesh.quaternion.copy(this.base);
      this.ring.visible = this.guide.visible = false;
      // glide from where it sat rather than jumping to the pointer
      this.snap = false;
      this.aimed = true;
      this.group.visible = true;
    } else {
      this.base.identity();
      this.aimed = false;
      this.group.visible = false;
    }
  }

  rotate(radians: number): void {
    if (!this.mesh) return;
    this.yaw += radians;
    if (this.ring.visible) this.place(this.surface);
    else this.mesh.quaternion.copy(this.q.setFromAxisAngle(UP, this.yaw).multiply(this.base));
  }

  /** Hovers over this surface point, or hides when there's nothing to set it down on. */
  aim(point: THREE.Vector3 | undefined): void {
    if (!this.mesh) return;
    if (!point) {
      this.aimed = false;
      this.group.visible = false;
      this.snap = true;
      return;
    }
    this.aimed = true;
    this.group.visible = true;
    this.ring.visible = this.guide.visible = true;
    this.place(point);
  }

  private place(surface: THREE.Vector3): void {
    const mesh = this.mesh!;
    this.surface.copy(surface);
    mesh.quaternion.copy(this.q.setFromAxisAngle(UP, this.yaw).multiply(this.base));
    // lowest point and footprint of the hull as it's now turned
    const position = mesh.geometry.getAttribute('position');
    let bottom = Infinity;
    let reach = 0;
    for (let i = 0; i < position.count; i++) {
      this.v.fromBufferAttribute(position, i).applyQuaternion(mesh.quaternion);
      bottom = Math.min(bottom, this.v.y);
      reach = Math.max(reach, Math.hypot(this.v.x, this.v.z));
    }
    const { x, y, z } = this.surface;
    this.target.set(x, y - bottom + HOVER, z);
    if (this.snap) {
      mesh.position.copy(this.target);
      this.snap = false;
    }
    this.ring.position.set(x, y + 0.003, z);
    this.ring.scale.setScalar(Math.max(0.03, reach * 0.9));
    this.updateGuide();
  }

  private updateGuide(): void {
    const mesh = this.mesh!;
    const geometry = this.guide.geometry as THREE.BufferGeometry;
    const p = geometry.getAttribute('position') as THREE.BufferAttribute;
    p.setXYZ(0, this.ring.position.x, this.ring.position.y, this.ring.position.z);
    p.setXYZ(1, mesh.position.x, this.target.y - HOVER, mesh.position.z);
    p.needsUpdate = true;
    geometry.computeBoundingSphere();
  }

  /** Eases towards the aim point so the object glides rather than jumps between surfaces. */
  update(dt: number): void {
    if (!this.mesh || !this.aimed || !this.ring.visible) return;
    this.mesh.position.lerp(this.target, 1 - Math.exp(-dt * 30));
    this.updateGuide();
  }

  /** Where it will enter the physics world: the final hover point, not the eased one. */
  pose(): Pose {
    const mesh = this.mesh!;
    const pos = this.ring.visible ? this.target : mesh.position;
    return { pos: [pos.x, pos.y, pos.z], quat: [mesh.quaternion.x, mesh.quaternion.y, mesh.quaternion.z, mesh.quaternion.w] };
  }

  end(): void {
    if (this.mesh) this.group.remove(this.mesh);
    this.material?.dispose();
    this.mesh = undefined;
    this.material = undefined;
    this.aimed = false;
    this.group.visible = false;
  }
}
