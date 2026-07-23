import type { MatchPayloadWithPhraseMetadata } from "obscenity";

export type SupportedLanguageCode =
  | "en"
  | "ar"
  | "de"
  | "es"
  | "fr"
  | "it"
  | "hi"
  | "ja"
  | "ko"
  | "pt"
  | "ru"
  | "zh";

export type DetectorTermSource = "dictionary" | "custom";

export interface OffensiveTermRecord {
  term: string;
  normalizedTerm: string;
  language: string;
  source: DetectorTermSource;
}

export type OffensiveTermInput = string | readonly string[] | Record<string, readonly string[]>;

export interface OffensiveLanguageDetectorOptions {
  languages?: readonly string[];
  customTerms?: OffensiveTermInput;
  excludedTerms?: readonly string[];
}

export interface CensorOptions {
  grawlix?: string;
  grawlixChar?: string;
}

export interface DetectionMatch {
  term: string;
  normalizedTerm: string;
  language: string;
  source: DetectorTermSource;
  termId: number;
  /**
   * Character offset of the match start in the **normalised** input string
   * produced internally by `toNormalizedInput()`.  Use the `value` field to
   * access the matched text directly; do not slice the original input with
   * these indices as NFKC normalisation may change string length.
   */
  startIndex: number;
  /**
   * Character offset of the match end (inclusive) in the **normalised** input
   * string.  See `startIndex` for caveats.
   */
  endIndex: number;
  matchLength: number;
  /** The matched substring from the normalised input. */
  value: string;
}

/** @internal Used only by the matching engine; not part of the public API. */
export interface PhraseMetadata {
  term: string;
  normalizedTerm: string;
  language: string;
  source: DetectorTermSource;
  requiresUnicodeBoundaryCheck: boolean;
}

/** @internal */
export interface DetectionPayload extends MatchPayloadWithPhraseMetadata<PhraseMetadata> {}
