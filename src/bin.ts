#!/usr/bin/env node

import { resolve } from "node:path";
import { writeManifest } from "./generate.js";

const args = process.argv.slice(2);
let output = "deps-manifest.json";

const outputIdx = args.indexOf("--output");
if (outputIdx !== -1 && args[outputIdx + 1]) {
  output = args[outputIdx + 1];
}

const cwd = process.cwd();
const outputPath = resolve(cwd, output);
const manifest = writeManifest(outputPath, cwd);

console.log(
  `deps-manifest.json: ${Object.keys(manifest).length} packages written`,
);
