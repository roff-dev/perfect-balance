import { wasmUrl } from 'virtual:downloads';
import type { FromWorker, ToWorker } from './protocol';
import { PhysicsWorld } from './world';

let world: PhysicsWorld | undefined;
let stepMs = 0;
const queued: ToWorker[] = [];

function send(message: FromWorker, transfer: Transferable[] = []): void {
  postMessage(message, { transfer });
}

function handle(message: ToWorker, w: PhysicsWorld): void {
  switch (message.type) {
    case 'scale':
      w.setScale(message.options);
      break;
    case 'add':
      w.add(message.body);
      break;
    case 'remove':
      w.remove(message.id);
      break;
    case 'clear':
      w.clear();
      break;
    case 'lock':
      w.lock(message.masses);
      break;
    case 'unlock':
      w.unlock();
      break;
    case 'beam':
      w.setBeam(message.motion);
      break;
    case 'tick': {
      const start = performance.now();
      w.advance(message.dt);
      stepMs = stepMs * 0.9 + (performance.now() - start) * 0.1;
      const snapshot = w.snapshot(stepMs);
      send({ type: 'snapshot', ...snapshot }, [snapshot.ids.buffer, snapshot.poses.buffer]);
      break;
    }
    case 'init':
      break;
  }
}

onmessage = async (event: MessageEvent<ToWorker>) => {
  const message = event.data;
  try {
    if (message.type === 'init') {
      world = await PhysicsWorld.create(message.options, { url: wasmUrl, onBytes: (n) => send({ type: 'bytes', n }) });
      for (const m of queued.splice(0)) handle(m, world);
      send({ type: 'ready' });
    } else if (world) {
      handle(message, world);
    } else {
      queued.push(message);
    }
  } catch (error) {
    send({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};
