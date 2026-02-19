export type DepsManifest = Record<string, string[]>;

export interface Vulnerability {
  package: string;
  title: string;
  url: string;
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
