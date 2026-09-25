<script setup lang="ts">
import { computed } from "vue";
import { useShell } from "../composables/useShell";

const api = window.localbrowser;
const { state, devtools } = useShell();

const host = computed(() => {
  try {
    return state.value?.target ? new URL(state.value.target).host : "";
  } catch {
    return "";
  }
});

function reload(): void {
  void api.runCommand("view.reload");
}

function toggleDevtools(): void {
  void api.runCommand("devtools.toggle");
}

function close(): void {
  void api.closeWindow();
}
</script>

<template>
  <header class="strip">
    <span class="strip__host">{{ host }}</span>
    <div class="strip__actions">
      <button class="strip__btn" title="Reload" @click="reload">⟳</button>
      <button
        class="strip__btn"
        :class="{ 'is-active': devtools.open }"
        title="Toggle DevTools"
        @click="toggleDevtools"
      >
        ⌥
      </button>
      <button class="strip__btn" title="Close" @click="close">✕</button>
    </div>
  </header>
</template>

<style scoped>
.strip {
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px;
  background: var(--lb-bg-elevated);
  border-bottom: 1px solid var(--lb-border);
  user-select: none;
  -webkit-app-region: drag;
  app-region: drag;
}

.strip__host {
  padding-left: 6px;
  color: var(--lb-fg-subtle);
  font-size: 12px;
}

.strip__actions {
  display: flex;
  gap: 4px;
}

.strip__btn {
  -webkit-app-region: no-drag;
  app-region: no-drag;
  width: 26px;
  height: 24px;
  display: grid;
  place-items: center;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  color: var(--lb-fg-muted);
  cursor: pointer;
}

.strip__btn:hover {
  background: var(--lb-hover);
  color: var(--lb-fg);
}

.strip__btn.is-active {
  color: var(--lb-accent);
  border-color: var(--lb-border);
}
</style>
