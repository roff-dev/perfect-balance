import { wasmUrl } from 'virtual:downloads';
import type { BeamMotion } from './beam';
import type { BodySpec, FromWorker, LockMasses, Snapshot, ToWorker, WorldOptions } from './protocol';

interface Backend {
  post(message: ToWorker, transfer?: Transferable[]): void;
  dispose(): void;
}

/**
 * Talks to the physics world, normally in a worker. Only one tick is ever in flight:
 * frame time that passes while the worker is busy is carried into the next tick, so a
 * slow device runs the simulation late rather than building a queue.
 */
export class PhysicsClient {
  latest: Snapshot | undefined;
  /** True when the world runs on the main thread because a worker couldn't start. */
  inline = false;
  onError: (message: string) => void = () => {};
  /** Bytes of the physics engine downloaded since the last call. */
  onBytes: (n: number) => void = () => {};

  private backend: Backend | undefined;
  private inFlight = false;
  private pendingDt = 0;

  async init(options: WorldOptions): Promise<void> {
    try {
      this.backend = await this.startWorker(options);
    } catch {
      this.backend = await this.startInline(options);
      this.inline = true;
    }
  }

  private startWorker(options: WorldOptions): Promise<Backend> {
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
      const backend: Backend = {
        post: (message, transfer = []) => worker.postMessage(message, transfer),
        dispose: () => worker.terminate(),
      };
      let ready = false;
      worker.onmessage = (event: MessageEvent<FromWorker>) => {
        const message = event.data;
        if (message.type === 'ready') {
          ready = true;
          resolve(backend);
        } else if (message.type === 'error' && !ready) {
          worker.terminate();
          reject(new Error(message.message));
        } else {
          this.receive(message);
        }
      };
      worker.onerror = (event) => {
        event.preventDefault();
        if (!ready) {
          worker.terminate();
          reject(new Error(event.message));
        } else {
          this.onError(event.message || 'The physics worker stopped.');
        }
      };
      backend.post({ type: 'init', options });
    });
  }

  private async startInline(options: WorldOptions): Promise<Backend> {
    const { PhysicsWorld } = await import('./world');
    const world = await PhysicsWorld.create(options, { url: wasmUrl, onBytes: (n) => this.onBytes(n) });
    return {
      post: (message) => {
        switch (message.type) {
          case 'scale':
            return world.setScale(message.options);
          case 'add':
            return world.add(message.body);
          case 'remove':
            return world.remove(message.id);
          case 'clear':
            return world.clear();
          case 'lock':
            return world.lock(message.masses);
          case 'unlock':
            return world.unlock();
          case 'beam':
            return world.setBeam(message.motion);
          case 'tick': {
            world.advance(message.dt);
            return this.receive({ type: 'snapshot', ...world.snapshot() });
          }
        }
      },
      dispose: () => {},
    };
  }

  private receive(message: FromWorker): void {
    if (message.type === 'snapshot') {
      this.latest = message;
      this.inFlight = false;
    } else if (message.type === 'bytes') {
      this.onBytes(message.n);
    } else if (message.type === 'error') {
      this.onError(message.message);
    }
  }

  private post(message: ToWorker, transfer?: Transferable[]): void {
    this.backend?.post(message, transfer);
  }

  /** For a new round at a different real size, sent while the world is empty. */
  scale(options: WorldOptions): void {
    this.post({ type: 'scale', options });
  }

  /** Copies the hulls: the caller usually keeps them for the next copy of the item. */
  add(body: BodySpec): void {
    const hulls = body.hulls.map((h) => h.slice());
    this.post({ type: 'add', body: { ...body, hulls } }, hulls.map((h) => h.buffer));
  }

  remove(id: number): void {
    this.post({ type: 'remove', id });
  }

  clear(): void {
    this.post({ type: 'clear' });
  }

  lock(masses: LockMasses): void {
    this.post({ type: 'lock', masses });
  }

  unlock(): void {
    this.post({ type: 'unlock' });
  }

  beam(motion: BeamMotion): void {
    this.post({ type: 'beam', motion });
  }

  tick(dt: number): void {
    this.pendingDt += dt;
    if (this.inFlight || !this.backend) return;
    this.inFlight = true;
    const elapsed = this.pendingDt;
    this.pendingDt = 0;
    this.post({ type: 'tick', dt: elapsed });
  }

  dispose(): void {
    this.backend?.dispose();
    this.backend = undefined;
  }
}
