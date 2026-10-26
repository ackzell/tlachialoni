<script setup lang="ts">
import { computed, ref } from "vue";
import { normalizedEditPoints, type PageId } from "../edit-points";
import { runLocalProbe } from "../lib/probe";

const props = defineProps<{ pageId: PageId }>();

type ProbeState =
  | { phase: "idle" }
  | { phase: "pending" }
  | { phase: "success"; httpStatus: number; elapsedMs: number; message: string }
  | { phase: "error"; message: string };

const points = normalizedEditPoints;
const page = computed(() => points.value.copy.pages[props.pageId]);
const state = ref<ProbeState>({ phase: "idle" });

const statusText = computed(() => {
  const copy = points.value.copy;
  const current = state.value;
  if (current.phase === "pending") return copy.probePending;
  if (current.phase === "success") {
    return `${copy.probeSuccess} · ${current.httpStatus} · ${current.elapsedMs} ms · ${current.message}`;
  }
  if (current.phase === "error") return `${copy.probeFailure}. ${current.message}`;
  return copy.probeIdle;
});

function log(message: string, level: "info" | "error" = "info"): void {
  const line = `[test-card] ${page.value.navLabel} · ${message}`.slice(0, 120);
  if (level === "error") console.error(line);
  else console.info(line);
}

function inspectSwatch(): void {
  log("swatch inspected");
}

async function runCheck(): Promise<void> {
  if (state.value.phase === "pending") return;

  log("local check");
  state.value = { phase: "pending" };

  try {
    const result = await runLocalProbe(import.meta.env.BASE_URL);
    state.value = { phase: "success", ...result };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    state.value = { phase: "error", message: reason };
    log(`local check failed: ${reason}`, "error");
  }
}
</script>

<template>
  <section class="panel">
    <div class="panel__hero">
      <p class="panel__identity">{{ page.number }} / {{ page.name }}</p>
      <h1 class="panel__headline">{{ points.headline }}</h1>
      <p class="panel__summary">{{ page.summary }}</p>
    </div>

    <aside class="panel__rail">
      <button class="swatch" type="button" @click="inspectSwatch">
        <span class="swatch__chip" aria-hidden="true"></span>
        <span class="swatch__label">{{ points.copy.swatchLabel }}</span>
      </button>

      <button class="primary" type="button" :disabled="state.phase === 'pending'" @click="runCheck">
        {{ points.copy.primaryLabel }}
      </button>

      <article class="status" :data-phase="state.phase" aria-live="polite">
        <h2 class="status__title">{{ points.copy.statusLabel }}</h2>
        <p class="status__body">{{ statusText }}</p>
      </article>
    </aside>
  </section>
</template>
