export interface DepsManifest {
  packages: Record<string, string[]>;
  reverseDeps: Record<string, string[]>;
}

export interface Vulnerability {
  package: string;
  installedVersions: string[];
  title: string;
  url: string;
  vulnerableVersions: string;
  dependencyChain?: string[];
}

export interface HealthCheckResult {
  name: string;
  label: string;
  status: "ok" | "warning" | "failed" | "crashed";
  notificationMessage: string;
  shortSummary: string;
  meta: Record<string, unknown>;
}

export interface HealthCheckResponse {
  finishedAt: number;
  checkResults: HealthCheckResult[];
}
