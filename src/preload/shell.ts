import { contextBridge, ipcRenderer } from "electron";

type Listener = (payload: unknown) => void;

const listeners = new Map<string, Set<Listener>>();

function subscribe(channel: string, callback: Listener): () => void {
  let set = listeners.get(channel);
  if (!set) {
    set = new Set();
    listeners.set(channel, set);
    ipcRenderer.on(channel, (_event, payload) => {
      for (const fn of listeners.get(channel) ?? []) fn(payload);
    });
  }
  set.add(callback);
  return () => {
    listeners.get(channel)?.delete(callback);
  };
}

const api = {
  getState: () => ipcRenderer.invoke("state:get"),
  runCommand: (id: string, arg?: unknown) => ipcRenderer.invoke("command:run", { id, arg }),
  validateTarget: (input: string) => ipcRenderer.invoke("target:validate", { input }),
  setVariant: (variant: string) => ipcRenderer.invoke("theme:setVariant", { variant }),
  setColorMode: (mode: string) => ipcRenderer.invoke("theme:setColorMode", { mode }),
  previewVariant: (variant: string | null) =>
    ipcRenderer.invoke("theme:previewVariant", { variant }),
  setPaletteVisible: (open: boolean) => ipcRenderer.send("palette:visibility", { open }),
  ready: () => ipcRenderer.send("shell:ready"),
  settled: () => ipcRenderer.send("shell:settled"),
  closeWindow: () => ipcRenderer.invoke("window:close"),
  on: subscribe,
};

contextBridge.exposeInMainWorld("tlachialoni", api);

export type TlachialoniApi = typeof api;
