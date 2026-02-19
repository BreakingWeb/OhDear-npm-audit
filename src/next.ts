import { resolve } from "node:path";
import { writeManifest } from "./generate.js";

export interface WithOhDearHealthOptions {
  /** Output path for the manifest, relative to project root.
   *  Default: "src/app/api/health/deps-manifest.json" */
  output?: string;
}

export function withOhDearHealth<T>(
  nextConfig: T,
  options?: WithOhDearHealthOptions,
): T {
  const cwd = process.cwd();
  const output = resolve(
    cwd,
    options?.output ?? "src/app/api/health/deps-manifest.json",
  );

  try {
    const manifest = writeManifest(output, cwd);
    console.log(
      `ohdear-npm-audit: ${Object.keys(manifest).length} packages written → ${output}`,
    );
  } catch (err) {
    console.error("ohdear-npm-audit: failed to generate dependency manifest.");
    throw err;
  }

  return nextConfig;
}
