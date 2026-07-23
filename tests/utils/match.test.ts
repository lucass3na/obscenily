import { describe, expect, it } from "vitest";
import { hasUnicodeWordBoundaries, isUnicodeWordChar } from "../../src/utils/match";

describe("isUnicodeWordChar", () => {
  it("returns true for ASCII letters", () => {
    expect(isUnicodeWordChar("a")).toBe(true);
    expect(isUnicodeWordChar("Z")).toBe(true);
  });

  it("returns true for ASCII digits", () => {
    expect(isUnicodeWordChar("0")).toBe(true);
    expect(isUnicodeWordChar("9")).toBe(true);
  });

  it("returns true for non-ASCII letters (Unicode category L)", () => {
    expect(isUnicodeWordChar("é")).toBe(true);
    expect(isUnicodeWordChar("ñ")).toBe(true);
    expect(isUnicodeWordChar("中")).toBe(true);
  });

  it("returns false for punctuation and spaces", () => {
    expect(isUnicodeWordChar(".")).toBe(false);
    expect(isUnicodeWordChar(" ")).toBe(false);
    expect(isUnicodeWordChar("!")).toBe(false);
    expect(isUnicodeWordChar("@")).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isUnicodeWordChar(undefined)).toBe(false);
  });

  it("returns false for a lone surrogate (not a valid character)", () => {
    // A lone low surrogate is not a Unicode letter — must not be treated as a word char.
    const loneSurrogate = "\uDC00";
    expect(isUnicodeWordChar(loneSurrogate)).toBe(false);
  });
});

describe("hasUnicodeWordBoundaries", () => {
  it("returns true when match is at the start and end of the string", () => {
    // "fuck" — positions 0..3, no chars outside
    expect(hasUnicodeWordBoundaries("fuck", 0, 3)).toBe(true);
  });

  it("returns true when bounded by spaces", () => {
    // " fuck " — match at 1..4
    expect(hasUnicodeWordBoundaries(" fuck ", 1, 4)).toBe(true);
  });

  it("returns true when bounded by punctuation", () => {
    // ".fuck." — match at 1..4
    expect(hasUnicodeWordBoundaries(".fuck.", 1, 4)).toBe(true);
  });

  it("returns false when immediately preceded by a letter", () => {
    // "afuck" — match at 1..4 → preceded by 'a' → not a boundary
    expect(hasUnicodeWordBoundaries("afuck", 1, 4)).toBe(false);
  });

  it("returns false when immediately followed by a letter", () => {
    // "fucka" — match at 0..3 → followed by 'a' → not a boundary
    expect(hasUnicodeWordBoundaries("fucka", 0, 3)).toBe(false);
  });

  it("returns false when preceded by a Unicode letter", () => {
    // "éfuck" — 'é' is a Unicode letter (1 code unit)
    expect(hasUnicodeWordBoundaries("éfuck", 1, 4)).toBe(false);
  });

  it("returns true when preceded and followed by non-word Unicode chars", () => {
    // "·fuck·" — middle dots are non-word
    expect(hasUnicodeWordBoundaries("·fuck·", 1, 4)).toBe(true);
  });

  it("returns true when bounded by emoji (supplementary-plane surrogate pair)", () => {
    // 🔥 is U+1F525, encoded as surrogate pair \uD83D\uDD25 (2 code units).
    // It is not a letter, so the term should have a valid boundary on both sides.
    // "🔥fuck🔥" — 🔥 occupies code units 0-1, "fuck" at 2..5, 🔥 at 6-7
    const input = "🔥fuck🔥";
    expect(hasUnicodeWordBoundaries(input, 2, 5)).toBe(true);
  });

  it("returns false when preceded by an emoji followed immediately by a letter", () => {
    // "🔥afuck" — 🔥 at 0-1, 'a' at 2, "fuck" at 3..6
    // The character before the match (index 2) is 'a', a letter → not a boundary
    const input = "🔥afuck";
    expect(hasUnicodeWordBoundaries(input, 3, 6)).toBe(false);
  });
});
