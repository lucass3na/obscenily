import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const bundlePath = new URL("../dist/browser/index.mjs", import.meta.url);
const file = readFileSync(bundlePath);
const gzip = gzipSync(file);

const toKb = (bytes) => `${(bytes / 1024).toFixed(2)} KB`;

console.log(
  JSON.stringify(
    {
      bundle: {
        rawBytes: file.length,
        raw: toKb(file.length),
        gzipBytes: gzip.length,
        gzip: toKb(gzip.length),
      },
    },
    null,
    2,
  ),
);
