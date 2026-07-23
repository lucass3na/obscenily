import { describe, expect, it } from "vitest";
import {
  canonicalizeTerm,
  isValidNormalizedTerm,
  normalizeMatcherTerm,
  normalizeTerm,
  stripDiacritics,
  toMatcherInput,
  toNormalizedInput,
} from "../../src/utils/normalize";

describe("toNormalizedInput", () => {
  it("lowercases ASCII", () => {
    expect(toNormalizedInput("Hello World")).toBe("hello world");
  });

  it("applies NFKC: expands fi-ligature", () => {
    // U+FB01 "ﬁ" → "fi"
    expect(toNormalizedInput("\uFB01nk")).toBe("fink");
  });

  it("applies NFKC: normalises full-width letters", () => {
    // ｂｉｔｃｈ (full-width)
    expect(toNormalizedInput("ｂｉｔｃｈ")).toBe("bitch");
  });

  it("strips combining diacritics after NFKC", () => {
    // é → e + combining acute after NFKC → strip mark → e
    expect(toNormalizedInput("école")).toBe("ecole");
  });

  it("strips diacritics from Spanish characters", () => {
    expect(toNormalizedInput("Año")).toBe("ano");
  });

  it("handles empty string", () => {
    expect(toNormalizedInput("")).toBe("");
  });

  it("preserves numbers", () => {
    expect(toNormalizedInput("p4ssw0rd")).toBe("p4ssw0rd");
  });

  it("preserves non-letter non-number chars like dots and spaces", () => {
    expect(toNormalizedInput("a.b c")).toBe("a.b c");
  });
});

describe("stripDiacritics", () => {
  it("strips common Spanish/French diacritics", () => {
    expect(stripDiacritics("áéíóúüñ")).toBe("aeiouun");
  });

  it("strips Polish diacritics", () => {
    // ą → a+ogonek
    expect(stripDiacritics("ąćę")).toBe("ace");
  });

  it("leaves plain ASCII unchanged", () => {
    expect(stripDiacritics("hello")).toBe("hello");
  });
});

describe("canonicalizeTerm", () => {
  it("replaces leet digits", () => {
    // 4→a, 3→e, 1→i/l depending on mapping
    expect(canonicalizeTerm("b1tch")).toBe("bitch");
    expect(canonicalizeTerm("@ss")).toBe("ass");
    expect(canonicalizeTerm("sh1t")).toBe("shit");
  });

  it("drops non-alphanumeric separators", () => {
    expect(canonicalizeTerm("b.i.t.c.h")).toBe("bitch");
    expect(canonicalizeTerm("f-u-c-k")).toBe("fuck");
  });

  it("handles spaces by dropping them", () => {
    expect(canonicalizeTerm("son of a bitch")).toBe("sonofabitch");
  });

  it("does not produce empty for valid input", () => {
    expect(canonicalizeTerm("hello")).toBe("hello");
  });

  it("returns empty for all-punctuation input", () => {
    expect(canonicalizeTerm("...---")).toBe("");
  });
});

describe("normalizeTerm", () => {
  it("combines NFKC/lowercase + diacritic stripping + leet replacement", () => {
    expect(normalizeTerm("B1TCH")).toBe("bitch");
    expect(normalizeTerm("@SS")).toBe("ass");
  });

  it("handles accented input", () => {
    expect(normalizeTerm("véhicule")).toBe("vehicule");
  });

  it("expands full-width and applies leet", () => {
    // ｂ1tch → "b1tch" after NFKC → "bitch" after canonicalize
    expect(normalizeTerm("ｂ1tch")).toBe("bitch");
  });
});

describe("toMatcherInput", () => {
  it("resolves confusable Cyrillic letters to the same skeleton the matcher sees", () => {
    expect(toMatcherInput("мудак")).toBe("myaak");
  });
});

describe("normalizeMatcherTerm", () => {
  it("builds matcher-ready normalized terms for non-Latin scripts", () => {
    expect(normalizeMatcherTerm("мудак")).toBe("myaak");
  });
});

describe("isValidNormalizedTerm", () => {
  it("returns true for terms above the minimum length", () => {
    expect(isValidNormalizedTerm("ass")).toBe(true);
    expect(isValidNormalizedTerm("fuck")).toBe(true);
  });

  it("returns false for terms shorter than 2 chars (minimum is 2)", () => {
    expect(isValidNormalizedTerm("")).toBe(false);
    expect(isValidNormalizedTerm("a")).toBe(false);
  });

  it("returns true for 2-char terms (at the minimum boundary)", () => {
    expect(isValidNormalizedTerm("ab")).toBe(true);
  });
});
