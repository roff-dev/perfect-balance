// No imports, so vite.config.ts can load it as it is.

/** The fields of a catalogue entry the game reads; the build ships only these. */
export const GAME_FIELDS = ['id', 'name', 'variant', 'weightKg', 'dimensionsM', 'canBePrompt', 'canBeInventory', 'sizeContradiction', 'unsteady', 'model', 'themes', 'addedIn'] as const;

export function forGame<T extends object>(entry: T): Partial<T> {
  return Object.fromEntries(Object.entries(entry).filter(([k]) => (GAME_FIELDS as readonly string[]).includes(k))) as Partial<T>;
}
