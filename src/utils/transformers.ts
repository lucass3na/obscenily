import {
  collapseDuplicatesTransformer,
  resolveConfusablesTransformer,
  resolveLeetSpeakTransformer,
  toAsciiLowerCaseTransformer,
} from "obscenity";
import type { TransformerContainer } from "obscenity";
import { LETTER_OR_NUMBER } from "./normalize";

export { collapseDuplicatesTransformer };

/**
 * Strips every codepoint that is not a letter or digit, effectively collapsing
 * separator-based evasion (dots, spaces, zero-width characters …) for the
 * aggressive matching pass.
 */
export const skipNonLetterOrNumberUnicodeTransformer: TransformerContainer = {
  type: 0,
  transform: (value) => {
    const char = String.fromCodePoint(value);
    return LETTER_OR_NUMBER.test(char) ? value : undefined;
  },
};

/**
 * Exact shared prefix used by obscenity's recommended English blacklist rules:
 * confusables -> leetspeak -> ASCII lower-case.
 */
export const BASE_BLACKLIST_TRANSFORMERS = [
  resolveConfusablesTransformer(),
  resolveLeetSpeakTransformer(),
  toAsciiLowerCaseTransformer(),
];
