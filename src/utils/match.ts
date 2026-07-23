import type { DetectionMatch, DetectionPayload, PhraseMetadata } from "../types";

type PayloadWithMetadata = DetectionPayload & { phraseMetadata: PhraseMetadata };

/**
 * Converts raw `DetectionPayload` entries from obscenity's matcher into the
 * public `DetectionMatch` shape, applying the Unicode word-boundary filter
 * for non-ASCII terms.
 */
export function mapMatches(
  matches: readonly DetectionPayload[],
  normalizedInput: string,
): DetectionMatch[] {
  return matches
    .filter((match): match is PayloadWithMetadata => {
      if (!match.phraseMetadata) {
        return false;
      }

      return (
        !match.phraseMetadata.requiresUnicodeBoundaryCheck ||
        hasUnicodeWordBoundaries(normalizedInput, match.startIndex, match.endIndex)
      );
    })
    .map((match) => {
      const metadata = match.phraseMetadata; // no ! needed — narrowed by type predicate
      return {
        term: metadata.term,
        normalizedTerm: metadata.normalizedTerm,
        language: metadata.language,
        source: metadata.source,
        termId: match.termId,
        startIndex: match.startIndex,
        endIndex: match.endIndex,
        matchLength: match.matchLength,
        value: normalizedInput.slice(match.startIndex, match.endIndex + 1),
      };
    });
}

/**
 * Returns `true` when the characters immediately before `startIndex` and
 * after `endIndex` in `input` are not word characters (`\p{L}` or `\p{N}`).
 * Used as a boundary check for non-ASCII terms that cannot use obscenity's
 * built-in `|…|` ASCII word-boundary markers.
 *
 * Uses full-codepoint reads to avoid misclassifying lone surrogates from
 * supplementary-plane characters (e.g. emoji) as non-word characters.
 */
export function hasUnicodeWordBoundaries(
  input: string,
  startIndex: number,
  endIndex: number,
): boolean {
  return !isUnicodeWordChar(codepointBefore(input, startIndex)) && !isUnicodeWordChar(codepointAfter(input, endIndex));
}

export function isUnicodeWordChar(char: string | undefined): boolean {
  return typeof char === "string" && /[\p{L}\p{N}]/u.test(char);
}

/**
 * Returns the full Unicode character (one or two code units) immediately
 * before `codeUnitIdx`, or `undefined` if at the start of the string.
 * Handles supplementary-plane characters represented as surrogate pairs.
 */
function codepointBefore(input: string, codeUnitIdx: number): string | undefined {
  if (codeUnitIdx <= 0) {
    return undefined;
  }

  const lo = input.charCodeAt(codeUnitIdx - 1);
  if (lo >= 0xdc00 && lo <= 0xdfff && codeUnitIdx >= 2) {
    const hi = input.charCodeAt(codeUnitIdx - 2);
    if (hi >= 0xd800 && hi <= 0xdbff) {
      return input.slice(codeUnitIdx - 2, codeUnitIdx);
    }
  }

  return input[codeUnitIdx - 1];
}

/**
 * Returns the full Unicode character (one or two code units) immediately
 * after `codeUnitIdx` (inclusive end), or `undefined` if at the end of the string.
 */
function codepointAfter(input: string, codeUnitIdx: number): string | undefined {
  const next = codeUnitIdx + 1;

  if (next >= input.length) {
    return undefined;
  }

  const hi = input.charCodeAt(next);
  if (hi >= 0xd800 && hi <= 0xdbff && next + 1 < input.length) {
    const lo = input.charCodeAt(next + 1);
    if (lo >= 0xdc00 && lo <= 0xdfff) {
      return input.slice(next, next + 2);
    }
  }

  return input[next];
}
