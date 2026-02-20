# ohdear-npm-audit

Oh Dear Application Health check for npm audit critical vulnerabilities. Works on serverless (no shell at runtime).

## Architecture

```
src/
├── types.ts      # Shared types
├── generate.ts   # Build-time manifest generation (execSync pnpm/npm)
├── handler.ts    # createHealthHandler() — export "."
├── next.ts       # withOhDearHealth() — export "./next" (lockfile dedup, build-time vuln check)
└── bin.ts        # CLI ohdear-deps-manifest
```

## Exports

| Export | Content |
|--------|---------|
| `ohdear-npm-audit` | `createHealthHandler(manifest, options?)` |
| `ohdear-npm-audit/next` | `withOhDearHealth(nextConfig, options?)` |
| bin `ohdear-deps-manifest` | CLI: `--output <path>` (default: `deps-manifest.json`) |

## Conventions

- CJS output (compatible Next.js 14–16, both `require()` and `import`)
- Build with `tsc`, output in `dist/`
- Auto-detect package manager (pnpm or npm) via lockfile — yarn not supported
- Expected env var: `OHDEAR_HEALTH_SECRET`
- `next` is an optional peerDependency (only for `./next`)
- Node >= 20 required (`Response.json()`)
- Next.js wrapper uses temp lockfile to run once across workers
- Build-time vulnerability check via subprocess (enabled by default, `checkOnBuild: false` to disable)

## Commands

- `pnpm build` — compile TypeScript
