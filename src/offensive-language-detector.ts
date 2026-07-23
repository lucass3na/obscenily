import { profaneWords } from "@2toad/profanity";
import {
  buildOffsetMap,
  buildGrawlix,
  mergeIntervals,
  DEFAULT_GRAWLIX,
  DEFAULT_GRAWLIX_CHAR,
} from "./utils/censor";
import { normalizeTerm, toNormalizedInput } from "./utils/normalize";
import type {
  CensorOptions,
  DetectionMatch,
  OffensiveLanguageDetectorOptions,
  OffensiveTermInput,
  OffensiveTermRecord,
  SupportedLanguageCode,
} from "./types";
import { EnglishStrategy } from "./strategies/english";
import { NonEnglishStrategy } from "./strategies/non-english";
import { isValidNormalizedTerm } from "./utils/normalize";

export const SUPPORTED_LANGUAGES = Object.freeze(
  Array.from(profaneWords.keys()) as SupportedLanguageCode[],
);

// Derive the set of known codes from the type so that any drift between the
// hard-coded SupportedLanguageCode union and what @2toad/profanity actually
// exposes is caught immediately at module load (in tests and at runtime).
const KNOWN_CODES = new Set<string>([
  "en", "ar", "de", "es", "fr", "it", "hi", "ja", "ko", "pt", "ru", "zh",
]);

export function warnOnDictionaryLanguageDrift(): void {
  for (const lang of SUPPORTED_LANGUAGES) {
    if (!KNOWN_CODES.has(lang)) {
      // A new language was added to @2toad/profanity that isn't in SupportedLanguageCode.
      // Update the type union in types.ts to include it.
      console.warn(
        `[obscenily] Unknown language code "${lang}" returned by @2toad/profanity. ` +
        `Add it to the SupportedLanguageCode union in types.ts.`,
      );
    }
  }

  for (const lang of KNOWN_CODES) {
    if (!profaneWords.has(lang)) {
      console.warn(
        `[obscenily] Language code "${lang}" in SupportedLanguageCode is no longer provided by ` +
        `@2toad/profanity. Remove it from the SupportedLanguageCode union in types.ts.`,
      );
    }
  }
}

warnOnDictionaryLanguageDrift();

export class OffensiveLanguageDetector {
  private readonly selectedLanguages: Set<string>;
  private readonly excludedTerms: Set<string>;
  private readonly customTerms = new Map<string, Set<string>>();
  private readonly englishStrategy = new EnglishStrategy();
  private readonly nonEnglishStrategy = new NonEnglishStrategy();
  private initializedTerms = 0;

  public constructor(options: OffensiveLanguageDetectorOptions = {}) {
    this.selectedLanguages = new Set(options.languages ?? SUPPORTED_LANGUAGES);
    this.excludedTerms = new Set((options.excludedTerms ?? []).map(normalizeTerm));

    this.ingestCustomTerms(options.customTerms);
    this.rebuildMatcher();
  }

  public hasOffensiveLanguage(input: string): boolean {
    const normalizedInput = toNormalizedInput(input);
    return this.englishStrategy.hasOffensiveLanguage(normalizedInput) || this.nonEnglishStrategy.hasOffensiveLanguage(normalizedInput);
  }

  public detect(input: string): DetectionMatch[] {
    const normalizedInput = toNormalizedInput(input);
    const collected = [
      ...this.englishStrategy.detect(normalizedInput),
      ...this.nonEnglishStrategy.detect(normalizedInput),
    ];
    const unique = new Map<string, DetectionMatch>();

    for (const match of collected) {
      const key = `${match.startIndex}:${match.endIndex}:${match.source}:${match.language}:${match.normalizedTerm}`;
      if (!unique.has(key)) {
        unique.set(key, match);
      }
    }

    return Array.from(unique.values());
  }

  public censor(input: string, options: CensorOptions = {}): string {
    // Normalise to NFC first so no floating combining marks remain; detect() will
    // run its own normalisation internally, but we need a stable reference string
    // whose indices match what detect() reports via its normalizedInput offsets.
    const nfcInput = input.normalize("NFC");
    const matches = this.detect(nfcInput)
      .map((match) => ({ start: match.startIndex, end: match.endIndex }))
      .sort((a, b) => (a.start === b.start ? a.end - b.end : a.start - b.start));

    if (matches.length === 0) {
      return input;
    }

    // Build a per-character offset map so that NFKC-expanding chars (e.g. the fi
    // ligature U+FB01 → "fi") are correctly mapped back to their original position.
    const { normToOrigStart, normToOrigEnd } = buildOffsetMap(nfcInput);
    const grawlix = options.grawlix ?? DEFAULT_GRAWLIX;
    const grawlixChar = options.grawlixChar ?? DEFAULT_GRAWLIX_CHAR;
    const merged = mergeIntervals(matches);

    let cursor = 0;
    let output = "";

    for (const interval of merged) {
      const origStart = normToOrigStart[interval.start] ?? nfcInput.length;
      const origEnd = normToOrigEnd[interval.end] ?? nfcInput.length - 1;
      output += nfcInput.slice(cursor, origStart);
      output += buildGrawlix(origEnd - origStart + 1, grawlix, grawlixChar);
      cursor = origEnd + 1;
    }

    output += nfcInput.slice(cursor);
    return output;
  }

  public addCustomTerms(input: OffensiveTermInput | undefined): void {
    if (!input) {
      return;
    }
    if (Array.isArray(input) && input.length === 0) {
      return;
    }
    if (typeof input === "object" && !Array.isArray(input) && Object.keys(input).length === 0) {
      return;
    }
    this.ingestCustomTerms(input);
    this.rebuildMatcher();
  }

  public addTerms(input: OffensiveTermInput): void {
    this.addCustomTerms(input);
  }

  private ingestCustomTerms(input: OffensiveTermInput | undefined): void {
    if (!input) {
      return;
    }

    if (typeof input === "string") {
      this.appendCustomTerm("custom", input);
      return;
    }

    if (Array.isArray(input)) {
      for (const term of input) {
        this.appendCustomTerm("custom", term);
      }
      return;
    }

    for (const [language, terms] of Object.entries(input)) {
      for (const term of terms) {
        this.appendCustomTerm(language, term);
      }
    }
  }

  private appendCustomTerm(language: string, term: string): void {
    const normalizedTerm = normalizeTerm(term);
    if (!isValidNormalizedTerm(normalizedTerm)) {
      return;
    }

    const currentTerms = this.customTerms.get(language);
    if (currentTerms) {
      currentTerms.add(term);
      return;
    }

    this.customTerms.set(language, new Set([term]));
  }

  public removeTerms(terms: readonly string[]): void {
    for (const term of terms) {
      this.excludedTerms.add(normalizeTerm(term));
    }
    this.rebuildMatcher();
  }

  public getSupportedLanguages(): readonly string[] {
    return [...SUPPORTED_LANGUAGES];
  }

  public getCompiledTerms(): OffensiveTermRecord[] {
    const results: OffensiveTermRecord[] = [];
    const seen = new Set<string>();

    for (const language of this.selectedLanguages) {
      const words = profaneWords.get(language) ?? [];
      for (const term of words) {
        const normalizedTerm = normalizeTerm(term);
        if (!isValidNormalizedTerm(normalizedTerm) || this.excludedTerms.has(normalizedTerm)) {
          continue;
        }

        const dedupe = `dictionary:${language}:${normalizedTerm}`;
        if (seen.has(dedupe)) {
          continue;
        }

        seen.add(dedupe);
        results.push({
          term,
          normalizedTerm,
          language,
          source: "dictionary",
        });
      }
    }

    for (const [language, terms] of this.customTerms.entries()) {
      for (const term of terms) {
        const normalizedTerm = normalizeTerm(term);
        if (!isValidNormalizedTerm(normalizedTerm) || this.excludedTerms.has(normalizedTerm)) {
          continue;
        }

        const dedupe = `custom:${language}:${normalizedTerm}`;
        if (seen.has(dedupe)) {
          continue;
        }

        seen.add(dedupe);
        results.push({
          term,
          normalizedTerm,
          language,
          source: "custom",
        });
      }
    }

    return results;
  }

  private rebuildMatcher(): void {
    const termRecords = this.getCompiledTerms();
    this.englishStrategy.rebuild(this.selectedLanguages.has("en"), this.excludedTerms);
    this.nonEnglishStrategy.rebuild(termRecords);
    this.initializedTerms = this.englishStrategy.getTotalCompiledTerms() + this.nonEnglishStrategy.getTotalCompiledTerms();
  }

  public getTotalCompiledTerms(): number {
    return this.initializedTerms;
  }
}

export function createOffensiveLanguageDetector(
  options?: OffensiveLanguageDetectorOptions,
): OffensiveLanguageDetector {
  return new OffensiveLanguageDetector(options);
}
