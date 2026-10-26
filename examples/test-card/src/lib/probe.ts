import { nextProbeUrl } from "./probe-url";

export interface LocalProbeResult {
  httpStatus: number;
  elapsedMs: number;
  message: string;
}

export async function runLocalProbe(baseUrl: string): Promise<LocalProbeResult> {
  const started = performance.now();
  const response = await fetch(nextProbeUrl(baseUrl), {
    cache: "no-store",
    headers: { accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const body = (await response.json()) as { message?: unknown };
  const message =
    typeof body.message === "string" && body.message.trim()
      ? body.message.trim()
      : "Local JSON answered.";

  return {
    httpStatus: response.status,
    elapsedMs: Math.max(0, Math.round(performance.now() - started)),
    message,
  };
}
