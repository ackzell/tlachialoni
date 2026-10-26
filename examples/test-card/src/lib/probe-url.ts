let probeSequence = 0;

export function buildProbeUrl(baseUrl: string, nonce: string): string {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return `${base}probe.json?at=${encodeURIComponent(nonce)}`;
}

export function nextProbeUrl(baseUrl: string, now = Date.now()): string {
  probeSequence += 1;
  return buildProbeUrl(baseUrl, `${now}-${probeSequence}`);
}
