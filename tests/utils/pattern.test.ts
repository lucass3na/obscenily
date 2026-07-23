import { describe, expect, it } from "vitest";
import {
  buildDuplicateThresholds,
  escapePatternWord,
  shouldUseAggressiveMode,
  shouldUseAsciiWordBoundaries,
} from "../../src/utils/pattern";
import type { OffensiveTermRecord } from "../../src/types";

const makeTerm = (normalizedTerm: string): OffensiveTermRecord => ({
  term: normalizedTerm,
  normalizedTerm,
  language: "en",
  source: "dictionary",
});

describe("escapePatternWord", () => {
  it("escapes obscenity reserved characters", () => {
    // | and ? are reserved in obscenity pattern syntax
    expect(escapePatternWord("f|ck")).toBe("f\\|ck");
    expect(escapePatternWord("f?ck")).toBe("f\\?ck");
    expect(escapePatternWord("f[ck")).toBe("f\\[ck");
    expect(escapePatternWord("f]ck")).toBe("f\\]ck");
    expect(escapePatternWord("f\\ck")).toBe("f\\\\ck");
  });

  it("leaves normal alphanumeric unchanged", () => {
    expect(escapePatternWord("fuck")).toBe("fuck");
  });
});

describe("shouldUseAsciiWordBoundaries", () => {
  it("returns true for pure lowercase ASCII alphanum", () => {
    expect(shouldUseAsciiWordBoundaries("fuck")).toBe(true);
    expect(shouldUseAsciiWordBoundaries("bitch")).toBe(true);
    expect(shouldUseAsciiWordBoundaries("a1b2")).toBe(true);
  });

  it("returns false when term contains non-ASCII characters", () => {
    expect(shouldUseAsciiWordBoundaries("puta")).toBe(true); // all ASCII
    expect(shouldUseAsciiWordBoundaries("café")).toBe(false); // é is non-ASCII
  });

  it("returns false for empty string (no word chars)", () => {
    expect(shouldUseAsciiWordBoundaries("")).toBe(false);
  });
});

describe("shouldUseAggressiveMode", () => {
  it("triggers on special chars (dots, dashes, @)", () => {
    expect(shouldUseAggressiveMode("b.i.t.c.h")).toBe(true);
    expect(shouldUseAggressiveMode("f-u-c-k")).toBe(true);
    expect(shouldUseAggressiveMode("@ss")).toBe(true);
  });

  it("triggers on character repetition (3+ consecutive duplicates)", () => {
    expect(shouldUseAggressiveMode("fuuuck")).toBe(true);
    expect(shouldUseAggressiveMode("biiitch")).toBe(true);
  });

  it("triggers on 4+ space-separated single letters (f u c k)", () => {
    expect(shouldUseAggressiveMode("f u c k")).toBe(true);
    expect(shouldUseAggressiveMode("s h i t")).toBe(true);
  });

  it("triggers on 4+ space-separated non-ASCII single letters (Cyrillic, Arabic)", () => {
    // ASCII \b does not anchor on non-ASCII letters — the fix uses Unicode lookahead/lookbehind.
    // Cyrillic: м а т ь (4 single letters, Russian evasion)
    expect(shouldUseAggressiveMode("м а т ь")).toBe(true);
    // Arabic: 4 single Arabic letters separated by spaces
    expect(shouldUseAggressiveMode("م ا ت ح")).toBe(true);
  });

  it("does NOT trigger on natural text with 3 single-letter words", () => {
    // 'I', 'a', 'b' are 3 single-letter words — below the threshold of 4
    expect(shouldUseAggressiveMode("I pick a b c")).toBe(false);
  });

  it("does NOT trigger on clean plain text", () => {
    expect(shouldUseAggressiveMode("hello world")).toBe(false);
    expect(shouldUseAggressiveMode("the quick brown fox")).toBe(false);
  });

  it("does NOT trigger on text with exactly 2 consecutive duplicate chars (normal emphasis)", () => {
    // "sooo" has 3 o's (>= 3) so it triggers; "soo" has 2 o's — does not
    expect(shouldUseAggressiveMode("soo good")).toBe(false);
  });
});

describe("buildDuplicateThresholds", () => {
  it("records the longest run per character (only chars with run > 1 are stored)", () => {
    const thresholds = buildDuplicateThresholds([makeTerm("cooool")]);
    // 'o' appears 4 times consecutively → stored with value 4
    expect(thresholds.get("o")).toBe(4);
    // 'c' and 'l' appear only once → NOT stored (map returns undefined)
    expect(thresholds.get("c")).toBeUndefined();
    expect(thresholds.get("l")).toBeUndefined();
  });

  it("handles multiple terms and keeps the max run per character", () => {
    const thresholds = buildDuplicateThresholds([makeTerm("aaa"), makeTerm("aaaa")]);
    expect(thresholds.get("a")).toBe(4);
  });

  it("returns empty map for empty input", () => {
    expect(buildDuplicateThresholds([])).toEqual(new Map());
  });

  it("returns empty map for terms with no consecutively-repeated chars", () => {
    // buildDuplicateThresholds only stores chars that appear > 1 time consecutively
    const thresholds = buildDuplicateThresholds([makeTerm("fuck")]);
    expect(thresholds.size).toBe(0);
    expect(thresholds.get("f")).toBeUndefined();
  });
});
