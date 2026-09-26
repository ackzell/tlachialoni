/// <reference types="vite/client" />

export interface LocalBrowserApi {
  getState(): Promise<unknown>;
  runCommand(id: string, arg?: unknown): Promise<{ ok: boolean; reason?: string }>;
  validateTarget(input: string): Promise<{ ok: boolean; url?: string; reason?: string }>;
  setVariant(variant: string): Promise<unknown>;
  setColorMode(mode: string): Promise<unknown>;
  previewVariant(variant: string | null): Promise<unknown>;
  setPaletteVisible(open: boolean): void;
  ready(): void;
  closeWindow(): Promise<unknown>;
  on(channel: string, callback: (payload: unknown) => void): () => void;
}

declare global {
  interface Window {
    localbrowser: LocalBrowserApi;
  }
}
