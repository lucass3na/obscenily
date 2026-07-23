import { resolveConfusablesTransformer } from "obscenity";

export const LETTER_OR_NUMBER = /[\p{L}\p{N}]/u;
export const MIN_NORMALIZED_TERM_LENGTH = 2;
const CONFUSABLES_TRANSFORMER = resolveConfusablesTransformer();

export const LEET_REPLACEMENTS: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "8": "b",
  "@": "a",
  $: "s",
};

export function stripDiacritics(value: string): string {
  return value.normalize("NFD").replace(/\p{M}+/gu, "");
}

/** Normalises `input` to a flat, lowercase, diacritic-free form suitable for matching. */
export function toNormalizedInput(input: string): string {
  return stripDiacritics(input.normalize("NFKC").toLocaleLowerCase());
}

/**
 * Mirrors obscenity's shared matcher transforms on the input text so we can
 * compile term patterns against the same confusable-resolved representation
 * that the matcher sees at runtime.
 */
export function toMatcherInput(input: string): string {
  let output = "";

  for (const char of toNormalizedInput(input)) {
    const mapped = CONFUSABLES_TRANSFORMER.transform(char.codePointAt(0)!);
    if (mapped !== undefined) {
      output += String.fromCodePoint(mapped);
    }
  }

  return output.toLocaleLowerCase();
}

/**
 * Collapses leet-speak digits/symbols to their letter equivalents and strips
 * every character that is not a letter or number.
 */
export function canonicalizeTerm(value: string): string {
  const result: string[] = [];

  for (const char of value) {
    const replaced = LEET_REPLACEMENTS[char] ?? char;
    if (LETTER_OR_NUMBER.test(replaced)) {
      result.push(replaced);
    }
  }

  return result.join("");
}

/** Normalises then canonicalises a term string into its matchable form. */
export function normalizeTerm(term: string): string {
  return canonicalizeTerm(toNormalizedInput(term));
}

/** Internal matcher key that mirrors obscenity's shared input transforms. */
export function normalizeMatcherTerm(term: string): string {
  return canonicalizeTerm(toMatcherInput(term));
}

export function isValidNormalizedTerm(value: string): boolean {
  return value.length >= MIN_NORMALIZED_TERM_LENGTH;
}
