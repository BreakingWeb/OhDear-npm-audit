import { resolve, relative, dirname } from "node:path";
import { writeManifest } from "./generate.js";

export interface WithOhDearHealthOptions {
  /** Output path for the manifest, relative to project root.
   *  Default: "src/app/api/health/deps-manifest.json" */
  output?: string;
}

/**
 * Derive the App Router route path from the manifest output path.
 * e.g. "src/app/api/health/deps-manifest.json" → "/api/health"
 */
function deriveRoutePath(outputRelative: string): string | null {
  const dir = dirname(outputRelative);
  const match = dir.match(/(?:src\/)?app(\/.*)/);
  return match ? match[1] : null;
}

let didRun = false;

export function withOhDearHealth<T>(
  nextConfig: T,
  options?: WithOhDearHealthOptions,
): T {
  if (didRun) return nextConfig;
  didRun = true;

  const cwd = process.cwd();
  const outputRelative =
    options?.output ?? "src/app/api/health/deps-manifest.json";
  const output = resolve(cwd, outputRelative);

  try {
    const manifest = writeManifest(output, cwd);
    console.log(
      `ohdear-npm-audit: ${Object.keys(manifest).length} packages written → ${output}`,
    );

    const routePath = deriveRoutePath(relative(cwd, output));
    const domain = process.env.VERCEL_PROJECT_PRODUCTION_URL;
    if (routePath && domain) {
      console.log(`ohdear-npm-audit: Oh Dear health URL → https://${domain}${routePath}`);
    } else if (routePath) {
      console.log(`ohdear-npm-audit: Oh Dear health URL → https://<your-domain>${routePath}`);
    }

    if (process.env.OHDEAR_HEALTH_SECRET) {
      console.log("ohdear-npm-audit: OHDEAR_HEALTH_SECRET ✓");
    } else {
      console.warn("ohdear-npm-audit: OHDEAR_HEALTH_SECRET is not set — health check will reject all requests.");
    }
  } catch (err) {
    console.error("ohdear-npm-audit: failed to generate dependency manifest.");
    throw err;
  }

  return nextConfig;
}
