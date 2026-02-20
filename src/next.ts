import { resolve, relative, dirname } from "node:path";
import { existsSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { writeManifest } from "./generate.js";

export interface WithOhDearHealthOptions {
  /** Output path for the manifest, relative to project root.
   *  Default: "src/app/api/health/deps-manifest.json" */
  output?: string;
  /** Check for critical vulnerabilities at build time. Default: true */
  checkOnBuild?: boolean;
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

/**
 * Next.js re-evaluates the config file in multiple worker processes during a
 * single build. We use a temp lockfile with a short TTL so the manifest is
 * generated and logged exactly once per build, while still regenerating on
 * the next build.
 */
function hasRecentLock(output: string): boolean {
  const hash = createHash("md5").update(output).digest("hex").slice(0, 8);
  const lockPath = resolve(tmpdir(), `ohdear-npm-audit-${hash}.lock`);

  try {
    if (existsSync(lockPath)) {
      const age = Date.now() - statSync(lockPath).mtimeMs;
      if (age < 30_000) return true;
    }
  } catch {
    // ignore — regenerate
  }

  writeFileSync(lockPath, String(process.pid));
  return false;
}

/**
 * Spawn a subprocess to check the manifest against the npm advisory API.
 * Non-blocking for the build: silently catches errors.
 */
function checkVulnerabilities(manifestPath: string): void {
  const script = [
    `const fs = require("fs");`,
    `const manifest = JSON.parse(fs.readFileSync(process.argv[1], "utf-8"));`,
    `fetch("https://registry.npmjs.org/-/npm/v1/security/advisories/bulk", {`,
    `  method: "POST",`,
    `  headers: { "Content-Type": "application/json" },`,
    `  body: JSON.stringify(manifest),`,
    `  signal: AbortSignal.timeout(8000),`,
    `})`,
    `.then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })`,
    `.then(data => {`,
    `  const crits = [];`,
    `  for (const [pkg, entries] of Object.entries(data)) {`,
    `    for (const e of entries) {`,
    `      if (e.severity === "critical") crits.push(pkg + ": " + e.title);`,
    `    }`,
    `  }`,
    `  if (crits.length > 0) {`,
    `    console.warn("ohdear-npm-audit: " + crits.length + " critical vulnerabilities:");`,
    `    crits.forEach(c => console.warn("  - " + c));`,
    `  } else {`,
    `    console.log("ohdear-npm-audit: no critical vulnerabilities ✓");`,
    `  }`,
    `})`,
    `.catch(() => {});`,
  ].join("\n");

  spawnSync("node", ["-e", script, manifestPath], {
    encoding: "utf-8",
    stdio: "inherit",
    timeout: 10_000,
  });
}

export function withOhDearHealth<T>(
  nextConfig: T,
  options?: WithOhDearHealthOptions,
): T {
  const cwd = process.cwd();
  const outputRelative =
    options?.output ?? "src/app/api/health/deps-manifest.json";
  const output = resolve(cwd, outputRelative);

  if (hasRecentLock(output)) return nextConfig;

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

    if (options?.checkOnBuild !== false) {
      checkVulnerabilities(output);
    }
  } catch (err) {
    console.error("ohdear-npm-audit: failed to generate dependency manifest.");
    throw err;
  }

  return nextConfig;
}
