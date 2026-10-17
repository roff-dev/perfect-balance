import initJolt from 'jolt-physics/wasm';
import { beamAngle, type BeamMotion } from './beam';
import { POSE_STRIDE, RIG_ENTRIES, type BodySpec, type LockMasses, type Snapshot, type WorldOptions } from './protocol';
import { locate, padTopY, panParts, panRestY, RIG, type Location, type Quat, type Vec3 } from './rig';

type Jolt = Awaited<ReturnType<typeof initJolt>>;
type Body = InstanceType<Jolt['Body']>;

export const STEP = 1 / 60;
const STANDARD_MASS = 1;
/** Heaviest body after the lock-in mass switch; only ratios matter because the beam is scripted. */
const LOCK_MAX_MASS = 10;
/** Real weights span 1000:1 and more; contacts stay stable at 50:1. */
const LOCK_MASS_RATIO = 50;

const LAYER_STATIC = 0;
const LAYER_MOVING = 1;

export type PanSide = 'left' | 'right';
export type BodyLocation = PanSide | Exclude<Location, 'pan'>;

let joltModule: Promise<Jolt> | undefined;

export class PhysicsWorld {
  private readonly J: Jolt;
  private readonly jolt: InstanceType<Jolt['JoltInterface']>;
  private readonly bodyInterface: InstanceType<Jolt['BodyInterface']>;
  private readonly sleepThreshold: number;
  private collisionSteps = 1;
  private readonly beam: Body;
  private readonly pans: Record<PanSide, Body>;
  private readonly bodies = new Map<number, Body>();
  private readonly tmpPos: InstanceType<Jolt['RVec3']>;
  private readonly tmpQuat: InstanceType<Jolt['Quat']>;
  private beamMotion: BeamMotion = { kind: 'locked' };
  private beamTime = 0;
  private accumulator = 0;
  private locked = false;
  steps = 0;

  static async create(options: WorldOptions): Promise<PhysicsWorld> {
    joltModule ??= initJolt();
    return new PhysicsWorld(await joltModule, options);
  }

  private constructor(J: Jolt, options: WorldOptions) {
    this.J = J;
    const settings = new J.JoltSettings();
    const layers = new J.ObjectLayerPairFilterTable(2);
    layers.EnableCollision(LAYER_STATIC, LAYER_MOVING);
    layers.EnableCollision(LAYER_MOVING, LAYER_MOVING);
    const broadPhase = new J.BroadPhaseLayerInterfaceTable(2, 2);
    broadPhase.MapObjectToBroadPhaseLayer(LAYER_STATIC, new J.BroadPhaseLayer(0));
    broadPhase.MapObjectToBroadPhaseLayer(LAYER_MOVING, new J.BroadPhaseLayer(1));
    settings.mObjectLayerPairFilter = layers;
    settings.mBroadPhaseLayerInterface = broadPhase;
    settings.mObjectVsBroadPhaseLayerFilter = new J.ObjectVsBroadPhaseLayerFilterTable(broadPhase, 2, layers, 2);
    this.jolt = new J.JoltInterface(settings);
    J.destroy(settings);

    const system = this.jolt.GetPhysicsSystem();
    this.bodyInterface = system.GetBodyInterface();
    this.sleepThreshold = system.GetPhysicsSettings().mPointVelocitySleepThreshold;
    this.setScale(options);

    this.tmpPos = new J.RVec3(0, 0, 0);
    this.tmpQuat = new J.Quat(0, 0, 0, 1);

    this.addStaticBox(RIG.floorHalf, [0, -RIG.floorHalf[1], 0]);
    const plinthTop = RIG.plinthHalf[1] * 2;
    this.addStaticBox(RIG.plinthHalf, [0, RIG.plinthHalf[1], 0]);
    const padHalfHeight = (padTopY() - plinthTop) / 2;
    for (const x of [-RIG.armLength, RIG.armLength]) {
      this.addStaticBox([RIG.padHalfWidth, padHalfHeight, RIG.padHalfWidth], [x, plinthTop + padHalfHeight, 0]);
    }
    // stops below the beam: the beam is kinematic and never needs to touch it
    const columnHalfHeight = (RIG.pivot[1] - 0.12 - plinthTop) / 2;
    const w = RIG.columnHalfWidth;
    this.addStaticBox([w, columnHalfHeight, w], [0, plinthTop + columnHalfHeight, 0]);

    const beamShape = new J.BoxShape(new J.Vec3(...RIG.beamHalf), 0.01);
    this.beam = this.createBody(beamShape, RIG.pivot, [0, 0, 0, 1], J.EMotionType_Kinematic, LAYER_MOVING);
    this.pans = { left: this.createPan(-1), right: this.createPan(1) };
  }

  /** Each round has its own real size. The pan stays 1 unit across, so gravity and sleeping scale instead. */
  setScale({ unitsPerMetre: k }: WorldOptions): void {
    const J = this.J;
    const system = this.jolt.GetPhysicsSystem();
    // Real gravity in scaled units: big things fall slowly, small things snap.
    const g = 9.81 * k;
    const gravity = new J.Vec3(0, -g, 0);
    system.SetGravity(gravity);
    J.destroy(gravity);
    const physicsSettings = system.GetPhysicsSettings();
    physicsSettings.mPointVelocitySleepThreshold = this.sleepThreshold * k;
    system.SetPhysicsSettings(physicsSettings);
    // Above ~20 units/s² thin objects occasionally sink into the pan with a single collision step.
    this.collisionSteps = g > 20 ? 2 : 1;
  }

  private createBody(
    shape: InstanceType<Jolt['Shape']>,
    pos: Vec3,
    quat: Quat,
    motionType: number,
    layer: number,
    { mass, friction = 0.6, restitution = 0.1, ccd = false }: { mass?: number; friction?: number; restitution?: number; ccd?: boolean } = {},
  ): Body {
    const J = this.J;
    this.tmpPos.Set(...pos);
    this.tmpQuat.Set(...quat);
    const settings = new J.BodyCreationSettings(shape, this.tmpPos, this.tmpQuat, motionType, layer);
    settings.mFriction = friction;
    settings.mRestitution = restitution;
    if (ccd) settings.mMotionQuality = J.EMotionQuality_LinearCast;
    if (mass !== undefined) {
      settings.mOverrideMassProperties = J.EOverrideMassProperties_CalculateInertia;
      settings.mMassPropertiesOverride.mMass = mass;
    }
    const body = this.bodyInterface.CreateBody(settings);
    J.destroy(settings);
    this.bodyInterface.AddBody(body.GetID(), J.EActivation_Activate);
    return body;
  }

  private addStaticBox(half: Vec3, pos: Vec3): Body {
    const J = this.J;
    const shape = new J.BoxShape(new J.Vec3(...half), 0.01);
    return this.createBody(shape, pos, [0, 0, 0, 1], J.EMotionType_Static, LAYER_STATIC, { friction: 0.8, restitution: 0 });
  }

  private hullShape(points: Float32Array): InstanceType<Jolt['Shape']> {
    const J = this.J;
    const settings = new J.ConvexHullShapeSettings();
    const v = new J.Vec3(0, 0, 0);
    for (let i = 0; i < points.length; i += 3) {
      v.Set(points[i]!, points[i + 1]!, points[i + 2]!);
      settings.mPoints.push_back(v);
    }
    J.destroy(v);
    const result = settings.Create();
    if (result.HasError()) throw new Error(`Convex hull failed: ${result.GetError().c_str()}`);
    const shape = result.Get();
    // The settings hold the only reference; the caller releases this one once a body owns the shape.
    shape.AddRef();
    J.destroy(settings);
    return shape;
  }

  private createPan(side: 1 | -1): Body {
    const J = this.J;
    const compound = new J.StaticCompoundShapeSettings();
    const offset = new J.Vec3(0, 0, 0);
    const identity = new J.Quat(0, 0, 0, 1);
    const parts = panParts().map((part) => {
      const hull = this.hullShape(part.points);
      offset.Set(...part.offset);
      compound.AddShapeShape(offset, identity, hull, 0);
      return hull;
    });
    J.destroy(offset);
    J.destroy(identity);
    const shape = compound.Create().Get();
    shape.AddRef();
    J.destroy(compound);

    const x = side * RIG.armLength;
    const pan = this.createBody(shape, [x, panRestY(), 0], [0, 0, 0, 1], J.EMotionType_Dynamic, LAYER_MOVING, {
      mass: RIG.panBaseMass,
      friction: 0.7,
      restitution: 0.05,
    });
    shape.Release();
    for (const hull of parts) hull.Release();
    const motion = pan.GetMotionProperties();
    motion.SetLinearDamping(RIG.panDamping);
    motion.SetAngularDamping(RIG.panDamping * 2);

    // A ball joint at the beam tip; the chains are drawn, not simulated.
    const joint = new J.PointConstraintSettings();
    joint.mSpace = J.EConstraintSpace_WorldSpace;
    const anchor = new J.RVec3(x, RIG.pivot[1], 0);
    joint.mPoint1 = anchor;
    joint.mPoint2 = anchor;
    this.jolt.GetPhysicsSystem().AddConstraint(joint.Create(this.beam, pan));
    J.destroy(anchor);
    J.destroy(joint);
    return pan;
  }

  add({ id, points, pos, quat }: BodySpec): void {
    if (this.bodies.has(id)) this.remove(id);
    const shape = this.hullShape(points);
    const body = this.createBody(shape, pos, quat, this.J.EMotionType_Dynamic, LAYER_MOVING, {
      mass: STANDARD_MASS,
      ccd: true,
    });
    shape.Release();
    body.GetMotionProperties().SetAngularDamping(0.05);
    this.bodies.set(id, body);
    this.updatePanMasses();
  }

  remove(id: number): void {
    const body = this.bodies.get(id);
    if (!body) return;
    const J = this.J;
    const bounds = body.GetWorldSpaceBounds();
    const min = bounds.mMin;
    const max = bounds.mMax;
    // Bodies resting on this one are asleep and would hang in mid-air without a nudge.
    const lo = new J.Vec3(min.GetX() - 0.1, min.GetY() - 0.1, min.GetZ() - 0.1);
    const hi = new J.Vec3(max.GetX() + 0.1, max.GetY() + 0.35, max.GetZ() + 0.1);
    const wake = new J.AABox(lo, hi);
    J.destroy(lo);
    J.destroy(hi);
    this.bodyInterface.RemoveBody(body.GetID());
    this.bodyInterface.DestroyBody(body.GetID());
    this.bodies.delete(id);
    const bpFilter = new J.DefaultBroadPhaseLayerFilter(this.jolt.GetObjectVsBroadPhaseLayerFilter(), LAYER_MOVING);
    const layerFilter = new J.DefaultObjectLayerFilter(this.jolt.GetObjectLayerPairFilter(), LAYER_MOVING);
    this.bodyInterface.ActivateBodiesInAABox(wake, bpFilter, layerFilter);
    J.destroy(wake);
    J.destroy(bpFilter);
    J.destroy(layerFilter);
    this.updatePanMasses();
  }

  clear(): void {
    for (const id of [...this.bodies.keys()]) this.remove(id);
  }

  has(id: number): boolean {
    return this.bodies.has(id);
  }

  /**
   * Switches every body to its real weight for the reveal. A light pan under a heavy pile
   * pushes objects into its floor, so each pan is also made at least as heavy as its load.
   */
  lock(masses: LockMasses): void {
    const known = masses.filter(([id]) => this.bodies.has(id));
    if (known.length > 0) {
      const heaviest = Math.max(...known.map(([, kg]) => kg));
      const floor = heaviest / LOCK_MASS_RATIO;
      for (const [id, kg] of known) {
        const mass = (Math.max(kg, floor) / heaviest) * LOCK_MAX_MASS;
        this.setMass(this.bodies.get(id)!, mass);
      }
    }
    this.locked = true;
    this.updatePanMasses();
  }

  unlock(): void {
    for (const body of this.bodies.values()) this.setMass(body, STANDARD_MASS);
    this.locked = false;
    this.setBeam({ kind: 'locked' });
    this.updatePanMasses();
  }

  get isLocked(): boolean {
    return this.locked;
  }

  setBeam(motion: BeamMotion): void {
    this.beamMotion = motion;
    this.beamTime = 0;
  }

  private setMass(body: Body, mass: number): void {
    body.GetMotionProperties().ScaleToMass(mass);
    this.bodyInterface.ActivateBody(body.GetID());
  }

  private updatePanMasses(): void {
    const load: Record<PanSide, number> = { left: 0, right: 0 };
    for (const body of this.bodies.values()) {
      const where = this.locateBody(body);
      if (where === 'left' || where === 'right') load[where] += 1 / body.GetMotionProperties().GetInverseMass();
    }
    for (const side of ['left', 'right'] as const) {
      const pan = this.pans[side];
      const target = Math.max(RIG.panBaseMass, load[side]);
      const current = 1 / pan.GetMotionProperties().GetInverseMass();
      if (Math.abs(current - target) > 1e-3) this.setMass(pan, target);
    }
  }

  /** Steps at a fixed 60 Hz, carrying the remainder to the next call. */
  advance(dt: number): number {
    this.accumulator += Math.min(dt, 0.1);
    let n = 0;
    while (this.accumulator >= STEP) {
      this.beamTime += STEP;
      const angle = beamAngle(this.beamMotion, this.beamTime);
      this.tmpPos.Set(...RIG.pivot);
      this.tmpQuat.Set(0, 0, -Math.sin(angle / 2), Math.cos(angle / 2));
      this.bodyInterface.MoveKinematic(this.beam.GetID(), this.tmpPos, this.tmpQuat, STEP);
      this.jolt.Step(STEP, this.collisionSteps);
      this.accumulator -= STEP;
      n++;
    }
    this.steps += n;
    return n;
  }

  private readPose(body: Body, out: Float32Array, entry: number): void {
    const p = body.GetPosition();
    const q = body.GetRotation();
    const o = entry * POSE_STRIDE;
    out[o] = p.GetX();
    out[o + 1] = p.GetY();
    out[o + 2] = p.GetZ();
    out[o + 3] = q.GetX();
    out[o + 4] = q.GetY();
    out[o + 5] = q.GetZ();
    out[o + 6] = q.GetW();
    out[o + 7] = body.IsActive() ? 0 : 1;
  }

  /** Fresh buffers every call so they can be transferred to the main thread. */
  snapshot(stepMs = 0): Snapshot {
    const ids = new Int32Array(this.bodies.size);
    const poses = new Float32Array((RIG_ENTRIES + ids.length) * POSE_STRIDE);
    this.readPose(this.pans.left, poses, 0);
    this.readPose(this.pans.right, poses, 1);
    this.readPose(this.beam, poses, 2);
    let i = 0;
    for (const [id, body] of this.bodies) {
      ids[i] = id;
      this.readPose(body, poses, RIG_ENTRIES + i);
      i++;
    }
    return { ids, poses, stepMs, steps: this.steps };
  }

  private locateBody(body: Body): BodyLocation {
    const p = body.GetPosition();
    const pos: Vec3 = [p.GetX(), p.GetY(), p.GetZ()];
    let result: BodyLocation = 'floor';
    for (const side of ['left', 'right'] as const) {
      const pan = this.pans[side];
      const pp = pan.GetPosition();
      const pq = pan.GetRotation();
      const where = locate([pp.GetX(), pp.GetY(), pp.GetZ()], [pq.GetX(), pq.GetY(), pq.GetZ(), pq.GetW()], pos);
      if (where === 'pan') return side;
      if (where === 'lost') result = 'lost';
    }
    return result;
  }

  locateById(id: number): BodyLocation | undefined {
    const body = this.bodies.get(id);
    return body ? this.locateBody(body) : undefined;
  }

  speed(id: number): number {
    return this.bodies.get(id)?.GetLinearVelocity().Length() ?? 0;
  }

  isAsleep(id: number): boolean {
    return !(this.bodies.get(id)?.IsActive() ?? false);
  }

  get bodyCount(): number {
    return this.bodies.size;
  }

  dispose(): void {
    this.J.destroy(this.tmpPos);
    this.J.destroy(this.tmpQuat);
    this.J.destroy(this.jolt);
  }
}
