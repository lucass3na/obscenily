import { DataSet, RegExpMatcher, parseRawPattern } from "obscenity";
import type { DetectionMatch, DetectionPayload, OffensiveTermRecord, PhraseMetadata } from "../types";
import { buildDuplicateThresholds, escapePatternWord, shouldUseAsciiWordBoundaries } from "../utils/pattern";
import { canonicalizeTerm, normalizeMatcherTerm, toMatcherInput, LETTER_OR_NUMBER } from "../utils/normalize";
import { BASE_BLACKLIST_TRANSFORMERS, collapseDuplicatesTransformer } from "../utils/transformers";
import { hasUnicodeWordBoundaries, mapMatches } from "../utils/match";

type CollapsedInnerSeparators = {
  value: string;
  indexMap: number[];
};

export class NonEnglishStrategy {
  private strictMatcher: RegExpMatcher = this.createEmptyMatcher();
  private strictDataSet = new DataSet<PhraseMetadata>();
  private totalCompiledTerms = 0;

  public rebuild(termRecords: readonly OffensiveTermRecord[]): void {
    const genericTermRecords = termRecords.filter((term) => !(term.language === "en" && term.source === "dictionary"));
    const strictDataSet = new DataSet<PhraseMetadata>();

    for (const term of genericTermRecords) {
      const matcherNormalizedTerm = normalizeMatcherTerm(term.term);
      const usesAsciiBoundaries = shouldUseAsciiWordBoundaries(term.normalizedTerm);
      const strictPattern = usesAsciiBoundaries ? `|${escapePatternWord(matcherNormalizedTerm)}|` : escapePatternWord(matcherNormalizedTerm);

      strictDataSet.addPhrase((builder) =>
        this.buildTermPhrase(builder, strictPattern, {
          term: term.term,
          normalizedTerm: term.normalizedTerm,
          language: term.language,
          source: term.source,
          requiresUnicodeBoundaryCheck: !usesAsciiBoundaries,
        }),
      );

      if (usesAsciiBoundaries) {
        const normalizedRaw = toMatcherInput(term.term);
        if (normalizedRaw.includes(" ")) {
          const phraseWords = normalizedRaw.split(/\s+/).map(canonicalizeTerm).filter((w) => w.length > 0);
          if (phraseWords.length > 1) {
            const phrasePattern = `|${phraseWords.map(escapePatternWord).join(" ")}|`;
            strictDataSet.addPhrase((builder) =>
              this.buildTermPhrase(builder, phrasePattern, {
                term: term.term,
                normalizedTerm: term.normalizedTerm,
                language: term.language,
                source: term.source,
                requiresUnicodeBoundaryCheck: false,
              }),
            );
          }
        }
      }
    }

    this.strictDataSet = strictDataSet;
    this.totalCompiledTerms = genericTermRecords.length;

    const customThresholds = buildDuplicateThresholds(
      genericTermRecords.map((term) => ({
        ...term,
        normalizedTerm: normalizeMatcherTerm(term.term),
      })),
    );

    this.strictMatcher = new RegExpMatcher({
      ...strictDataSet.build(),
      blacklistMatcherTransformers: [
        ...BASE_BLACKLIST_TRANSFORMERS,
        collapseDuplicatesTransformer({ customThresholds, defaultThreshold: 1 }),
      ],
    });
  }

  public hasOffensiveLanguage(input: string): boolean {
    if (this.hasMatchInDataset(this.strictMatcher, this.strictDataSet, input)) {
      return true;
    }

    const collapsed = collapseInnerSeparators(input);
    if (collapsed.value === input) {
      return false;
    }

    return this.hasMatchInDataset(this.strictMatcher, this.strictDataSet, collapsed.value);
  }

  public detect(input: string): DetectionMatch[] {
    const strictMatches = this.strictMatcher
      .getAllMatches(input, true)
      .map((match) => this.strictDataSet.getPayloadWithPhraseMetadata(match) as DetectionPayload);

    const collapsed = collapseInnerSeparators(input);
    const collapsedMatches = collapsed.value === input
      ? []
      : this.strictMatcher
          .getAllMatches(collapsed.value, true)
          .map((match) => this.strictDataSet.getPayloadWithPhraseMetadata(match) as DetectionPayload);

    const unique = new Map<string, DetectionMatch>();
    for (const match of mapMatches(strictMatches, input)) {
      const key = `${match.startIndex}:${match.endIndex}:${match.source}:${match.language}:${match.normalizedTerm}`;
      if (!unique.has(key)) {
        unique.set(key, match);
      }
    }

    for (const match of this.mapCollapsedMatches(collapsedMatches, collapsed.indexMap, input)) {
      const key = `${match.startIndex}:${match.endIndex}:${match.source}:${match.language}:${match.normalizedTerm}`;
      if (!unique.has(key)) {
        unique.set(key, match);
      }
    }

    return Array.from(unique.values());
  }

  public getTotalCompiledTerms(): number {
    return this.totalCompiledTerms;
  }

  private mapCollapsedMatches(
    matches: readonly DetectionPayload[],
    indexMap: readonly number[],
    originalInput: string,
  ): DetectionMatch[] {
    const output: DetectionMatch[] = [];

    for (const match of matches) {
      const metadata = match.phraseMetadata;
      if (!metadata) {
        continue;
      }
      if (metadata.requiresUnicodeBoundaryCheck && !hasUnicodeWordBoundaries(originalInput, indexMap[match.startIndex]!, indexMap[match.endIndex]!)) {
        continue;
      }

      const startIndex = indexMap[match.startIndex]!;
      const endIndex = indexMap[match.endIndex]!;
      output.push({
        term: metadata.term,
        normalizedTerm: metadata.normalizedTerm,
        language: metadata.language,
        source: metadata.source,
        termId: match.termId,
        startIndex,
        endIndex,
        matchLength: endIndex - startIndex + 1,
        value: originalInput.slice(startIndex, endIndex + 1),
      });
    }

    return output;
  }

  private hasMatchInDataset(
    matcher: RegExpMatcher,
    dataSet: DataSet<PhraseMetadata>,
    input: string,
  ): boolean {
    for (const raw of matcher.getAllMatches(input, true)) {
      const payload = dataSet.getPayloadWithPhraseMetadata(raw) as DetectionPayload;
      if (!payload.phraseMetadata) {
        continue;
      }
      if (!payload.phraseMetadata.requiresUnicodeBoundaryCheck) {
        return true;
      }
      if (hasUnicodeWordBoundaries(input, raw.startIndex, raw.endIndex)) {
        return true;
      }
    }

    return false;
  }

  private buildTermPhrase(
    builder: import("obscenity").PhraseBuilder<PhraseMetadata>,
    patternText: string,
    metadata: PhraseMetadata,
  ) {
    return builder.setMetadata(metadata).addPattern(parseRawPattern(patternText));
  }

  private createEmptyMatcher(): RegExpMatcher {
    return new RegExpMatcher({ blacklistedTerms: [] });
  }
}

function collapseInnerSeparators(input: string): CollapsedInnerSeparators {
  const chars = Array.from(input);
  const codeUnitOffsets: number[] = [];
  let codeUnitOffset = 0;
  for (const char of chars) {
    codeUnitOffsets.push(codeUnitOffset);
    codeUnitOffset += char.length;
  }

  let value = "";
  const indexMap: number[] = [];

  for (let i = 0; i < chars.length; i += 1) {
    const current = chars[i]!;
    const currentIsWord = LETTER_OR_NUMBER.test(current);
    const prevIsWord = i > 0 && LETTER_OR_NUMBER.test(chars[i - 1]!);
    const nextIsWord = i + 1 < chars.length && LETTER_OR_NUMBER.test(chars[i + 1]!);
    const isInnerSeparator = !currentIsWord && prevIsWord && nextIsWord && !/\s/u.test(current);

    if (isInnerSeparator) {
      continue;
    }

    value += current;
    const originalStart = codeUnitOffsets[i]!;
    for (let unit = 0; unit < current.length; unit += 1) {
      indexMap.push(originalStart + unit);
    }
  }

  return { value, indexMap };
}
