import { describe, expect, it } from "vitest";
import { buildGrawlix, buildOffsetMap, mergeIntervals } from "../../src/utils/censor";

describe("buildGrawlix", () => {
  it("cycles through grawlix chars to fill length", () => {
    expect(buildGrawlix(5, "@#$%", "*")).toBe("@#$%@");
    expect(buildGrawlix(3, "@#$%", "*")).toBe("@#$");
  });

  it("repeats single char when grawlix is one char", () => {
    expect(buildGrawlix(4, "*", "*")).toBe("****");
  });

  it("uses fallbackChar when grawlix is empty string", () => {
    expect(buildGrawlix(3, "", "*")).toBe("***");
  });

  it("returns empty string for length 0", () => {
    expect(buildGrawlix(0, "@#$%", "*")).toBe("");
  });
});

describe("mergeIntervals", () => {
  it("returns empty for empty input", () => {
    expect(mergeIntervals([])).toEqual([]);
  });

  it("returns unchanged single interval", () => {
    expect(mergeIntervals([{ start: 2, end: 5 }])).toEqual([{ start: 2, end: 5 }]);
  });

  it("merges overlapping intervals", () => {
    expect(mergeIntervals([{ start: 0, end: 3 }, { start: 2, end: 6 }])).toEqual([{ start: 0, end: 6 }]);
  });

  it("merges adjacent (touching) intervals", () => {
    // end=3, next start=4 → 3+1=4 so they touch → merge
    expect(mergeIntervals([{ start: 0, end: 3 }, { start: 4, end: 7 }])).toEqual([{ start: 0, end: 7 }]);
  });

  it("keeps separated intervals distinct", () => {
    const result = mergeIntervals([{ start: 0, end: 2 }, { start: 5, end: 8 }]);
    expect(result).toEqual([{ start: 0, end: 2 }, { start: 5, end: 8 }]);
  });

  it("merges three overlapping intervals into one", () => {
    const result = mergeIntervals([{ start: 0, end: 4 }, { start: 2, end: 6 }, { start: 5, end: 9 }]);
    expect(result).toEqual([{ start: 0, end: 9 }]);
  });
});

describe("buildOffsetMap", () => {
  it("produces identity map for ASCII input", () => {
    const { normToOrigStart, normToOrigEnd } = buildOffsetMap("abc");
    // 'a' normalises to 'a' (1 char), 'b' → 'b', 'c' → 'c'
    expect(normToOrigStart).toEqual([0, 1, 2]);
    expect(normToOrigEnd).toEqual([0, 1, 2]);
  });

  it("maps expanded fi-ligature positions back to the ligature offset", () => {
    // U+FB01 (ﬁ) normalises to 'fi' — 2 normalised positions → 1 original position (0)
    // followed by 'n' at original position 1 (in JS, U+FB01 is a single code unit)
    const input = "\uFB01n";
    const { normToOrigStart, normToOrigEnd } = buildOffsetMap(input);
    // normalised: 'f', 'i', 'n'
    expect(normToOrigStart[0]).toBe(0); // 'f' came from position 0 (the ligature)
    expect(normToOrigStart[1]).toBe(0); // 'i' also came from position 0 (the ligature)
    expect(normToOrigStart[2]).toBe(1); // 'n' came from position 1
    expect(normToOrigEnd[0]).toBe(0);
    expect(normToOrigEnd[1]).toBe(0);
    expect(normToOrigEnd[2]).toBe(1);
  });

  it("handles standalone combining mark (orphan acute U+0301) without a crash", () => {
    // U+0301 (combining acute) normalises to empty string after stripDiacritics
    // — no entry should be pushed for it, and the following char maps correctly.
    const input = "\u0301a"; // orphan combining mark then 'a'
    expect(() => buildOffsetMap(input)).not.toThrow();
    const { normToOrigStart, normToOrigEnd } = buildOffsetMap(input);
    // normalised form is just 'a'; it maps to original position 1 (the 'a' codeunit)
    expect(normToOrigStart.length).toBe(1);
    expect(normToOrigStart[0]).toBe(1);
    expect(normToOrigEnd[0]).toBe(1);
  });

  it("handles empty string", () => {
    const { normToOrigStart, normToOrigEnd } = buildOffsetMap("");
    expect(normToOrigStart).toEqual([]);
    expect(normToOrigEnd).toEqual([]);
  });
});
