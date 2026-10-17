import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { POSE_STRIDE, RIG_ENTRIES, type Snapshot } from '../physics/protocol';

export function hullGeometry(points: Float32Array): THREE.BufferGeometry {
  const v: THREE.Vector3[] = [];
  for (let i = 0; i < points.length; i += 3) v.push(new THREE.Vector3(points[i], points[i + 1], points[i + 2]));
  return new ConvexGeometry(v);
}

/** Render meshes for physics bodies, keyed by body id. */
export class BodyMeshes {
  readonly group = new THREE.Group();
  private readonly meshes = new Map<number, THREE.Mesh>();

  add(id: number, geometry: THREE.BufferGeometry, material: THREE.Material): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.visible = false; // shown once the first pose arrives
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

  get size(): number {
    return this.meshes.size;
  }
}
