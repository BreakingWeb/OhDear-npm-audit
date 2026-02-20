import { execSync } from "node:child_process";
import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { DepsManifest } from "./types.js";

function detectPackageManager(cwd: string): "pnpm" | "npm" {
  if (existsSync(resolve(cwd, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(resolve(cwd, "yarn.lock"))) {
    throw new Error(
      "ohdear-npm-audit: yarn is not supported. Use pnpm or npm.",
    );
  }
  return "npm";
}

interface DepNode {
  version?: string;
  dependencies?: Record<string, DepNode>;
}

function walkDeps(
  deps: Record<string, DepNode> | undefined,
  acc: Record<string, Set<string>>,
) {
  if (!deps) return;
  for (const [name, info] of Object.entries(deps)) {
    if (!info.version) continue;
    if (!acc[name]) acc[name] = new Set();
    acc[name].add(info.version);
    walkDeps(info.dependencies, acc);
  }
}

// execSync throws on non-zero exit codes, but npm ls exits with code 1
// on missing/extraneous packages while still writing valid JSON to stdout.
function execCommand(command: string, cwd: string): string {
  const opts = { cwd, encoding: "utf-8" as const, maxBuffer: 50 * 1024 * 1024 };
  try {
    return execSync(command, opts);
  } catch (err: unknown) {
    const stdout = (err as { stdout?: string }).stdout;
    if (stdout) return stdout;
    throw err;
  }
}

export function generateManifest(cwd: string): DepsManifest {
  const pm = detectPackageManager(cwd);

  let raw: string;
  switch (pm) {
    case "pnpm":
      raw = execCommand("pnpm list --json --prod --depth Infinity", cwd);
      break;
    case "npm":
      raw = execCommand("npm ls --json --omit=dev --all", cwd);
      break;
  }

  const parsed = JSON.parse(raw);
  const tree = Array.isArray(parsed) ? parsed[0] : parsed;

  const acc: Record<string, Set<string>> = {};
  walkDeps(tree.dependencies, acc);

  const manifest: DepsManifest = {};
  for (const [name, versions] of Object.entries(acc)) {
    manifest[name] = [...versions];
  }

  return manifest;
}

export function writeManifest(outputPath: string, cwd: string): DepsManifest {
  const manifest = generateManifest(cwd);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(manifest, null, 2) + "\n");
  return manifest;
}
