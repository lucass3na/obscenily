import { DataSet, RegExpMatcher, englishDataset, englishRecommendedTransformers } from "obscenity";
import type { DetectionMatch } from "../types";
import { normalizeTerm } from "../utils/normalize";

type EnglishPhraseMetadata = { originalWord: string };

export class EnglishStrategy {
  private enabled = false;
  private dataSet = new DataSet<EnglishPhraseMetadata>();
  private matcher: RegExpMatcher = new RegExpMatcher({ blacklistedTerms: [] });
  private totalCompiledTerms = 0;

  public rebuild(enabled: boolean, excludedTerms: Set<string>): void {
    this.enabled = enabled;
    if (!enabled) {
      this.dataSet = new DataSet<EnglishPhraseMetadata>();
      this.matcher = new RegExpMatcher({ blacklistedTerms: [] });
      this.totalCompiledTerms = 0;
      return;
    }

    const dataSet = new DataSet<EnglishPhraseMetadata>();
    dataSet
      .addAll(englishDataset as unknown as DataSet<EnglishPhraseMetadata>)
      .removePhrasesIf((phrase) => {
        const originalWord = phrase.metadata?.originalWord;
        return !originalWord || excludedTerms.has(normalizeTerm(originalWord));
      });

    this.dataSet = dataSet;
    this.matcher = new RegExpMatcher({
      ...dataSet.build(),
      ...englishRecommendedTransformers,
    });
    this.totalCompiledTerms = dataSet.build().blacklistedTerms.length;
  }

  public hasOffensiveLanguage(input: string): boolean {
    return this.enabled && this.matcher.hasMatch(input);
  }

  public detect(input: string): DetectionMatch[] {
    if (!this.enabled) {
      return [];
    }

    return this.matcher.getAllMatches(input, true).map((match) => {
      const payload = this.dataSet.getPayloadWithPhraseMetadata(match);
      const originalWord = payload.phraseMetadata?.originalWord ?? "";
      const normalizedTerm = normalizeTerm(originalWord);

      return {
        term: originalWord,
        normalizedTerm,
        language: "en",
        source: "dictionary",
        termId: match.termId,
        startIndex: match.startIndex,
        endIndex: match.endIndex,
        matchLength: match.matchLength,
        value: input.slice(match.startIndex, match.endIndex + 1),
      };
    });
  }

  public getTotalCompiledTerms(): number {
    return this.totalCompiledTerms;
  }
}
