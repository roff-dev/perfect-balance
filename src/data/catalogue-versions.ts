export interface VersionRange {
  /** The first puzzle this range applies to. */
  from: number;
  /** Puzzles in the range only see entries added in this catalogue version or earlier. */
  catalogue: number;
  /** Part of each puzzle's seed; changed only with a new range, so past puzzles keep their rounds. */
  generator: number;
}

/** Oldest first. Adding objects means adding a range here, never editing an old one. */
export const CATALOGUE_VERSIONS: readonly VersionRange[] = [{ from: 1, catalogue: 1, generator: 1 }];
