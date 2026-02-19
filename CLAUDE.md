# ohdear-npm-audit

Oh Dear Application Health check for npm audit critical vulnerabilities. Works on serverless (no shell at runtime).

## Architecture

```
src/
├── types.ts      # Shared types
├── generate.ts   # Build-time manifest generation (execSync pnpm/npm)
├── handler.ts    # createHealthHandler() — export "."
├── next.ts       # withOhDearHealth() — export "./next"
└── bin.ts        # CLI ohdear-deps-manifest
```

## Exports

| Export | Content |
|--------|---------|
| `ohdear-npm-audit` | `createHealthHandler(manifest, options?)` |
| `ohdear-npm-audit/next` | `withOhDearHealth(nextConfig, options?)` |
| bin `ohdear-deps-manifest` | CLI: `--output <path>` (default: `deps-manifest.json`) |

## Conventions

- ESM only (`"type": "module"`)
- Build with `tsc`, output in `dist/`
- Auto-detect package manager (pnpm or npm) via lockfile — yarn not supported
- Expected env var: `OHDEAR_HEALTH_SECRET`
- `next` is an optional peerDependency (only for `./next`)
- Node >= 20 required (`Response.json()`)

## Commands

- `pnpm build` — compile TypeScript
