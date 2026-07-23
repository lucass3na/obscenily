import type { OffensiveTermRecord } from "../types";

export const PATTERN_RESERVED_CHARS = /[\\?[\]|]/g;

// Compiled once at module load — called on every detect() invocation.
const RE_SPECIAL_CHARS = /[^\p{L}\p{N}\s]/u;
const RE_TRIPLE_REPEAT = /(.)\1{2,}/u;
// Unicode-aware boundary: (?<!\p{L}) / (?!\p{L}) instead of \b so that non-ASCII
// letters (Cyrillic, Arabic, CJK …) are correctly anchored.
const RE_SPACED_LETTERS = /(?<!\p{L})\p{L}(?:\s+\p{L}){3,}(?!\p{L})/u;

/** Escapes characters that have special meaning inside an obscenity raw pattern. */
export function escapePatternWord(value: string): string {
  return value.replace(PATTERN_RESERVED_CHARS, "\\$&");
}

/**
 * Returns `true` when `value` consists entirely of ASCII letters/digits and can
 * therefore use `|…|` word-boundary markers in the obscenity pattern.
 */
export function shouldUseAsciiWordBoundaries(value: string): boolean {
  return /^[a-z0-9]+$/u.test(value);
}

/**
 * Returns `true` when `normalizedInput` contains signals that suggest the user
 * may be trying to evade detection:
 *
 * 1. Non-letter/digit/space characters (dots, specials, zero-width chars …)
 * 2. Three or more consecutive identical characters (`"fffffuck"`)
 * 3. Four or more consecutive single-letter whitespace-separated tokens —
 *    the canonical letter-by-letter evasion pattern (`"f u c k"`).
 *    Threshold is raised to 4+ letters to avoid false-triggering on natural
 *    sentences that happen to contain 1–3 single-letter words (e.g. "I go a lot").
 */
export function shouldUseAggressiveMode(input: string): boolean {
  return RE_SPECIAL_CHARS.test(input) || RE_TRIPLE_REPEAT.test(input) || RE_SPACED_LETTERS.test(input);
}

/**
 * Builds a per-character duplicate-run threshold map from the compiled term
 * list.  The map is passed to `collapseDuplicatesTransformer` so that only
 * runs that exceed the longest legitimate run in any term get collapsed,
 * preventing `"hello"` from incorrectly matching `"helo"`.
 */
export function buildDuplicateThresholds(terms: readonly OffensiveTermRecord[]): Map<string, number> {
  const thresholds = new Map<string, number>();

  for (const term of terms) {
    let previous = "";
    let run = 0;

    for (const char of term.normalizedTerm) {
      if (char === previous) {
        run += 1;
      } else {
        previous = char;
        run = 1;
      }

      const currentThreshold = thresholds.get(char) ?? 1;
      if (run > currentThreshold) {
        thresholds.set(char, run);
      }
    }
  }

  return thresholds;
}
