import { execSync } from "node:child_process";
import {
  existsSync,
  writeFileSync,
  readFileSync,
  unlinkSync,
  mkdirSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
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

type ReverseDeps = Record<string, Set<string>>;

function walkDeps(
  deps: Record<string, DepNode> | undefined,
  acc: Record<string, Set<string>>,
  reverseDeps: ReverseDeps,
  parent: string,
) {
  if (!deps) return;
  for (const [name, info] of Object.entries(deps)) {
    if (!info.version) continue;
    if (!acc[name]) acc[name] = new Set();
    acc[name].add(info.version);
    if (parent !== "root") {
      if (!reverseDeps[name]) reverseDeps[name] = new Set();
      reverseDeps[name].add(parent);
    }
    walkDeps(info.dependencies, acc, reverseDeps, name);
  }
}

// Pipe stdout to a temp file to avoid maxBuffer limits on large dependency
// trees. The `|| true` handles npm ls exiting with code 1 on
// missing/extraneous packages while still writing valid JSON.
function execToFile(command: string, cwd: string): string {
  const tmp = resolve(tmpdir(), `ohdear-npm-audit-${Date.now()}.json`);
  try {
    execSync(`${command} > "${tmp}" 2>/dev/null || true`, {
      cwd,
      stdio: "ignore",
    });
    const content = readFileSync(tmp, "utf-8");
    if (!content.trim()) {
      throw new Error(
        `ohdear-npm-audit: "${command}" produced no output. Is the package manager installed?`,
      );
    }
    return content;
  } finally {
    try {
      unlinkSync(tmp);
    } catch {
      // ignore cleanup errors
    }
  }
}

export interface GenerateResult {
  manifest: DepsManifest;
  reverseDeps: Record<string, string[]>;
}

export function generateManifest(cwd: string): GenerateResult {
  const pm = detectPackageManager(cwd);
  console.log(`ohdear-npm-audit: detected package manager → ${pm}`);

  let raw: string;
  const command =
    pm === "pnpm"
      ? "pnpm list --json --prod --depth Infinity"
      : "npm ls --json --omit=dev --all";
  raw = execToFile(command, cwd);

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      `ohdear-npm-audit: failed to parse "${command}" output (${raw.length} bytes). First 200 chars: ${raw.slice(0, 200)}`,
    );
  }
  const tree = Array.isArray(parsed) ? parsed[0] : parsed;

  const acc: Record<string, Set<string>> = {};
  const reverseAcc: ReverseDeps = {};
  walkDeps(tree.dependencies, acc, reverseAcc, "root");

  const manifest: DepsManifest = {};
  for (const [name, versions] of Object.entries(acc)) {
    manifest[name] = [...versions];
  }

  const reverseDeps: Record<string, string[]> = {};
  for (const [name, parents] of Object.entries(reverseAcc)) {
    reverseDeps[name] = [...parents];
  }

  return { manifest, reverseDeps };
}

export interface WriteManifestResult {
  manifest: DepsManifest;
  reverseMapPath: string;
}

export function writeManifest(outputPath: string, cwd: string): WriteManifestResult {
  const { manifest, reverseDeps } = generateManifest(cwd);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(manifest, null, 2) + "\n");

  const reverseMapPath = resolve(dirname(outputPath), "deps-reverse-map.json");
  writeFileSync(reverseMapPath, JSON.stringify(reverseDeps, null, 2) + "\n");

  return { manifest, reverseMapPath };
}
