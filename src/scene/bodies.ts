import * as THREE from 'three';
import { POSE_STRIDE, RIG_ENTRIES, type Snapshot } from '../physics/protocol';
import type { Pose } from './ghost';

/** Render meshes for physics bodies, keyed by body id. Geometry and materials are shared, so they're never disposed here. */
export class BodyMeshes {
  readonly group = new THREE.Group();
  private readonly meshes = new Map<number, THREE.Mesh>();

  /** Without a pose it stays hidden until the first snapshot places it. */
  add(id: number, geometry: THREE.BufferGeometry, material: THREE.Material, pose?: Pose): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.bodyId = id;
    if (pose) {
      mesh.position.fromArray(pose.pos);
      mesh.quaternion.fromArray(pose.quat);
    } else {
      mesh.visible = false;
    }
    this.meshes.set(id, mesh);
    this.group.add(mesh);
    return mesh;
  }

  remove(id: number): void {
    const mesh = this.meshes.get(id);
    if (!mesh) return;
    this.group.remove(mesh);
    this.meshes.delete(id);
  }

  clear(): void {
    for (const id of [...this.meshes.keys()]) this.remove(id);
  }

  sync({ ids, poses }: Snapshot): void {
    for (let i = 0; i < ids.length; i++) {
      const mesh = this.meshes.get(ids[i]!);
      if (!mesh) continue;
      const o = (RIG_ENTRIES + i) * POSE_STRIDE;
      mesh.position.set(poses[o]!, poses[o + 1]!, poses[o + 2]!);
      mesh.quaternion.set(poses[o + 3]!, poses[o + 4]!, poses[o + 5]!, poses[o + 6]!);
      mesh.visible = true;
    }
  }

  get(id: number): THREE.Mesh | undefined {
    return this.meshes.get(id);
  }

  get size(): number {
    return this.meshes.size;
  }
}
