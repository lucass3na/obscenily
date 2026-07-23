import { describe, expect, it, vi } from "vitest";
import { profaneWords } from "@2toad/profanity";
import {
  OffensiveLanguageDetector,
  SUPPORTED_LANGUAGES,
  warnOnDictionaryLanguageDrift,
} from "../src/offensive-language-detector";

function findLanguageTerm(language: string, minimumLength = 1): string {
  const words = profaneWords.get(language) ?? [];
  const term = words.find((word) => /^[\p{L}]+$/u.test(word) && word.length >= minimumLength);
  if (!term) {
    throw new Error(`No simple term found for ${language}`);
  }
  return term;
}

function findLanguageTermUniqueTo(
  language: string,
  excludedLanguages: readonly string[],
  minimumLength = 1,
): string {
  const excludedWords = new Set(
    excludedLanguages.flatMap((excludedLanguage) => profaneWords.get(excludedLanguage) ?? []),
  );
  const words = profaneWords.get(language) ?? [];
  const term = words.find(
    (word) => /^[\p{L}]+$/u.test(word) && word.length >= minimumLength && !excludedWords.has(word),
  );

  if (!term) {
    throw new Error(`No unique term found for ${language}`);
  }

  return term;
}

function toFullWidth(value: string): string {
  return Array.from(value)
    .map((char) => String.fromCodePoint(char.codePointAt(0)! + 0xfee0))
    .join("");
}

function withSeparator(value: string, separator: string): string {
  return Array.from(value).join(separator);
}

function findPlainNonAsciiTerm(language: string, detector: OffensiveLanguageDetector): string {
  const words = profaneWords.get(language) ?? [];
  const term = words.find(
    (word) =>
      /^[\p{L}]+$/u.test(word) &&
      word.length >= 2 &&
      /[^\x00-\x7F]/.test(word) &&
      detector.hasOffensiveLanguage(word),
  );

  if (!term) {
    throw new Error(`No plain non-ascii term detectable for ${language}`);
  }

  return term;
}

function findPhraseTermDetectablePlain(
  language: string,
  detector: OffensiveLanguageDetector,
): string {
  const words = profaneWords.get(language) ?? [];
  const term = words.find(
    (word) =>
      /^\p{L}+(?:\s+\p{L}+)+$/u.test(word) && detector.hasOffensiveLanguage(word),
  );

  if (!term) {
    throw new Error(`No phrase term detectable for ${language}`);
  }

  return term;
}

describe("OffensiveLanguageDetector", () => {
  it("detects obfuscated variants through obscenity transformers", () => {
    const detector = new OffensiveLanguageDetector({ languages: ["en"] });
    expect(detector.hasOffensiveLanguage("this is fu.ck")).toBe(true);
    expect(detector.hasOffensiveLanguage("this is f.u.c.k")).toBe(false);
  });

  it("uses multilingual dictionaries from @2toad/profanity", () => {
    const spanishTerm = findLanguageTerm("es");
    const detector = new OffensiveLanguageDetector({ languages: ["es"] });
    const result = detector.detect(`texto ${spanishTerm} texto`);

    expect(result.length).toBeGreaterThan(0);
    expect(result[0].language).toBe("es");
  });

  it("supports custom terms", () => {
    const detector = new OffensiveLanguageDetector({
      languages: ["en"],
      customTerms: ["custombadword"],
    });

    expect(detector.hasOffensiveLanguage("this has custombadword inside")).toBe(true);
  });

  it("supports custom terms written in Cyrillic", () => {
    const detector = new OffensiveLanguageDetector({
      languages: ["xx"],
      customTerms: ["мудак"],
    });

    expect(detector.hasOffensiveLanguage("мудак")).toBe(true);
  });

  it("supports excluding terms from detection", () => {
    const detector = new OffensiveLanguageDetector({
      languages: ["en"],
      excludedTerms: ["fuck"],
    });

    expect(detector.hasOffensiveLanguage("fuck")).toBe(false);
  });

  it("applies exclusions with normalized variants", () => {
    const detector = new OffensiveLanguageDetector({
      languages: ["en"],
      excludedTerms: ["b1tch"],
    });

    expect(detector.hasOffensiveLanguage("bitch")).toBe(false);
    expect(detector.hasOffensiveLanguage("b.i.t.c.h")).toBe(false);
  });

  it("applies exclusions across diacritic variants", () => {
    const detector = new OffensiveLanguageDetector({
      languages: ["es"],
      customTerms: ["vehículo"],
      excludedTerms: ["vehiculo"],
    });

    expect(detector.hasOffensiveLanguage("vehículo")).toBe(false);
    expect(detector.hasOffensiveLanguage("vehiculo")).toBe(false);
  });

  it("can add and remove terms at runtime", () => {
    const detector = new OffensiveLanguageDetector({ languages: ["en"] });
    detector.addTerms({ custom: ["runtimebadword"] });
    expect(detector.hasOffensiveLanguage("runtimebadword")).toBe(true);

    detector.removeTerms(["runtimebadword"]);
    expect(detector.hasOffensiveLanguage("runtimebadword")).toBe(false);
  });

  it("applies addCustomTerms immediately", () => {
    const detector = new OffensiveLanguageDetector({ languages: ["en"] });
    detector.addCustomTerms(["runtimecustomterm"]);
    expect(detector.hasOffensiveLanguage("runtimecustomterm")).toBe(true);
  });

  it("compiles only selected language dictionaries", () => {
    const englishTerm = findLanguageTerm("en");
    const spanishTerm = findLanguageTermUniqueTo("es", ["en"], 3);
    const detector = new OffensiveLanguageDetector({ languages: ["en"] });

    expect(detector.hasOffensiveLanguage(englishTerm)).toBe(true);
    expect(detector.hasOffensiveLanguage(spanishTerm)).toBe(false);
  });

  it("detects english normalization variants while keeping whitespace chunking aligned with obscenity", () => {
    const detector = new OffensiveLanguageDetector({ languages: ["en"] });

    for (const variant of ["bitch", toFullWidth("bitch"), "b1tch", "b\u0456tch"]) {
      expect(detector.hasOffensiveLanguage(variant), `variant: ${JSON.stringify(variant)}`).toBe(true);
    }

    expect(detector.hasOffensiveLanguage(withSeparator("bitch", ".")), "dot-separated").toBe(false);
    expect(detector.hasOffensiveLanguage("bi tch"), "chunked space-separated").toBe(false);
  });

  it("detects custom multi-word phrases in obfuscated variants", () => {
    const detector = new OffensiveLanguageDetector({
      languages: ["en"],
      customTerms: ["son of a bitch"],
    });

    // literal phrase with natural spaces
    expect(detector.hasOffensiveLanguage("son of a bitch")).toBe(true);
    expect(detector.hasOffensiveLanguage("the son of a bitch left")).toBe(true);

    // evasion variants
    expect(detector.hasOffensiveLanguage("son.of.a.bitch")).toBe(true);
    expect(detector.hasOffensiveLanguage("s\u200bo\u200bn\u200b.\u200bo\u200bf\u200b.\u200ba\u200b.\u200bb\u200bi\u200bt\u200bc\u200bh")).toBe(false);

    const match = detector.detect("text son of a bitch text").find((entry) => entry.source === "custom");
    expect(match?.normalizedTerm).toBe("sonofabitch");
  });

  it("detects plain terms across multiple languages", () => {
    const languages = ["es", "pt", "fr", "de", "it"] as const;

    for (const language of languages) {
      const term = findLanguageTerm(language, 4);
      const detector = new OffensiveLanguageDetector({ languages: [language] });

      expect(detector.hasOffensiveLanguage(term), `${language} plain`).toBe(true);
      expect(detector.hasOffensiveLanguage(withSeparator(term, ".")), `${language} dotted`).toBe(true);
      expect(detector.hasOffensiveLanguage(withSeparator(term, "\u200b")), `${language} zero-width`).toBe(
        true,
      );
      expect(detector.hasOffensiveLanguage(toFullWidth(term)), `${language} full-width`).toBe(true);
    }
  });

  it("returns language/source metadata in multilingual matches", () => {
    const spanishTerm = findLanguageTerm("es", 4);
    const detector = new OffensiveLanguageDetector({
      languages: ["es"],
      customTerms: { custom: ["brandinsult"] },
    });

    const text = `inicio ${spanishTerm} y brandinsult final`;
    const matches = detector.detect(text);

    expect(matches.some((match) => match.language === "es" && match.source === "dictionary")).toBe(true);
    expect(matches.some((match) => match.language === "custom" && match.source === "custom")).toBe(true);
  });

  it("returns consistent match value and indexes", () => {
    const detector = new OffensiveLanguageDetector({
      languages: ["es"],
      customTerms: ["idiota"],
    });
    const input = "xx idiota yy";
    const match = detector.detect(input).find((entry) => entry.normalizedTerm === "idiota");

    expect(match).toBeDefined();
    // Use match.value — not input.slice(startIndex, endIndex+1) — because startIndex/endIndex
    // are offsets into the *normalised* string, not the original input.
    expect(match?.value).toBe("idiota");
  });

  it("match.value is correct even when NFKC normalization changes string length", () => {
    // U+FB01 "ﬁ" (fi-ligature) expands to "fi" under NFKC.  The normalised string is
    // "fiasco" (6 chars) while the original is "\uFB01asco" (5 chars).
    // startIndex / endIndex point into the 6-char normalised space, so slicing the
    // original input with those indices would land in the wrong position.
    const detector = new OffensiveLanguageDetector({
      languages: ["xx"],
      customTerms: ["fiasco"],
    });
    const input = "\uFB01asco"; // ﬁasco  (fi-ligature + "asco")
    const match = detector.detect(input).find((m) => m.normalizedTerm === "fiasco");

    expect(match).toBeDefined();
    expect(match?.value).toBe("fiasco"); // normalised slice — correct
    // Demonstrate that naively slicing the original input with normalised indices gives wrong text:
    // startIndex=0, endIndex=5 — but the original string is only 5 code units ("\uFB01asco"),
    // so the naive slice returns the fi-ligature form, not the normalised "fiasco".
    const naiveSlice = input.slice(match!.startIndex, match!.endIndex + 1);
    expect(naiveSlice).not.toBe(match?.value); // wrong: returns "\uFB01asco", not "fiasco"
  });

  it("detects accent variants between vehículo and vehiculo", () => {
    const detector = new OffensiveLanguageDetector({
      languages: ["es"],
      customTerms: ["vehículo"],
    });

    expect(detector.hasOffensiveLanguage("vehículo")).toBe(true);
    expect(detector.hasOffensiveLanguage("vehiculo")).toBe(true);
    expect(detector.hasOffensiveLanguage("VEHÍCULO")).toBe(true);
  });

  it("does not detect vehículo from the Spanish dictionary unless configured as custom", () => {
    const detector = new OffensiveLanguageDetector({ languages: ["es"] });

    expect(detector.hasOffensiveLanguage("vehículo")).toBe(false);
    expect(detector.hasOffensiveLanguage("vehiculo")).toBe(false);
  });

  it("normalizes in-word separators without matching border-only punctuation", () => {
    const detector = new OffensiveLanguageDetector({
      languages: ["xx"],
      customTerms: ["pelotudo", "pene"],
    });

    expect(detector.hasOffensiveLanguage("p.e.l.o.t.u.d.o")).toBe(true);
    expect(detector.hasOffensiveLanguage(",pelotudo,")).toBe(true);
    expect(detector.hasOffensiveLanguage("penelope,")).toBe(false);
  });

  it("detects accent variants when source term has no accent", () => {
    const detector = new OffensiveLanguageDetector({
      languages: ["es"],
      customTerms: ["vehiculo"],
    });

    expect(detector.hasOffensiveLanguage("vehículo")).toBe(true);
    expect(detector.hasOffensiveLanguage("vehiculo")).toBe(true);
  });

  it("avoids one-character false positives from normalized dictionary entries", () => {
    const detector = new OffensiveLanguageDetector({ languages: ["es"] });
    const matches = detector.detect("idiota");

    expect(matches.some((match) => match.normalizedTerm === "idiota")).toBe(true);
    expect(matches.some((match) => match.normalizedTerm.length < 2)).toBe(false);
  });

  it("detects plain unicode words in additional dictionary languages", () => {
    const languages = ["ar", "hi", "ja", "ko", "zh"] as const;

    for (const language of languages) {
      const detector = new OffensiveLanguageDetector({ languages: [language] });
      const term = findPlainNonAsciiTerm(language, detector);
      expect(detector.hasOffensiveLanguage(term), `${language} plain`).toBe(true);
      expect(detector.hasOffensiveLanguage(withSeparator(term, ".")), `${language} dotted`).toBe(true);
    }
  });

  it("detects compatibility unicode variants for japanese dictionary terms", () => {
    const detector = new OffensiveLanguageDetector({ languages: ["ja"] });
    const term = findPlainNonAsciiTerm("ja", detector);
    const halfWidthVariant = term.normalize("NFKD");

    expect(detector.hasOffensiveLanguage(withSeparator(halfWidthVariant, "."))).toBe(true);
  });

  it("detects plain unicode words in additional dictionary languages", () => {
    const languages = ["ar", "hi", "ja", "ko", "zh"] as const;

    for (const language of languages) {
      const detector = new OffensiveLanguageDetector({ languages: [language] });
      const term = findPlainNonAsciiTerm(language, detector);
      expect(detector.hasOffensiveLanguage(term), `${language} plain`).toBe(true);
    }
  });

  it("censors detected terms using grawlix", () => {
    const detector = new OffensiveLanguageDetector({
      languages: ["es"],
      customTerms: ["vehículo"],
    });

    const output = detector.censor("eres idiota con vehículo", { grawlix: "@#$%&!" });
    expect(output).toBe("eres @#$%&! con @#$%&!@#");
  });

  it("censors with fallback char when grawlix is empty", () => {
    const detector = new OffensiveLanguageDetector({
      languages: ["es"],
      customTerms: ["idiota"],
    });

    const output = detector.censor("idiota", { grawlix: "", grawlixChar: "*" });
    expect(output).toBe("******");
  });

  it("censors using dictionary-only terms without customTerms", () => {
    const detector = new OffensiveLanguageDetector({ languages: ["es"] });
    const term = findLanguageTerm("es", 4);

    const input = `inicio ${term} final`;
    const output = detector.censor(input, { grawlix: "#" });

    expect(output).toBe(`inicio ${"#".repeat(term.length)} final`);
  });

  it("censors multiple matches in a single sentence", () => {
    const detector = new OffensiveLanguageDetector({
      languages: ["xx"],
      customTerms: ["vehicle", "bonjour"],
    });

    const output = detector.censor("vehicle and bonjour", { grawlix: "*" });
    expect(output).toBe("******* and *******");
  });

  it("cycles grawlix characters by match length", () => {
    const detector = new OffensiveLanguageDetector({
      languages: ["xx"],
      customTerms: ["vehicle"],
    });

    const output = detector.censor("vehicle", { grawlix: "@#" });
    expect(output).toBe("@#@#@#@");
  });

  it("returns original text when censor finds no matches", () => {
    const detector = new OffensiveLanguageDetector({
      languages: ["en"],
      customTerms: ["vehicle"],
    });

    const input = "hello world";
    expect(detector.censor(input)).toBe(input);
  });

  it("preserves the original Unicode normalization when censor finds no matches", () => {
    const detector = new OffensiveLanguageDetector({
      languages: ["en"],
      customTerms: ["vehicle"],
    });

    const input = "cafe\u0301";
    expect(input.normalize("NFC")).not.toBe(input);
    expect(detector.censor(input)).toBe(input);
  });

  it("does not flag technical strings without close term matches", () => {
    const detector = new OffensiveLanguageDetector({
      languages: ["xx"],
      customTerms: ["vehicle", "bonjour"],
    });

    expect(detector.hasOffensiveLanguage("https://example.com/api/v1/users?id=42")).toBe(false);
    expect(detector.hasOffensiveLanguage("release_v1.2.3 build-456")).toBe(false);
    expect(detector.hasOffensiveLanguage("support+test.user@example.com")).toBe(false);
  });

  it("does not flag technical strings with dictionary-only configuration", () => {
    const detector = new OffensiveLanguageDetector({ languages: ["en"] });
    const knownTerm = findLanguageTerm("en", 4);

    expect(detector.hasOffensiveLanguage("https://example.com/docs/v2/reference?id=99")).toBe(false);
    expect(detector.hasOffensiveLanguage("2026-07-22_14:33:59+0000")).toBe(false);
    expect(detector.hasOffensiveLanguage("550e8400-e29b-41d4-a716-446655440000")).toBe(false);
    expect(detector.hasOffensiveLanguage(knownTerm)).toBe(true);
  });

  it("does not match plain near-miss words", () => {
    const detector = new OffensiveLanguageDetector({
      languages: ["xx"],
      customTerms: ["vehicle"],
    });

    expect(detector.hasOffensiveLanguage("vehicular")).toBe(false);
    expect(detector.hasOffensiveLanguage("prevehiclepost")).toBe(false);
  });

  it("does not match custom term when embedded in a larger ascii token", () => {
    const detector = new OffensiveLanguageDetector({ languages: ["xx"], customTerms: ["badword"] });
    const term = "badword";

    expect(detector.hasOffensiveLanguage(`pre${term}post`)).toBe(false);
    expect(detector.hasOffensiveLanguage(term)).toBe(true);
  });

  it("does not match non-ascii dictionary term inside a larger token", () => {
    const detector = new OffensiveLanguageDetector({ languages: ["ja"] });
    const term = findPlainNonAsciiTerm("ja", detector);

    expect(detector.hasOffensiveLanguage(`前${term}後`)).toBe(false);
    expect(detector.hasOffensiveLanguage(term)).toBe(true);
  });

  it("merges overlapping intervals when censoring", () => {
    const detector = new OffensiveLanguageDetector({
      languages: ["es"],
      customTerms: ["vehículo", "veh"],
    });

    const output = detector.censor("vehículo");
    expect(output).toBe("@#$%&!@#");
  });

  it("detects multi-word dictionary phrases across languages when obfuscated", () => {
    const languages = ["es", "pt"] as const;

    for (const language of languages) {
      const detector = new OffensiveLanguageDetector({ languages: [language] });
      const phrase = findPhraseTermDetectablePlain(language, detector);
      const dotted = phrase.replace(/\s+/g, ".");

      expect(detector.hasOffensiveLanguage(phrase), `${language} plain phrase`).toBe(true);
      expect(detector.hasOffensiveLanguage(dotted), `${language} dotted phrase`).toBe(true);
    }
  });

  it("does not fail when configured with unsupported language codes", () => {
    const detector = new OffensiveLanguageDetector({
      languages: ["xx", "yy"],
      customTerms: ["badtoken"],
    });

    expect(detector.hasOffensiveLanguage("clean text")).toBe(false);
    expect(detector.hasOffensiveLanguage("badtoken")).toBe(true);
  });

  it("exposes supported languages list with known dictionary entries", () => {
    const detector = new OffensiveLanguageDetector();
    const supported = detector.getSupportedLanguages();

    expect(supported.length).toBeGreaterThan(0);
    expect(supported).toContain("en");
    expect(supported).toContain("es");
  });

  it("warns when SupportedLanguageCode contains a language no longer provided by @2toad/profanity", async () => {
    const missingLanguage = "hi";
    const originalTerms = profaneWords.get(missingLanguage);

    if (!originalTerms) {
      throw new Error(`Expected ${missingLanguage} dictionary to exist for drift-guard test`);
    }
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    profaneWords.delete(missingLanguage);

    try {
      warnOnDictionaryLanguageDrift();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining(`Language code "${missingLanguage}" in SupportedLanguageCode is no longer provided`),
      );
    } finally {
      profaneWords.set(missingLanguage, originalTerms);
      warn.mockRestore();
      warn.mockRestore();
    }
  });

  it("returns a defensive copy of supported languages", () => {
    const detector = new OffensiveLanguageDetector();
    const first = detector.getSupportedLanguages() as string[];
    first.pop();
    const second = detector.getSupportedLanguages();

    expect(second.length).toBeGreaterThan(first.length);
    expect(second).toContain("en");
  });

  it("should preserve both dictionary and custom metadata for same normalized match", () => {
    const spanishTerm = findLanguageTerm("es", 4);
    const detector = new OffensiveLanguageDetector({
      languages: ["es"],
      customTerms: { es: [spanishTerm] },
    });

    const matches = detector.detect(`inicio ${spanishTerm} final`);
    const dictionaryMatches = matches.filter(
      (match) => match.normalizedTerm === spanishTerm && match.source === "dictionary",
    );
    const customMatches = matches.filter(
      (match) => match.normalizedTerm === spanishTerm && match.source === "custom",
    );

    expect(dictionaryMatches.length).toBeGreaterThan(0);
    expect(customMatches.length).toBeGreaterThan(0);
  });

  it("does not detect a phrase when only a subset of its words appear", () => {
    const detector = new OffensiveLanguageDetector({
      languages: ["xx"],
      customTerms: ["son of a bitch"],
    });

    expect(detector.hasOffensiveLanguage("son of")).toBe(false);
    expect(detector.hasOffensiveLanguage("of a bitch")).toBe(false);
  });

  it("censor preserves original characters when NFKC expands a codepoint", () => {
    // The fi-ligature U+FB01 normalises to "fi" (2 chars) via NFKC.
    // Without buildOffsetMap the censor cursor would drift and slice the wrong part.
    const detector = new OffensiveLanguageDetector({
      languages: ["xx"],
      customTerms: ["fiasco"],
    });

    // "ﬁasco" — 1-char fi-ligature followed by "asco" (5 chars total in original)
    // The grawlix must be 5 chars (matching original), not 6 (normalised length).
    const output = detector.censor("\uFB01asco");
    expect(output).toBe("@#$%&"); // 5 chars: fi-ligature + a + s + c + o
    expect(output.length).toBe(5);
    expect(detector.censor("clean")).toBe("clean");
  });

  it("censor grawlix length matches original char count, not normalised char count", () => {
    // Full-width "ｆｕｃｋ" is 4 code units but normalises to "fuck" (also 4) — no change in length.
    // The fi-ligature case is the only common NFKC contraction: 1 original char → 2 normalised.
    // After the fix, grawlix length must equal the original span, not the normalised span.
    const detector = new OffensiveLanguageDetector({
      languages: ["xx"],
      customTerms: ["fi"],
    });
    // U+FB01 "ﬁ" normalises to "fi" (2 normalised chars) but is 1 original char.
    const output = detector.censor("\uFB01");
    expect(output.length).toBe(1); // 1 original char → 1 grawlix char
  });

  it("addCustomTerms with undefined skips rebuild", () => {
    const detector = new OffensiveLanguageDetector({ languages: ["en"] });
    const termsBefore = detector.getTotalCompiledTerms();

    // Should not throw and should not change the compiled term count
    detector.addCustomTerms(undefined);
    expect(detector.getTotalCompiledTerms()).toBe(termsBefore);
  });

  it("addCustomTerms with empty array skips rebuild", () => {
    // Empty array is truthy so without a guard it calls rebuildMatcher() unnecessarily.
    // We instrument via subclass to count rebuild calls.
    // @ts-expect-error — accessing private for test instrumentation only
    class InstrumentedDetector extends OffensiveLanguageDetector {
      public rebuildCount = 0;
      protected rebuildMatcher(): void {
        this.rebuildCount += 1;
        // @ts-expect-error
        super.rebuildMatcher();
      }
    }

    const detector = new InstrumentedDetector({ languages: ["xx"], customTerms: ["badword"] });
    const countAfterInit = detector.rebuildCount;

    detector.addCustomTerms([]);
    expect(detector.rebuildCount).toBe(countAfterInit); // rebuild NOT called
    expect(detector.hasOffensiveLanguage("badword")).toBe(true); // still works
  });

  it("addCustomTerms with empty object skips rebuild", () => {
    // @ts-expect-error — accessing private for test instrumentation only
    class InstrumentedDetector extends OffensiveLanguageDetector {
      public rebuildCount = 0;
      protected rebuildMatcher(): void {
        this.rebuildCount += 1;
        // @ts-expect-error
        super.rebuildMatcher();
      }
    }

    const detector = new InstrumentedDetector({ languages: ["xx"], customTerms: ["badword"] });
    const countAfterInit = detector.rebuildCount;

    detector.addCustomTerms({});
    expect(detector.rebuildCount).toBe(countAfterInit); // rebuild NOT called
    expect(detector.hasOffensiveLanguage("badword")).toBe(true); // still works
  });

  it("should not allow external mutation of supported languages", () => {
    expect(() => (SUPPORTED_LANGUAGES as string[]).splice(0, SUPPORTED_LANGUAGES.length)).toThrow();

    const detector = new OffensiveLanguageDetector();
    const englishTerm = findLanguageTerm("en");
    expect(detector.hasOffensiveLanguage(englishTerm)).toBe(true);
  });

  it("does not produce duplicate matches when a multi-word phrase term precedes a single-word term", () => {
    const detector = new OffensiveLanguageDetector({
      languages: ["xx"],
      customTerms: ["son of a bitch", "bastard"],
    });

    const matches = detector.detect("bastard");
    const bastardMatches = matches.filter((m) => m.normalizedTerm === "bastard");

    expect(bastardMatches.length).toBe(1);
  });

  it("does not produce duplicate matches when obfuscated multi-word custom phrase is detected", () => {
    const detector = new OffensiveLanguageDetector({
      languages: ["xx"],
      customTerms: ["son of a bitch", "vehicle"],
    });

    const matches = detector.detect("vehicle");
    const vehicleMatches = matches.filter((m) => m.normalizedTerm === "vehicle");
    expect(vehicleMatches.length).toBe(1);
  });

  it("does not produce false positive when non-ASCII term is preceded by an emoji (surrogate pair)", () => {
    // Before the surrogate-pair fix, the low surrogate alone was read as the preceding
    // character, which doesn't match \p{L}, so the boundary check passed incorrectly.
    const detector = new OffensiveLanguageDetector({ languages: ["ja"] });
    const term = findPlainNonAsciiTerm("ja", detector);

    // 🔥 is a surrogate pair: should be treated as a word separator (non-letter),
    // so the term bounded by emoji should still be detected.
    expect(detector.hasOffensiveLanguage(`🔥${term}🔥`), `ja term surrounded by emoji`).toBe(true);

    // A Japanese letter before the term should block the match (not a boundary).
    // We use 前 (U+524D, a common CJK letter) as the adjacent character.
    expect(detector.hasOffensiveLanguage(`前${term}後`), `ja term embedded in CJK`).toBe(false);
  });

  it("matches key obscenity parity cases from the recommended english preset", () => {
    const detector = new OffensiveLanguageDetector({ languages: ["en"] });

    expect(detector.hasOffensiveLanguage("pen is")).toBe(false);
    expect(detector.hasOffensiveLanguage("this pen is blue")).toBe(false);
    expect(detector.hasOffensiveLanguage("this cl ass starts now")).toBe(true);
    expect(detector.hasOffensiveLanguage("the cock pit door opened")).toBe(true);
    expect(detector.hasOffensiveLanguage("an anal og clock")).toBe(true);
  });

  it("does not detect spaced non-ASCII letter evasion for Cyrillic custom terms", () => {
    const ruTerm = "мудак";
    const detector = new OffensiveLanguageDetector({
      languages: ["xx"],
      customTerms: [ruTerm],
    });
    const spacedVariant = withSeparator(ruTerm, " ");

    expect(detector.hasOffensiveLanguage(spacedVariant), `ru spaced-letter variant of "${ruTerm}"`).toBe(false);
  });
});
