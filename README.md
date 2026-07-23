# obscenily

A reusable language-detection package that combines:

- multilingual dictionaries from `@2toad/profanity`
- robust English matching/normalization from `obscenity`
- multilingual dictionary matching for non-English languages

> In the examples below, we use **formal/neutral custom words** only, so you can see behavior safely.

## Install

```bash
npm install obscenily
```

## Quick start

```ts
import { createOffensiveLanguageDetector } from "obscenily";

const detector = createOffensiveLanguageDetector({
  languages: ["en", "es", "pt"],
  customTerms: {
    custom: ["vehicle"],
    es: ["vehículo"],
  },
});

detector.hasOffensiveLanguage("v.e.h.i.c.l.e"); // true
detector.detect("texto con vehículo");
```

## API

## Factory

### `createOffensiveLanguageDetector(options?)`

Creates and returns an `OffensiveLanguageDetector`.

## Class

### `new OffensiveLanguageDetector(options?)`

### `OffensiveLanguageDetectorOptions`

- `languages?: readonly string[]`  
  Languages to load from the base dictionary.  
  Default: all supported languages.

- `customTerms?: OffensiveTermInput`  
  Extra terms to detect.

- `excludedTerms?: readonly string[]`  
  Terms to remove from detection after normalization.

### `OffensiveTermInput`

- `string`
- `readonly string[]`
- `Record<string, readonly string[]>` (language bucket -> terms)

### Methods

- `hasOffensiveLanguage(text: string): boolean`  
  Fast true/false check.

- `detect(text: string): DetectionMatch[]`  
  Returns all matches with metadata and positions.

- `censor(text: string, options?: CensorOptions): string`  
  Replaces detected segments with grawlix symbols.

- `addCustomTerms(input: OffensiveTermInput): void`  
  Adds custom terms immediately and rebuilds internals.

- `addTerms(input: OffensiveTermInput): void`  
  Alias of `addCustomTerms`.

- `removeTerms(terms: readonly string[]): void`  
  Excludes normalized terms and rebuilds internals.

- `getSupportedLanguages(): readonly string[]`  
  Returns supported dictionary language codes.

- `getCompiledTerms(): OffensiveTermRecord[]`  
  Returns currently compiled terms.

- `getTotalCompiledTerms(): number`  
  Returns total compiled term count.

### `CensorOptions`

- `grawlix?: string` (default: `@#$%&!`)
- `grawlixChar?: string` (fallback when `grawlix` is empty, default: `*`)

### `DetectionMatch` (shape)

- `term: string`
- `normalizedTerm: string`
- `language: string`
- `source: "dictionary" | "custom"`
- `termId: number`
- `startIndex: number`
- `endIndex: number`
- `matchLength: number`
- `value: string`

## Supported base dictionary languages

`en, ar, de, es, fr, it, hi, ja, ko, pt, ru, zh`

## Simple examples (formal words only)

### 1) Obfuscated forms (English)

```ts
import { OffensiveLanguageDetector } from "obscenily";

const detector = new OffensiveLanguageDetector({
  languages: ["en"],
  customTerms: ["vehicle"],
});

detector.hasOffensiveLanguage("v.e.h.i.c.l.e"); // true
detector.hasOffensiveLanguage("ｖｅｈｉｃｌｅ"); // true
detector.hasOffensiveLanguage("veh1cle"); // true
```

### 2) Accent variants (Spanish)

```ts
import { OffensiveLanguageDetector } from "obscenily";

const detector = new OffensiveLanguageDetector({
  languages: ["es"],
  customTerms: ["vehículo"],
});

detector.hasOffensiveLanguage("vehículo"); // true
detector.hasOffensiveLanguage("vehiculo"); // true
```

### 3) Multi-word phrase (Portuguese)

```ts
import { OffensiveLanguageDetector } from "obscenily";

const detector = new OffensiveLanguageDetector({
  languages: ["pt"],
  customTerms: ["bom dia"],
});

detector.hasOffensiveLanguage("bom.dia"); // true
```

### 4) Censor output (grawlix)

```ts
import { OffensiveLanguageDetector } from "obscenily";

const detector = new OffensiveLanguageDetector({
  languages: ["es"],
  customTerms: ["vehículo"],
});

detector.censor("texto con vehículo");
// "texto con @#$%&!@#"
```

## Multilingual examples (formal terms)

```ts
import { OffensiveLanguageDetector } from "obscenily";

const examples = [
  { lang: "en", term: "vehicle", sample: "v.e.h.i.c.l.e" },
  { lang: "es", term: "vehículo", sample: "vehículo" },
  { lang: "pt", term: "veículo", sample: "veículo" },
  { lang: "fr", term: "véhicule", sample: "véhicule" },
  { lang: "de", term: "fahrzeug", sample: "fahrzeug" },
  { lang: "it", term: "veicolo", sample: "veicolo" },
  { lang: "ar", term: "سيارة", sample: "سيارة" },
  { lang: "hi", term: "वाहन", sample: "वाहन" },
  { lang: "ja", term: "くるま", sample: "くるま" },
  { lang: "ko", term: "차량", sample: "차량" },
  { lang: "ru", term: "машина", sample: "машина" },
  { lang: "zh", term: "车辆", sample: "车辆" },
] as const;

for (const item of examples) {
  const detector = new OffensiveLanguageDetector({
    languages: [item.lang],
    customTerms: [item.term],
  });

  detector.hasOffensiveLanguage(item.sample); // true
}
```

## Useful notes

- English uses `obscenity`'s recommended matcher pipeline, so it handles common obfuscations and Unicode variants.
- Non-English languages use the plain dictionary matcher plus normalization, so they are intentionally stricter and do not try to recover separator-based evasions.
- `detect()` returns a `value` field with the exact matched text and `startIndex`/`endIndex` offsets into the *normalised* input. Use `match.value` for display or logging; do not slice the original string with those indices since NFKC normalisation may change string length (e.g. ligatures, full-width characters).
- `censor()` always returns the NFC-normalised form of the input (matches or not), so its output is safe to pass back to further processing.
- `censor()` applies replacements by merged intervals (overlaps are handled safely).
- If you want to avoid certain false positives, add terms to `excludedTerms`.

## Scripts

```bash
npm run build
npm run test
npm run size:browser
npm run bench
```
