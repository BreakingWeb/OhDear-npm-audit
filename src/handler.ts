import type {
  DepsManifest,
  HealthCheckResponse,
  Vulnerability,
} from "./types.js";

export type {
  DepsManifest,
  HealthCheckResponse,
  Vulnerability,
} from "./types.js";

const NPM_BULK_ADVISORY_URL =
  "https://registry.npmjs.org/-/npm/v1/security/advisories/bulk";

const FETCH_TIMEOUT_MS = 8_000;

export interface CreateHealthHandlerOptions {
  /** Environment variable name for the secret. Default: "OHDEAR_HEALTH_SECRET" */
  secretEnvVar?: string;
  /** Header name for the secret. Default: "oh-dear-health-check-secret" */
  secretHeader?: string;
}

function makeWarningResponse(message: string): HealthCheckResponse {
  return {
    finishedAt: Math.floor(Date.now() / 1000),
    checkResults: [
      {
        name: "npm_vulnerabilities",
        label: "NPM Critical Vulnerabilities",
        status: "warning",
        notificationMessage: message,
        shortSummary: "check error",
        meta: {},
      },
    ],
  };
}

export function createHealthHandler(
  manifest: DepsManifest,
  options?: CreateHealthHandlerOptions,
) {
  const envVar = options?.secretEnvVar ?? "OHDEAR_HEALTH_SECRET";
  const headerName = options?.secretHeader ?? "oh-dear-health-check-secret";

  let didWarn = false;

  return async (request: Request): Promise<Response> => {
    const secret = request.headers.get(headerName);
    if (!secret || secret !== process.env[envVar]) {
      if (!didWarn && !process.env[envVar]) {
        console.warn(
          `ohdear-npm-audit: ${envVar} is not set — all health check requests will be rejected with 401.`,
        );
        didWarn = true;
      }
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    let res: globalThis.Response;
    try {
      res = await fetch(NPM_BULK_ADVISORY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(manifest),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === "TimeoutError"
          ? "npm advisory API timed out"
          : "npm advisory API request failed";
      return Response.json(makeWarningResponse(message));
    }

    if (!res.ok) {
      return Response.json(
        makeWarningResponse(
          `npm advisory API returned HTTP ${res.status}`,
        ),
      );
    }

    let advisories: Record<
      string,
      Array<{ severity: string; title: string; url: string }>
    >;
    try {
      advisories = await res.json();
    } catch {
      return Response.json(
        makeWarningResponse("Failed to parse npm advisory response"),
      );
    }

    const critical: Vulnerability[] = [];
    for (const [pkg, entries] of Object.entries(advisories)) {
      for (const entry of entries) {
        if (entry.severity === "critical") {
          critical.push({ package: pkg, title: entry.title, url: entry.url });
        }
      }
    }

    const status = critical.length === 0 ? "ok" : "failed";
    const shortSummary = `${critical.length} critical`;
    const notificationMessage =
      critical.length === 0
        ? "No critical npm vulnerabilities found."
        : `Critical vulnerabilities in: ${critical.map((v) => v.package).join(", ")}`;

    const body: HealthCheckResponse = {
      finishedAt: Math.floor(Date.now() / 1000),
      checkResults: [
        {
          name: "npm_vulnerabilities",
          label: "NPM Critical Vulnerabilities",
          status,
          notificationMessage,
          shortSummary,
          meta: critical.length > 0 ? { vulnerabilities: critical } : {},
        },
      ],
    };

    return Response.json(body);
  };
}
