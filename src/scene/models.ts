// Object models, all in one form: geometry coloured per face from the shared palette and squeezed
// into a unit cube centred on the origin, plus convex hulls in the same cube. The game stretches
// both to the object's real length, height and width.
//
// Model files come from tools/models/build-models.ts, and this reads exactly what it writes: one
// meshopt-compressed primitive with the hulls in the scene's extras. Three's glTF loader would
// handle any file, but it's far bigger than this.

import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { counting } from '../data/download';
import { unitPoints, type ShapeKind } from '../game/shapes';

export interface Model {
  geometry: THREE.BufferGeometry;
  /** One for most things; up to four for concave ones like chairs. */
  hulls: Float32Array[];
}

/** One material for every object; the colours are in the vertices. */
export const MATERIAL = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, flatShading: true });

const URLS = import.meta.glob<string>('../assets/models/*.glb', { query: '?url', import: 'default', eager: true });
/** Tries after the first, before a model counts as failed. */
const RETRIES = 2;
const RETRY_MS = 400;

const files = new Map<string, Promise<Model>>();
const shapes = new Map<string, Model>();

/** `onBytes` counts the download, if this call starts one. */
export function loadModel(file: string, onBytes?: (n: number) => void): Promise<Model> {
  let model = files.get(file);
  if (!model) {
    model = download(file, onBytes).then(parse);
    // not remembered, so asking again tries again
    model.catch(() => files.delete(file));
    files.set(file, model);
  }
  return model;
}

/** A simple object built from its shape, in one palette colour. */
export function shapeModel(shape: ShapeKind, color: string): Model {
  const key = `${shape} ${color}`;
  let model = shapes.get(key);
  if (!model) {
    const points = unitPoints(shape);
    const v: THREE.Vector3[] = [];
    for (let i = 0; i < points.length; i += 3) v.push(new THREE.Vector3(points[i], points[i + 1], points[i + 2]));
    const geometry = new ConvexGeometry(v);
    const { r, g, b } = new THREE.Color(color);
    const colors = new Float32Array(geometry.attributes.position!.count * 3);
    for (let i = 0; i < colors.length; i += 3) colors.set([r, g, b], i);
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    model = { geometry, hulls: [Float32Array.from(points)] };
    shapes.set(key, model);
  }
  return model;
}

async function download(file: string, onBytes?: (n: number) => void): Promise<ArrayBuffer> {
  const url = URLS[`../assets/models/${file}.glb`];
  if (!url) throw new Error(`No model called ${file}`);
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${file}: ${response.status}`);
      return await (onBytes ? counting(response, onBytes) : response).arrayBuffer();
    } catch (error) {
      if (attempt >= RETRIES) throw error;
      await new Promise((resolve) => setTimeout(resolve, RETRY_MS * (attempt + 1)));
    }
  }
}

interface Gltf {
  accessors: { bufferView: number; byteOffset?: number; componentType: number; count: number }[];
  bufferViews: { extensions: { EXT_meshopt_compression: { byteOffset?: number; byteLength: number; byteStride: number; count: number; mode: string; filter?: string } } }[];
  meshes: { primitives: { attributes: { POSITION: number; COLOR_0: number }; indices: number }[] }[];
  nodes: { scale?: number[] }[];
  scenes: { extras: { hulls: number[][] } }[];
}

const UNSIGNED_SHORT = 5123;

async function parse(glb: ArrayBuffer): Promise<Model> {
  const data = new DataView(glb);
  // 'glTF', then two chunks: JSON, then the binary
  if (data.getUint32(0, true) !== 0x46546c67) throw new Error('Not a model file');
  const jsonLength = data.getUint32(12, true);
  const gltf = JSON.parse(new TextDecoder().decode(new Uint8Array(glb, 20, jsonLength))) as Gltf;
  const bin = new Uint8Array(glb, 28 + jsonLength, data.getUint32(20 + jsonLength, true));

  await MeshoptDecoder.ready;
  const views = gltf.bufferViews.map(({ extensions: { EXT_meshopt_compression: m } }) => {
    const out = new Uint8Array(m.count * m.byteStride);
    const start = m.byteOffset ?? 0;
    MeshoptDecoder.decodeGltfBuffer(out, m.count, m.byteStride, bin.subarray(start, start + m.byteLength), m.mode, m.filter ?? 'NONE');
    return { bytes: out, stride: m.byteStride };
  });
  const viewOf = (accessor: number) => {
    const a = gltf.accessors[accessor]!;
    return { ...views[a.bufferView]!, offset: a.byteOffset ?? 0, count: a.count, componentType: a.componentType };
  };

  const primitive = gltf.meshes[0]!.primitives[0]!;
  const scale = gltf.nodes[0]!.scale?.[0] ?? 1;

  // normalised int16, so ±32767 is ±1 before the node's scale
  const p = viewOf(primitive.attributes.POSITION);
  const pv = new DataView(p.bytes.buffer);
  const positions = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    for (let k = 0; k < 3; k++) positions[i * 3 + k] = Math.max(-1, pv.getInt16(p.offset + i * p.stride + k * 2, true) / 32767) * scale;
  }

  // normalised uint8 RGBA, linear; the alpha is always opaque
  const c = viewOf(primitive.attributes.COLOR_0);
  const colors = new Float32Array(c.count * 3);
  for (let i = 0; i < c.count; i++) for (let k = 0; k < 3; k++) colors[i * 3 + k] = c.bytes[c.offset + i * c.stride + k]! / 255;

  const ix = viewOf(primitive.indices);
  const indices = ix.componentType === UNSIGNED_SHORT ? new Uint16Array(ix.bytes.buffer, ix.offset, ix.count) : new Uint32Array(ix.bytes.buffer, ix.offset, ix.count);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  return { geometry, hulls: gltf.scenes[0]!.extras.hulls.map((h) => Float32Array.from(h)) };
}
