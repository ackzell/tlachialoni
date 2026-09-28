/**
 * Chrome Web Store package download.
 *
 * Electron can only load unpacked extensions, so a store install downloads the
 * `.crx` container from Google's update endpoint and hands it to `crx.ts` for
 * extraction. The endpoint is unofficial; the folder install path is the
 * durable fallback.
 */

const UPDATE_URL = "https://clients2.google.com/service/update2/crx";

/** Builds the update-endpoint URL for an extension ID. */
export function crxDownloadUrl(id: string, chromeVersion: string): string {
  const params = new URLSearchParams({
    response: "redirect",
    prodversion: chromeVersion,
    acceptformat: "crx2,crx3",
    x: `id=${id}&uc`,
  });
  return `${UPDATE_URL}?${params.toString()}`;
}

export type DownloadProgress = (received: number, total: number | null) => void;

/**
 * Downloads a package, reporting byte progress. `total` is null when the
 * response has no usable content length, so the caller can show an
 * indeterminate indicator.
 */
export async function downloadCrx(url: string, onProgress: DownloadProgress): Promise<Buffer> {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`The store returned HTTP ${response.status}`);
  }
  if (!response.body) {
    throw new Error("The store returned no package data");
  }

  const header = response.headers.get("content-length");
  const parsed = header ? Number(header) : NaN;
  const total = Number.isFinite(parsed) && parsed > 0 ? parsed : null;

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    chunks.push(value);
    received += value.byteLength;
    onProgress(received, total);
  }

  if (received === 0) throw new Error("The store returned an empty package");
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
}
