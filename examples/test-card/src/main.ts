import { createApp } from "vue";
import App from "./App.vue";
import { readAndBumpLoadProof } from "./lib/load-proof";
import { router } from "./router";
import "./styles.css";

function sessionStorageOrNull(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

const loadProof = readAndBumpLoadProof(sessionStorageOrNull(), Date.now());

createApp(App, { loadProof }).use(router).mount("#app");
