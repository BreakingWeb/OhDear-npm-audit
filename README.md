# ohdear-npm-audit

[Oh Dear Application Health](https://ohdear.app/docs/features/application-health-monitoring) check for critical npm vulnerabilities.

Designed for serverless platforms (Vercel, Netlify...) where you can't run `npm audit` at runtime. Instead, a dependency manifest is generated at build time and checked against the npm advisory API on each health check request.

> **Disclaimer:** This package is not affiliated with or endorsed by [Oh Dear](https://ohdear.app/). It is a community-built integration that implements the [Oh Dear application health check protocol](https://ohdear.app/docs/features/application-health-monitoring).

## Install

```bash
npm install ohdear-npm-audit
```

## Setup

### 1. Generate the dependency manifest at build time

**Option A — CLI (works with any framework)**

```json
"build": "ohdear-deps-manifest --output src/app/api/health/deps-manifest.json && next build"
```

**Option B — Next.js config wrapper**

```js
// next.config.mjs
import { withOhDearHealth } from "ohdear-npm-audit/next";

export default withOhDearHealth({
  // your Next.js config
});
```

The wrapper generates the manifest automatically when the config is evaluated (before the build starts). It also checks for critical vulnerabilities at build time and logs the results.

```js
withOhDearHealth(nextConfig, {
  output: "src/app/api/health/deps-manifest.json", // default
  checkOnBuild: true, // default — set to false to skip the build-time vulnerability check
});
```

### 2. Create the health check route

```ts
// src/app/api/health/route.ts (Next.js App Router)
import { createHealthHandler } from "ohdear-npm-audit";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — generated at build time by ohdear-npm-audit
import manifest from "./deps-manifest.json" with { type: "json" };

export const GET = createHealthHandler(manifest);
```

> **Note:** The `@ts-ignore` is needed because `deps-manifest.json` does not exist until the first build. Do not use `@ts-expect-error` — it will fail the build since the file exists at that point.

### 3. Set the environment variable

```
OHDEAR_HEALTH_SECRET=your-secret-here
```

This must match the secret configured in Oh Dear for your application health check.

### 4. Add to .gitignore

```gitignore
**/deps-manifest.json
```

## How it works

1. **Build time** — The CLI or Next.js wrapper runs `pnpm list` / `npm ls` to extract all production dependencies (including transitive) and writes them to a JSON manifest. When using the Next.js wrapper, a build-time vulnerability check is also performed and results are logged
2. **Runtime** — On each GET request, the handler verifies the Oh Dear secret header, POSTs the manifest to the [npm bulk advisory API](https://docs.npmjs.com/about-audit-reports), filters for critical severity, and returns the result in the [Oh Dear health check format](https://ohdear.app/docs/features/application-health-monitoring)

### Response format

```json
{
  "finishedAt": 1708300000,
  "checkResults": [
    {
      "name": "npm_vulnerabilities",
      "label": "NPM Critical Vulnerabilities",
      "status": "ok",
      "notificationMessage": "No critical npm vulnerabilities found.",
      "shortSummary": "0 critical",
      "meta": {}
    }
  ]
}
```

`status` is `"ok"` when there are no critical vulnerabilities, `"warning"` when the npm advisory API is unreachable, `"failed"` otherwise.

## API

### `createHealthHandler(manifest, options?)`

Returns a `(request: Request) => Promise<Response>` handler compatible with any framework that uses the Web Request/Response API (Next.js, Hono, SvelteKit...).

| Option | Default | Description |
|--------|---------|-------------|
| `secretEnvVar` | `"OHDEAR_HEALTH_SECRET"` | Environment variable name for the secret |
| `secretHeader` | `"oh-dear-health-check-secret"` | Request header name for the secret |

### `withOhDearHealth(nextConfig, options?)`

Next.js config wrapper that generates the manifest before the build.

| Option | Default | Description |
|--------|---------|-------------|
| `output` | `"src/app/api/health/deps-manifest.json"` | Output path for the manifest |
| `checkOnBuild` | `true` | Check for critical vulnerabilities at build time |

### CLI `ohdear-deps-manifest`

```bash
ohdear-deps-manifest --output path/to/deps-manifest.json
```

Defaults to `deps-manifest.json` in the current directory. Detects the package manager (pnpm or npm) from the lockfile.

> **Note:** Yarn is not supported. Use pnpm or npm.

## Contributing

### Architecture

```
src/
├── types.ts      # Shared types (DepsManifest, Vulnerability, HealthCheckResponse)
├── generate.ts   # Manifest generation logic (build-time, execSync)
├── handler.ts    # createHealthHandler factory — main export "."
├── next.ts       # withOhDearHealth wrapper — export "./next"
└── bin.ts        # CLI entry point — bin "ohdear-deps-manifest"
```

### Package manager detection

The manifest generator detects the package manager from the lockfile in the project root:

- `pnpm-lock.yaml` → `pnpm list --json --prod --depth Infinity`
- Otherwise → `npm ls --json --omit=dev --all`
- `yarn.lock` → error (not supported)

### Building

```bash
pnpm install
pnpm build
```

ESM only. TypeScript compiled with `tsc`, output in `dist/`.

## Credits

Made by [Breaking Web](https://www.breakingweb.com?utm_source=github&utm_medium=readme&utm_campaign=ohdear-npm-audit).

## License

MIT
