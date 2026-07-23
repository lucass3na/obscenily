import { performance } from "node:perf_hooks";
import { createOffensiveLanguageDetector } from "../dist/index.js";

const detector = createOffensiveLanguageDetector({
  languages: ["en", "es", "pt"],
  customTerms: ["mycustomterm"],
});

const samples = [
  "normal harmless sentence",
  "f.u.u.u.c.k obfuscated english profanity",
  "texto con una palabra ofensiva",
  "esse texto tem uma palavra ofensiva",
  "mycustomterm should be detected too",
  "frase limpia sin problemas",
];

const warmupIterations = 5_000;
const benchmarkIterations = 50_000;

for (let i = 0; i < warmupIterations; i += 1) {
  detector.hasOffensiveLanguage(samples[i % samples.length]);
}

const start = performance.now();
let hits = 0;

for (let i = 0; i < benchmarkIterations; i += 1) {
  if (detector.hasOffensiveLanguage(samples[i % samples.length])) {
    hits += 1;
  }
}

const end = performance.now();
const elapsedMs = end - start;
const opsPerSecond = (benchmarkIterations / elapsedMs) * 1000;

console.log(
  JSON.stringify(
    {
      benchmarkIterations,
      elapsedMs: Number(elapsedMs.toFixed(2)),
      opsPerSecond: Math.round(opsPerSecond),
      offensiveDetections: hits,
      totalCompiledTerms: detector.getTotalCompiledTerms(),
    },
    null,
    2,
  ),
);
