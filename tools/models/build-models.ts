// Turns downloaded models into the game's own. Each becomes one mesh coloured per face from the
// shared palette, squeezed into a unit cube centred on the origin (the game stretches it to the
// object's real size), with its collision hulls in the scene's extras, then meshopt-compressed.
//
//   node tools/models/build-models.ts <downloads> [model …]
//
// <downloads> holds the originals, which are never committed:
//   kenney/<kit>/<name>.glb, with the kit's Textures/ folder beside them
//   polypizza/<id>.glb, plus polypizza/SOURCES.json (title, creator, licence, page and date of each)
// The manifest is tools/models/sources.json. Output goes to src/assets/models/ and src/data/credits.json.

import fs from 'node:fs';
import path from 'node:path';
import { Document, NodeIO, type Material, type Node as GltfNode, type Primitive } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression, KHRMeshQuantization, type Transform } from '@gltf-transform/extensions';
import jpeg from 'jpeg-js';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import { PNG } from 'pngjs';
import { Matrix4, Vector3 } from 'three';
import { ConvexHull } from 'three/examples/jsm/math/ConvexHull.js';
import palette from '../../src/data/palette.json' with { type: 'json' };
import manifest from './sources.json' with { type: 'json' };

interface Source {
  kenney?: string;
  name?: string;
  polypizza?: string;
  /** Concave things collide as up to four hulls rather than one. */
  collider?: 'compound';
  /** Palette colour → palette colour, after snapping. */
  recolor?: Record<string, string>;
  /** Palette colours whose faces are removed, e.g. a stand that isn't part of the object. */
  drop?: string[];
  /** Degrees about x and about z, applied first: lays down something modelled standing up. */
  roll?: [number, number];
  /** Degrees about the vertical, applied before the longest side is turned along x. */
  turn?: number;
  maxTriangles?: number;
}

interface PolyPizzaSource {
  id: string;
  title: string;
  creator: string;
  licence: string;
  page: string;
  downloaded: string;
}

interface Credit {
  title: string;
  author: string;
  licence: string;
  licenceUrl: string;
  source: string;
  downloaded: string;
  changes: string;
}

const ROOT = path.resolve(import.meta.dirname, '../..');
const OUT = path.join(ROOT, 'src/assets/models');
const CREDITS = path.join(ROOT, 'src/data/credits.json');
const MAX_TRIANGLES = 1500;
const MAX_HULL_POINTS = 40;
const MAX_PART_POINTS = 24;
const MAX_PARTS = 4;
const CUTS = 16;
const KENNEY_DOWNLOADED = '2026-10-17';
const LICENCES: Record<string, string> = {
  'CC0 1.0': 'https://creativecommons.org/publicdomain/zero/1.0/',
  'CC-BY 3.0': 'https://creativecommons.org/licenses/by/3.0/',
};

// ---------- colour ----------

type Rgb = [number, number, number];

const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const hexToLinear = (hex: string): Rgb => [1, 3, 5].map((i) => srgbToLinear(parseInt(hex.slice(i, i + 2), 16) / 255)) as Rgb;

function oklab([r, g, b]: Rgb): Rgb {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}

const PALETTE = palette.map((hex) => ({ hex, lab: oklab(hexToLinear(hex)) }));

function snap(linear: Rgb): string {
  const lab = oklab(linear);
  let best = PALETTE[0]!;
  let bestDistance = Infinity;
  for (const p of PALETTE) {
    const d = (p.lab[0] - lab[0]) ** 2 + (p.lab[1] - lab[1]) ** 2 + (p.lab[2] - lab[2]) ** 2;
    if (d < bestDistance) [best, bestDistance] = [p, d];
  }
  return best.hex;
}

interface Pixels {
  width: number;
  height: number;
  data: Uint8Array;
}

const images = new Map<Uint8Array, Pixels>();

function decode(image: Uint8Array, mime: string): Pixels {
  let pixels = images.get(image);
  if (!pixels) {
    const buffer = Buffer.from(image);
    pixels = mime === 'image/jpeg' ? jpeg.decode(buffer, { useTArray: true }) : PNG.sync.read(buffer);
    images.set(image, pixels);
  }
  return pixels;
}

/** A material's colour at a UV, linear. glTF's UV origin is the image's top left. */
function sampler(material: Material | null): (u: number, v: number) => Rgb {
  const factor = (material?.getBaseColorFactor() ?? [1, 1, 1, 1]) as number[];
  const texture = material?.getBaseColorTexture();
  if (!texture) return () => [factor[0]!, factor[1]!, factor[2]!];
  const pixels = decode(texture.getImage()!, texture.getMimeType());
  const transform = material!.getBaseColorTextureInfo()?.getExtension<Transform>('KHR_texture_transform');
  const [ox, oy] = transform?.getOffset() ?? [0, 0];
  const [sx, sy] = transform?.getScale() ?? [1, 1];
  const rotation = transform?.getRotation() ?? 0;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return (u, v) => {
    const tu = cos * sx * u + sin * sy * v + ox;
    const tv = -sin * sx * u + cos * sy * v + oy;
    const x = Math.min(pixels.width - 1, Math.floor((tu - Math.floor(tu)) * pixels.width));
    const y = Math.min(pixels.height - 1, Math.floor((tv - Math.floor(tv)) * pixels.height));
    const i = (y * pixels.width + x) * 4;
    return [0, 1, 2].map((c) => srgbToLinear(pixels.data[i + c]! / 255) * factor[c]!) as Rgb;
  };
}

// ---------- reading ----------

interface Triangles {
  /** Three corners per triangle, world space. */
  positions: number[];
  /** One palette colour per triangle. */
  colors: string[];
}

function read(doc: Document): Triangles {
  const out: Triangles = { positions: [], colors: [] };
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0]!;
  const visit = (node: GltfNode) => {
    const mesh = node.getMesh();
    if (mesh) for (const primitive of mesh.listPrimitives()) readPrimitive(node, primitive, out);
    node.listChildren().forEach(visit);
  };
  scene.listChildren().forEach(visit);
  return out;
}

const worldMatrix = (node: GltfNode) => new Matrix4().fromArray(node.getWorldMatrix());

function readPrimitive(node: GltfNode, primitive: Primitive, out: Triangles): void {
  if (primitive.getMode() !== 4) return;
  const position = primitive.getAttribute('POSITION')!;
  const uv = primitive.getAttribute('TEXCOORD_0');
  const vertexColor = primitive.getAttribute('COLOR_0');
  const joints = primitive.getAttribute('JOINTS_0');
  const weights = primitive.getAttribute('WEIGHTS_0');
  const skin = node.getSkin();
  const colorAt = sampler(primitive.getMaterial());

  // A rigged model is posed by its joints; its rest pose is where they stand now.
  let place: (i: number, v: Vector3) => Vector3;
  if (skin && joints && weights) {
    const inverseBind = skin.getInverseBindMatrices()!;
    const jointMatrices = skin.listJoints().map((joint, j) => worldMatrix(joint).multiply(new Matrix4().fromArray(inverseBind.getElement(j, []))));
    const j4: number[] = [];
    const w4: number[] = [];
    const sum = new Vector3();
    const part = new Vector3();
    place = (i, v) => {
      joints.getElement(i, j4);
      weights.getElement(i, w4);
      sum.set(0, 0, 0);
      for (let k = 0; k < 4; k++) if (w4[k]) sum.addScaledVector(part.copy(v).applyMatrix4(jointMatrices[j4[k]!]!), w4[k]!);
      return v.copy(sum);
    };
  } else {
    const m = worldMatrix(node);
    place = (_, v) => v.applyMatrix4(m);
  }

  const indices = primitive.getIndices();
  const count = indices ? indices.getCount() : position.getCount();
  const p: number[] = [];
  const t: number[] = [];
  const c: number[] = [];
  const v = new Vector3();
  for (let f = 0; f + 2 < count; f += 3) {
    const rgb: Rgb = [0, 0, 0];
    for (let k = 0; k < 3; k++) {
      const i = indices ? indices.getScalar(f + k) : f + k;
      place(i, v.fromArray(position.getElement(i, p)));
      out.positions.push(v.x, v.y, v.z);
      const [u, w] = uv ? uv.getElement(i, t) : [0, 0];
      const sample = colorAt(u!, w!);
      const tint = vertexColor ? vertexColor.getElement(i, c) : [1, 1, 1];
      for (let ch = 0; ch < 3; ch++) rgb[ch] = rgb[ch]! + (sample[ch]! * tint[ch]!) / 3;
    }
    out.colors.push(snap(rgb));
  }
}

// ---------- shaping ----------

/** Turns the longest side along x, then squeezes the model into a unit cube centred on the origin. Returns its natural proportions. */
function normalise(tris: Triangles, turn = 0, [rollX, rollZ] = [0, 0]): [number, number, number] {
  const p = tris.positions;
  /** Turns the plane of two axes: z and x about y, y and z about x, x and y about z. */
  const rotate = (degrees: number, [u, w]: [number, number] = [2, 0]) => {
    const a = (degrees * Math.PI) / 180;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    for (let i = 0; i < p.length; i += 3) [p[i + u], p[i + w]] = [cos * p[i + u]! - sin * p[i + w]!, sin * p[i + u]! + cos * p[i + w]!];
  };
  const bounds = () => {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < p.length; i++) {
      min[i % 3] = Math.min(min[i % 3]!, p[i]!);
      max[i % 3] = Math.max(max[i % 3]!, p[i]!);
    }
    return { min, size: max.map((m, k) => m - min[k]!) };
  };
  if (rollX) rotate(rollX, [1, 2]);
  if (rollZ) rotate(rollZ, [0, 1]);
  if (turn) rotate(turn);
  if (bounds().size[2]! > bounds().size[0]!) rotate(90);
  const { min, size } = bounds();
  for (let i = 0; i < p.length; i++) p[i] = (p[i]! - min[i % 3]!) / size[i % 3]! - 0.5;
  const longest = Math.max(...size);
  return size.map((s) => +(s / longest).toFixed(4)) as [number, number, number];
}

function dropFaces(tris: Triangles, colors: Set<string>): void {
  const keep = tris.colors.map((c) => !colors.has(c));
  tris.positions = tris.positions.filter((_, i) => keep[Math.floor(i / 9)]);
  tris.colors = tris.colors.filter((_, t) => keep[t]);
}

interface Mesh {
  positions: Float32Array;
  colors: string[];
  indices: Uint32Array;
}

/** Shares corners that have the same place and colour. */
function weld(tris: Triangles): Mesh {
  const keys = new Map<string, number>();
  const positions: number[] = [];
  const colors: string[] = [];
  const indices: number[] = [];
  for (let t = 0; t < tris.colors.length; t++) {
    const corners: number[] = [];
    for (let k = 0; k < 3; k++) {
      const o = (t * 3 + k) * 3;
      const xyz = [tris.positions[o]!, tris.positions[o + 1]!, tris.positions[o + 2]!];
      const key = `${xyz.map((x) => Math.round(x * 1e5)).join(',')},${tris.colors[t]}`;
      let index = keys.get(key);
      if (index === undefined) {
        index = colors.length;
        keys.set(key, index);
        positions.push(...xyz);
        colors.push(tris.colors[t]!);
      }
      corners.push(index);
    }
    if (corners[0] !== corners[1] && corners[1] !== corners[2] && corners[0] !== corners[2]) indices.push(...corners);
  }
  return { positions: new Float32Array(positions), colors, indices: new Uint32Array(indices) };
}

function simplify(mesh: Mesh, maxTriangles: number): Mesh {
  if (mesh.indices.length / 3 <= maxTriangles) return mesh;
  const [indices] = MeshoptSimplifier.simplify(mesh.indices, mesh.positions, 3, maxTriangles * 3, 0.05, []);
  return { ...mesh, indices };
}

// ---------- hulls ----------

const toVectors = (points: number[]) => Array.from({ length: points.length / 3 }, (_, i) => new Vector3(points[i * 3], points[i * 3 + 1], points[i * 3 + 2]));

function hullOf(points: number[]): { points: number[]; volume: number } {
  const hull = new ConvexHull().setFromPoints(toVectors(points));
  const corners = new Map<string, Vector3>();
  let volume = 0;
  for (const face of hull.faces) {
    const ring: Vector3[] = [];
    let edge = face.edge;
    do {
      ring.push(edge.head().point);
      edge = edge.next;
    } while (edge !== face.edge);
    for (const p of ring) corners.set(`${p.x},${p.y},${p.z}`, p);
    for (let i = 1; i + 1 < ring.length; i++) volume += ring[0]!.dot(new Vector3().crossVectors(ring[i]!, ring[i + 1]!)) / 6;
  }
  return { points: [...corners.values()].flatMap((p) => [p.x, p.y, p.z]), volume };
}

/** Fewer corners for the physics: snap to a coarser grid until the hull is small enough. */
function reduce(points: number[], max: number): number[] {
  let hull = hullOf(points).points;
  for (let cells = 64; hull.length / 3 > max && cells >= 4; cells /= 2) {
    const snapped = new Map<string, number[]>();
    for (let i = 0; i < hull.length; i += 3) {
      const p = [hull[i]!, hull[i + 1]!, hull[i + 2]!].map((x) => Math.round(x * cells) / cells);
      snapped.set(p.join(','), p);
    }
    hull = hullOf([...snapped.values()].flat()).points;
  }
  return hull.map((x) => +x.toFixed(4));
}

/** Up to four hulls: the model is cut along whichever axis-aligned plane leaves the least empty space, until another cut barely helps. */
function compound(mesh: Mesh): number[][] {
  const triangle = (t: number) => [0, 1, 2].flatMap((k) => [...mesh.positions.subarray(mesh.indices[t + k]! * 3, mesh.indices[t + k]! * 3 + 3)]);
  const centroid = (t: number, axis: number) => (mesh.positions[mesh.indices[t]! * 3 + axis]! + mesh.positions[mesh.indices[t + 1]! * 3 + axis]! + mesh.positions[mesh.indices[t + 2]! * 3 + axis]!) / 3;
  const part = (tris: number[]) => ({ tris, volume: hullOf(tris.flatMap(triangle)).volume });
  const all = Array.from({ length: mesh.indices.length / 3 }, (_, i) => i * 3);
  let parts = [part(all)];
  const whole = parts[0]!.volume;
  while (parts.length < MAX_PARTS) {
    let best = { gain: 0.04 * whole, index: -1, halves: [] as ReturnType<typeof part>[] };
    parts.forEach((p, index) => {
      for (let axis = 0; axis < 3; axis++) {
        const along = p.tris.map((t) => centroid(t, axis));
        const [lo, hi] = [Math.min(...along), Math.max(...along)];
        for (let s = 1; s < CUTS; s++) {
          const at = lo + ((hi - lo) * s) / CUTS;
          const halves = [part(p.tris.filter((_, i) => along[i]! < at)), part(p.tris.filter((_, i) => along[i]! >= at))];
          // a cut that leaves a flat sliver can't stand alone as a hull
          if (halves.some((h) => h.volume < 1e-4)) continue;
          const gain = p.volume - halves[0]!.volume - halves[1]!.volume;
          if (gain > best.gain) best = { gain, index, halves };
        }
      }
    });
    if (best.index < 0) break;
    parts = [...parts.filter((_, k) => k !== best.index), ...best.halves];
  }
  return parts.map((p) => reduce(p.tris.flatMap(triangle), MAX_PART_POINTS));
}

// ---------- writing ----------

async function write(mesh: Mesh, extras: Record<string, unknown>, file: string): Promise<number> {
  // reorders and renumbers the indices in place
  const indices = mesh.indices.slice();
  const [remap, unique] = MeshoptEncoder.reorderMesh(indices, true, true);
  const positions = new Int16Array(unique * 3);
  // four bytes, so every vertex sits on a 4-byte boundary
  const colors = new Uint8Array(unique * 4);
  for (let i = 0; i < remap.length; i++) {
    const to = remap[i]!;
    if (to === 0xffffffff) continue;
    // stored as -1…1 with the node scaled by a half
    for (let k = 0; k < 3; k++) positions[to * 3 + k] = Math.round(mesh.positions[i * 3 + k]! * 2 * 32767);
    const linear = hexToLinear(mesh.colors[i]!);
    for (let k = 0; k < 3; k++) colors[to * 4 + k] = Math.round(linear[k]! * 255);
    colors[to * 4 + 3] = 255;
  }

  const doc = new Document();
  const buffer = doc.createBuffer();
  const position = doc.createAccessor().setType('VEC3').setArray(positions).setNormalized(true).setBuffer(buffer);
  const color = doc.createAccessor().setType('VEC4').setArray(colors).setNormalized(true).setBuffer(buffer);
  const index = doc.createAccessor().setType('SCALAR').setArray(unique <= 0xffff ? Uint16Array.from(indices) : indices).setBuffer(buffer);
  const primitive = doc.createPrimitive().setAttribute('POSITION', position).setAttribute('COLOR_0', color).setIndices(index);
  const node = doc.createNode().setMesh(doc.createMesh().addPrimitive(primitive)).setScale([0.5, 0.5, 0.5]);
  doc.getRoot().setDefaultScene(doc.createScene().addChild(node).setExtras(extras));
  doc.createExtension(KHRMeshQuantization).setRequired(true);
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });

  const io = new NodeIO().registerExtensions([KHRMeshQuantization, EXTMeshoptCompression]).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
  const bytes = await io.writeBinary(doc);
  fs.writeFileSync(path.join(OUT, `${file}.glb`), bytes);
  return bytes.length;
}

// ---------- main ----------

async function main(): Promise<void> {
  const [downloads, ...only] = process.argv.slice(2);
  if (!downloads) throw new Error('Usage: node tools/models/build-models.ts <downloads> [model …]');
  await Promise.all([MeshoptEncoder.ready, MeshoptSimplifier.ready]);
  fs.mkdirSync(OUT, { recursive: true });
  const reader = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const polyPizza = new Map((JSON.parse(fs.readFileSync(path.join(downloads, 'polypizza/SOURCES.json'), 'utf8')) as PolyPizzaSource[]).map((s) => [s.id, s]));
  // a full build starts the credits afresh, so a model taken out of the manifest loses its credit too
  const credits: Record<string, Credit> = only.length && fs.existsSync(CREDITS) ? JSON.parse(fs.readFileSync(CREDITS, 'utf8')) : {};

  for (const [file, source] of Object.entries(manifest as unknown as Record<string, Source>)) {
    if (only.length && !only.includes(file)) continue;
    const raw = source.kenney ? path.join(downloads, 'kenney', source.kenney, `${source.name}.glb`) : path.join(downloads, 'polypizza', `${source.polypizza}.glb`);
    const tris = read(await reader.read(raw));
    if (source.recolor) tris.colors = tris.colors.map((c) => source.recolor![c] ?? c);
    if (source.drop) dropFaces(tris, new Set(source.drop));
    const aspect = normalise(tris, source.turn, source.roll);
    const mesh = simplify(weld(tris), source.maxTriangles ?? MAX_TRIANGLES);
    const hulls = source.collider === 'compound' ? compound(mesh) : [reduce(Array.from(mesh.positions), MAX_HULL_POINTS)];
    const bytes = await write(mesh, { aspect, hulls }, file);

    const changes = ['recoloured to the shared palette', 'rescaled', ...(mesh.indices.length / 3 < tris.colors.length ? ['simplified'] : [])].join(', ');
    if (source.kenney) {
      credits[file] = { title: source.name!, author: 'Kenney', licence: 'CC0 1.0', licenceUrl: LICENCES['CC0 1.0']!, source: `https://kenney.nl/assets/${source.kenney}`, downloaded: KENNEY_DOWNLOADED, changes };
    } else {
      const s = polyPizza.get(source.polypizza!)!;
      credits[file] = { title: s.title, author: s.creator, licence: s.licence, licenceUrl: LICENCES[s.licence]!, source: s.page, downloaded: s.downloaded.slice(0, 10), changes };
    }
    console.log(`${file.padEnd(24)} ${String(tris.colors.length).padStart(5)} → ${String(mesh.indices.length / 3).padStart(5)} tris, ${hulls.length} hull${hulls.length > 1 ? 's' : ''} (${hulls.map((h) => h.length / 3).join('+')} pts), ${(bytes / 1024).toFixed(1)} KB`);
  }
  const sorted = Object.fromEntries(Object.keys(credits).sort().map((k) => [k, credits[k]]));
  fs.writeFileSync(CREDITS, `${JSON.stringify(sorted, null, 2)}\n`);
}

await main();
