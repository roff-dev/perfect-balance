// The calculator on the notes slip (§3.12): add, subtract, multiply and divide, where any number can
// carry a unit of weight. Tapping a unit gives the number that unit, or converts it if it has one.
// It knows nothing about the round, so it can't give a weight away.

export type Unit = 'g' | 'kg' | 't' | 'oz' | 'lb' | 'st';
export type Op = '+' | '−' | '×' | '÷';
export type Key = `${number}` | '.' | Op | '=' | 'clear' | 'back' | Unit;

export const UNITS: readonly Unit[] = ['g', 'kg', 't', 'oz', 'lb', 'st'];

/** Exact: 1 lb = 0.45359237 kg, 1 oz = 1/16 lb = 28.349523125 g, 1 st = 14 lb. */
export const GRAMS: Readonly<Record<Unit, number>> = {
  g: 1,
  kg: 1000,
  t: 1_000_000,
  oz: 28.349523125,
  lb: 453.59237,
  st: 6350.29318,
};

export function convert(value: number, from: Unit, to: Unit): number {
  return from === to ? value : (value * GRAMS[from]) / GRAMS[to];
}

export interface Quantity {
  value: number;
  unit?: Unit;
}

/** What the slip shows: the number being typed or the last answer, and the sum so far above it. */
export interface Display {
  value: string;
  unit?: Unit;
  /** E.g. "2 kg +", or "2 kg + 500 g =" after an answer. */
  sum: string;
  error?: string;
}

const MAX_DIGITS = 12;
const SIGNIFICANT = 10;

/** Up to 10 significant figures, without trailing zeros or exponents. */
export function format(value: number): string {
  return new Intl.NumberFormat('en-GB', { maximumSignificantDigits: SIGNIFICANT, useGrouping: true }).format(value);
}

const describe = (q: Quantity) => (q.unit ? `${format(q.value)} ${q.unit}` : format(q.value));

/**
 * Units in a sum: + and − put the second number into the first one's unit; ÷ of two weights is a
 * plain number ("how many"); × keeps the unit there is. A number with no unit takes the other's.
 */
export function apply(a: Quantity, op: Op, b: Quantity): Quantity {
  const unit = a.unit ?? b.unit;
  const bValue = a.unit && b.unit ? convert(b.value, b.unit, a.unit) : b.value;
  switch (op) {
    case '+':
      return { value: a.value + bValue, unit };
    case '−':
      return { value: a.value - bValue, unit };
    case '×':
      return { value: a.value * b.value, unit };
    case '÷':
      if (b.value === 0) throw new RangeError("Can't divide by 0");
      return a.unit && b.unit ? { value: a.value / bValue } : { value: a.value / b.value, unit: a.unit };
  }
}

export class Calculator {
  /** Digits as typed, while a number is being typed. */
  private typed = '';
  private typedUnit: Unit | undefined;
  /** The last answer, or a converted number; typing replaces it. */
  private answer: Quantity | undefined;
  private pending: { left: Quantity; op: Op } | undefined;
  private sum = '';
  private error: string | undefined;

  press(key: Key): void {
    if (this.error) {
      this.reset();
      if (key === 'clear' || key === 'back') return;
    }
    try {
      if (/^\d$/.test(key) || key === '.') this.type(key);
      else if (key === '+' || key === '−' || key === '×' || key === '÷') this.operate(key);
      else if (key === '=') this.equals();
      else if (key === 'clear') this.reset();
      else if (key === 'back') this.back();
      else this.unit(key as Unit);
    } catch (e) {
      this.reset();
      this.error = e instanceof Error ? e.message : String(e);
    }
  }

  reset(): void {
    this.typed = '';
    this.typedUnit = undefined;
    this.answer = undefined;
    this.pending = undefined;
    this.sum = '';
    this.error = undefined;
  }

  get display(): Display {
    if (this.error) return { value: '', sum: '', error: this.error };
    if (this.typed) return { value: this.grouped(this.typed), unit: this.typedUnit, sum: this.sum };
    const shown = this.answer ?? this.pending?.left;
    if (shown) return { value: format(shown.value), unit: shown.unit, sum: this.sum };
    return { value: '0', unit: this.typedUnit, sum: this.sum };
  }

  /** The number on show, if there is one. */
  private current(): Quantity | undefined {
    if (this.typed) return { value: Number(this.typed), unit: this.typedUnit };
    if (this.typedUnit) return { value: 0, unit: this.typedUnit };
    return this.answer;
  }

  private type(digit: string): void {
    if (this.answer) {
      // a fresh number after an answer starts a new sum
      if (!this.pending) this.sum = '';
      this.answer = undefined;
    }
    if (digit === '.' && this.typed.includes('.')) return;
    if (this.typed.replace('.', '').length >= MAX_DIGITS) return;
    if (this.typed === '0' && digit !== '.') this.typed = '';
    this.typed = (this.typed === '' && digit === '.' ? '0' : this.typed) + digit;
  }

  private unit(unit: Unit): void {
    if (this.typed) {
      if (this.typedUnit && this.typedUnit !== unit) {
        this.answer = { value: convert(Number(this.typed), this.typedUnit, unit), unit };
        this.typed = '';
        this.typedUnit = undefined;
      } else {
        this.typedUnit = unit;
      }
    } else if (this.answer) {
      this.answer = { value: this.answer.unit ? convert(this.answer.value, this.answer.unit, unit) : this.answer.value, unit };
    } else {
      // a unit before any digits: the number typed next has it
      this.typedUnit = unit;
    }
  }

  private operate(op: Op): void {
    const right = this.current();
    if (!right) {
      // a second operator in a row replaces the first
      if (this.pending) {
        this.pending.op = op;
        this.sum = `${describe(this.pending.left)} ${op}`;
      }
      return;
    }
    const left = this.pending ? apply(this.pending.left, this.pending.op, right) : right;
    this.pending = { left, op };
    this.sum = `${describe(left)} ${op}`;
    this.typed = '';
    this.typedUnit = undefined;
    this.answer = undefined;
  }

  private equals(): void {
    const right = this.current();
    if (!this.pending || !right) return;
    const answer = apply(this.pending.left, this.pending.op, right);
    this.sum = `${describe(this.pending.left)} ${this.pending.op} ${describe(right)} =`;
    this.pending = undefined;
    this.typed = '';
    this.typedUnit = undefined;
    this.answer = answer;
  }

  private back(): void {
    // the unit goes first: it's usually the last thing tapped
    if (this.typedUnit) this.typedUnit = undefined;
    // an answer isn't being typed, so there's nothing to delete
    else if (this.typed) this.typed = this.typed.slice(0, -1);
    if (this.typed === '0') this.typed = '';
  }

  /** Thousands grouped while typing, keeping a trailing point or zeros. */
  private grouped(typed: string): string {
    const [whole, fraction] = typed.split('.');
    const w = new Intl.NumberFormat('en-GB').format(Number(whole));
    return fraction === undefined ? w : `${w}.${fraction}`;
  }
}
