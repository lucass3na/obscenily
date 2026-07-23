import { toNormalizedInput } from "./normalize";

export const DEFAULT_GRAWLIX = "@#$%&!";
export const DEFAULT_GRAWLIX_CHAR = "*";

/**
 * Produces a grawlix string of exactly `length` characters by cycling through
 * the `grawlix` source string.  If `grawlix` is empty, `fallbackChar` is used
 * instead.
 *
 * @example
 * buildGrawlix(7, "@#", "*") // "@#@#@#@"
 * buildGrawlix(3, "",  "*") // "***"
 */
export function buildGrawlix(length: number, grawlix: string, fallbackChar: string): string {
  const source = grawlix.length > 0 ? grawlix : fallbackChar;
  let output = "";

  for (let i = 0; i < length; i += 1) {
    output += source[i % source.length];
  }

  return output;
}

/**
 * Merges an already-sorted list of `{start, end}` intervals, collapsing
 * adjacent (`end+1 === next.start`) and overlapping spans into one.
 */
export function mergeIntervals(
  intervals: readonly { start: number; end: number }[],
): { start: number; end: number }[] {
  if (intervals.length === 0) {
    return [];
  }

  const merged: { start: number; end: number }[] = [];
  let current = { ...intervals[0] };

  for (let i = 1; i < intervals.length; i += 1) {
    const next = intervals[i];
    if (next.start <= current.end + 1) {
      current.end = Math.max(current.end, next.end);
      continue;
    }

    merged.push(current);
    current = { ...next };
  }

  merged.push(current);
  return merged;
}

/**
 * Builds a forward mapping from each position in the `toNormalizedInput`-
 * transformed version of `input` back to the original character boundaries.
 *
 * This is necessary because NFKC normalisation (applied inside
 * `toNormalizedInput`) can expand a single codepoint into multiple ones —
 * for example the fi-ligature U+FB01 → `"fi"` (1 → 2 chars).  Without this
 * map, slicing `input` with indices from the normalised string would land in
 * the wrong positions.
 *
 * **Design invariant — zero-length normalised characters:**
 * Some codepoints (e.g. standalone combining marks) are stripped entirely by
 * `stripDiacritics`.  When `toNormalizedInput(ch)` returns `""` for such a
 * character, no entries are pushed for that original position and `pos` still
 * advances.  This is correct: the normalised string never contains that
 * character, so no match index can ever point there, and the following
 * character's entries are mapped to the right original offset automatically.
 *
 * @param input A string pre-normalised with `String.prototype.normalize("NFC")`
 *              so that all composable diacritics are already merged into their
 *              base characters before iteration.
 */
export function buildOffsetMap(input: string): {
  normToOrigStart: number[];
  normToOrigEnd: number[];
} {
  const normToOrigStart: number[] = [];
  const normToOrigEnd: number[] = [];
  let pos = 0;

  for (const ch of input) {
    const chNorm = toNormalizedInput(ch);
    const end = pos + ch.length - 1;

    for (let j = 0; j < chNorm.length; j += 1) {
      normToOrigStart.push(pos);
      normToOrigEnd.push(end);
    }

    pos += ch.length;
  }

  return { normToOrigStart, normToOrigEnd };
}
