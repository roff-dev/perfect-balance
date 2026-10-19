/** Android's touch slop: movement under this is still a tap. */
const DEAD_ZONE = 8;
const ROTATE_STEP = Math.PI / 12;
/** Keyboard cursor steps in pan radii: 5% of the pan's width, or 1% with Shift. */
const CURSOR_STEP = 0.1;
const CURSOR_FINE = 0.02;
const ARROWS: Record<string, [number, number]> = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };

export type CarrySource = { kind: 'item'; itemId: string } | { kind: 'floor'; itemId: string } | { kind: 'body'; id: number };

/** Raw client coordinates of the carrying pointer. */
export interface Aim {
  x: number;
  y: number;
  touch: boolean;
}

export interface GestureTarget {
  readonly canvas: HTMLCanvasElement;
  /** The player's body under this point, if any. */
  bodyAt(x: number, y: number): number | undefined;
  /** Starts carrying; false when it's refused. */
  pickUp(source: CarrySource): boolean;
  carry(aim: Aim): void;
  /** Turns the held object, or the selected one when nothing is held. */
  rotate(radians: number): void;
  drop(aim: Aim): void;
  /** A body was tapped without being dragged, or the empty scene was (undefined). */
  tap(id: number | undefined): void;
  /** Keyboard placement: picks up and holds it over the pan, moved by `moveCursor`. */
  pickUpWithKeys(source: CarrySource): boolean;
  readonly placingWithKeys: boolean;
  /** By fractions of the pan's radius, right and up as seen on screen. */
  moveCursor(right: number, up: number): void;
  dropWithKeys(): void;
  putBackWithKeys(): void;
}

type State =
  | { kind: 'idle' }
  | { kind: 'pending'; pid: number; source: CarrySource; x: number; y: number; axis: 'x' | 'y' }
  | { kind: 'carrying'; pid: number; x0: number; y0: number; moved: boolean; bodyId?: number; twist?: { pid: number; angle: number } }
  | { kind: 'canvasTap'; pid: number; x: number; y: number };

/**
 * Decides what each pointer gesture means. The listeners sit on window in the capture phase,
 * ahead of camera-controls, so a gesture that belongs to an object never reaches the camera.
 * A gesture's meaning is fixed by where it starts.
 */
export class Gestures {
  private state: State = { kind: 'idle' };
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private readonly listeners: [string, (e: never) => void, AddEventListenerOptions][];

  constructor(private readonly target: GestureTarget) {
    const capture = { capture: true };
    this.listeners = [
      ['pointerdown', (e: PointerEvent) => this.down(e), capture],
      ['pointermove', (e: PointerEvent) => this.move(e), capture],
      ['pointerup', (e: PointerEvent) => this.up(e), capture],
      ['pointercancel', (e: PointerEvent) => this.up(e), capture],
      ['wheel', (e: WheelEvent) => this.wheel(e), { capture: true, passive: false }],
      ['touchmove', (e: TouchEvent) => this.touchmove(e), { capture: true, passive: false }],
      ['keydown', (e: KeyboardEvent) => this.key(e), {}],
    ];
    for (const [type, fn, options] of this.listeners) addEventListener(type, fn as EventListener, options);
  }

  dispose(): void {
    for (const [type, fn, options] of this.listeners) removeEventListener(type, fn as EventListener, options);
  }

  private down(e: PointerEvent): void {
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const s = this.state;

    if (s.kind === 'carrying') {
      if (e.pointerType === 'touch' && !s.twist && e.pointerId !== s.pid) {
        s.twist = { pid: e.pointerId, angle: this.angle(s.pid, e.pointerId) };
      }
      e.stopPropagation();
      e.preventDefault();
      return;
    }
    if (s.kind === 'canvasTap') {
      // a second finger makes it a pinch
      this.state = { kind: 'idle' };
      return;
    }
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    const element = e.target instanceof Element ? e.target : null;
    const tile = element?.closest<HTMLElement>('[data-item]');
    if (tile) {
      const itemId = tile.dataset.item!;
      const source: CarrySource = tile.dataset.source === 'floor' ? { kind: 'floor', itemId } : { kind: 'item', itemId };
      this.state = { kind: 'pending', pid: e.pointerId, source, x: e.clientX, y: e.clientY, axis: scrollAxis(tile) };
      return;
    }
    if (e.target !== this.target.canvas || this.pointers.size !== 1) return;

    const id = this.target.bodyAt(e.clientX, e.clientY);
    if (id !== undefined && this.target.pickUp({ kind: 'body', id })) {
      e.stopPropagation();
      e.preventDefault();
      this.target.canvas.setPointerCapture(e.pointerId);
      // it stays where it is until the drag passes the dead zone, so a tap doesn't make it jump
      this.state = { kind: 'carrying', pid: e.pointerId, x0: e.clientX, y0: e.clientY, moved: false, bodyId: id };
    } else {
      this.state = { kind: 'canvasTap', pid: e.pointerId, x: e.clientX, y: e.clientY };
    }
  }

  private move(e: PointerEvent): void {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const s = this.state;

    if (s.kind === 'pending' && e.pointerId === s.pid) {
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      if (Math.hypot(dx, dy) <= DEAD_ZONE) return;
      // on touch, a drag along the strip scrolls it; only a drag towards the scene picks up
      const towardScene = e.pointerType !== 'touch' || (s.axis === 'x' ? -dy > Math.abs(dx) : -dx > Math.abs(dy));
      if (towardScene && this.target.pickUp(s.source)) {
        this.state = { kind: 'carrying', pid: s.pid, x0: s.x, y0: s.y, moved: true };
        this.target.carry(aimOf(e));
      } else {
        this.state = { kind: 'idle' };
      }
    } else if (s.kind === 'carrying') {
      e.stopPropagation();
      if (s.twist && (e.pointerId === s.pid || e.pointerId === s.twist.pid)) {
        const angle = this.angle(s.pid, s.twist.pid);
        this.target.rotate(-(angle - s.twist.angle));
        s.twist.angle = angle;
      }
      if (e.pointerId !== s.pid) return;
      if (!s.moved && Math.hypot(e.clientX - s.x0, e.clientY - s.y0) > DEAD_ZONE) s.moved = true;
      if (s.moved) this.target.carry(aimOf(e));
    } else if (s.kind === 'canvasTap' && e.pointerId === s.pid) {
      if (Math.hypot(e.clientX - s.x, e.clientY - s.y) > DEAD_ZONE) this.state = { kind: 'idle' };
    }
  }

  private up(e: PointerEvent): void {
    this.pointers.delete(e.pointerId);
    const s = this.state;

    if (s.kind === 'pending' && e.pointerId === s.pid) {
      this.state = { kind: 'idle' };
    } else if (s.kind === 'carrying') {
      e.stopPropagation();
      if (s.twist?.pid === e.pointerId) {
        s.twist = undefined;
      } else if (e.pointerId === s.pid) {
        this.state = { kind: 'idle' };
        if (!s.moved && s.bodyId !== undefined) this.target.tap(s.bodyId);
        else this.target.drop(aimOf(e));
      }
    } else if (s.kind === 'canvasTap' && e.pointerId === s.pid) {
      this.state = { kind: 'idle' };
      if (e.type === 'pointerup') this.target.tap(undefined);
    }
  }

  /**
   * A drag that starts on a tile is still a scroll gesture as far as the browser is concerned.
   * Once it's carrying something, claim the touch, or the browser treats the next tap as the
   * end of that gesture and never turns it into a click.
   */
  private touchmove(e: TouchEvent): void {
    if (this.state.kind === 'carrying' && e.cancelable) e.preventDefault();
  }

  private wheel(e: WheelEvent): void {
    if (this.state.kind !== 'carrying' || e.deltaY === 0) return;
    // otherwise the camera would dolly
    e.stopPropagation();
    e.preventDefault();
    this.target.rotate(-Math.sign(e.deltaY) * ROTATE_STEP);
  }

  private key(e: KeyboardEvent): void {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = this.target;
    if (t.placingWithKeys) {
      const step = e.shiftKey ? CURSOR_FINE : CURSOR_STEP;
      const move = ARROWS[e.key];
      if (move) t.moveCursor(move[0] * step, move[1] * step);
      else if (e.key === 'Enter' && !e.repeat) t.dropWithKeys();
      else if (e.key === 'Escape') t.putBackWithKeys();
      // a held object takes the arrows and Enter, so they don't scroll the strip or press the tile
      if (move || e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault();
        return;
      }
    } else if (e.key === 'Enter' && !e.repeat && this.state.kind === 'idle') {
      const tile = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-item]') : null;
      if (tile) {
        const itemId = tile.dataset.item!;
        t.pickUpWithKeys(tile.dataset.source === 'floor' ? { kind: 'floor', itemId } : { kind: 'item', itemId });
        e.preventDefault();
        return;
      }
    }
    const key = e.key.toLowerCase();
    if (key === 'q') this.target.rotate(ROTATE_STEP);
    else if (key === 'e') this.target.rotate(-ROTATE_STEP);
  }

  private angle(from: number, to: number): number {
    const a = this.pointers.get(from)!;
    const b = this.pointers.get(to)!;
    return Math.atan2(b.y - a.y, b.x - a.x);
  }
}

function aimOf(e: PointerEvent): Aim {
  return { x: e.clientX, y: e.clientY, touch: e.pointerType === 'touch' };
}

/** The scroll axis of the tile's strip decides which drag direction means "pick up". */
function scrollAxis(tile: HTMLElement): 'x' | 'y' {
  const strip = tile.closest<HTMLElement>('[data-strip]');
  if (!strip) return 'x';
  const overflow = getComputedStyle(strip).overflowX;
  return overflow === 'auto' || overflow === 'scroll' ? 'x' : 'y';
}
