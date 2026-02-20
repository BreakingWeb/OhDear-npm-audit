import { resolve, relative, dirname } from "node:path";
import { existsSync, statSync, openSync, closeSync, unlinkSync } from "node:fs";
import { spawn } from "node:child_process";
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
      // Stale lock — remove before re-creating
      try { unlinkSync(lockPath); } catch { /* ignore */ }
    }
    // O_WRONLY | O_CREAT | O_EXCL — atomic create, fails if file already exists
    const fd = openSync(lockPath, "wx");
    closeSync(fd);
    return false;
  } catch {
    // Another worker created the lock between our check and open — skip
    return true;
  }
}

/**
 * Build the dependency chain from a package back to a direct dependency
 * using the reverse dependency map.
 */
function buildChainScript(): string {
  return [
    `function buildChain(pkg, reverseMap) {`,
    `  const queue = [[pkg]];`,
    `  const visited = new Set([pkg]);`,
    `  while (queue.length > 0) {`,
    `    const path = queue.shift();`,
    `    const current = path[path.length - 1];`,
    `    const parents = reverseMap[current];`,
    `    if (!parents || parents.length === 0) return path.slice().reverse();`,
    `    for (const parent of parents) {`,
    `      if (visited.has(parent)) continue;`,
    `      visited.add(parent);`,
    `      queue.push([...path, parent]);`,
    `    }`,
    `  }`,
    `  return [pkg];`,
    `}`,
  ].join("\n");
}

/**
 * Fire-and-forget subprocess to check the manifest against the npm advisory
 * API. Output is inherited so logs appear in the build output. Does not
 * block the build — the subprocess runs in parallel with Next.js compilation.
 */
function checkVulnerabilities(manifestPath: string): void {
  const safePath = JSON.stringify(manifestPath);
  const script = [
    `const fs = require("fs");`,
    `const data = JSON.parse(fs.readFileSync(${safePath}, "utf-8"));`,
    `const packages = data.packages;`,
    `const reverseMap = data.reverseDeps;`,
    buildChainScript(),
    `fetch("https://registry.npmjs.org/-/npm/v1/security/advisories/bulk", {`,
    `  method: "POST",`,
    `  headers: { "Content-Type": "application/json" },`,
    `  body: JSON.stringify(packages),`,
    `  signal: AbortSignal.timeout(8000),`,
    `})`,
    `.then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })`,
    `.then(data => {`,
    `  const crits = [];`,
    `  for (const [pkg, entries] of Object.entries(data)) {`,
    `    for (const e of entries) {`,
    `      if (e.severity !== "critical") continue;`,
    `      const versions = packages[pkg] || [];`,
    `      const chain = buildChain(pkg, reverseMap);`,
    `      const versionStr = versions.join(", ");`,
    `      const chainStr = chain.length > 1 ? " (via " + chain.join(" \\u2192 ") + ")" : "";`,
    `      let line = "  - " + pkg + "@" + versionStr + chainStr + ": " + e.title;`,
    `      if (e.vulnerable_versions) {`,
    `        line += "\\n    vulnerable: " + e.vulnerable_versions + " \\u2014 " + e.url;`,
    `      }`,
    `      crits.push(line);`,
    `    }`,
    `  }`,
    `  if (crits.length > 0) {`,
    `    console.warn("ohdear-npm-audit: " + crits.length + " critical vulnerabilities:");`,
    `    crits.forEach(c => console.warn(c));`,
    `  } else {`,
    `    console.log("ohdear-npm-audit: no critical vulnerabilities \\u2713");`,
    `  }`,
    `})`,
    `.catch(err => console.warn("ohdear-npm-audit: build-time vulnerability check failed:", err.message || err));`,
  ].join("\n");

  const child = spawn("node", ["-e", script], {
    stdio: "inherit",
    detached: true,
  });
  child.unref();
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
      `ohdear-npm-audit: ${Object.keys(manifest.packages).length} packages written → ${output}`,
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
    console.error(
      "ohdear-npm-audit: failed to generate dependency manifest.",
      err instanceof Error ? err.message : err,
    );
    throw err;
  }

  return nextConfig;
}
