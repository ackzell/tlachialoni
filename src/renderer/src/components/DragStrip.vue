<script setup lang="ts">
import { computed } from "vue";
import { useShell } from "../composables/useShell";
import { describeTarget } from "../utils/target";

const api = window.tlachialoni;
const { state, devtools } = useShell();

const target = computed(() => state.value?.target ?? "");
const display = computed(() => describeTarget(target.value));

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
    <div class="strip__target" :title="target">
      <svg
        v-if="display.secure"
        class="strip__lock"
        viewBox="0 0 16 16"
        aria-label="https"
        role="img"
      >
        <path
          d="M5 7V5a3 3 0 0 1 6 0v2"
          fill="none"
          stroke="currentColor"
          stroke-width="1.3"
          stroke-linecap="round"
        />
        <rect
          x="3.5"
          y="7"
          width="9"
          height="6.5"
          rx="1.2"
          fill="none"
          stroke="currentColor"
          stroke-width="1.3"
        />
      </svg>
      <svg v-else class="strip__lock" viewBox="0 0 16 16" aria-label="http" role="img">
        <path
          d="M5 7V5a3 3 0 0 1 5.7-1.4"
          fill="none"
          stroke="currentColor"
          stroke-width="1.3"
          stroke-linecap="round"
        />
        <rect
          x="3.5"
          y="7"
          width="9"
          height="6.5"
          rx="1.2"
          fill="none"
          stroke="currentColor"
          stroke-width="1.3"
        />
      </svg>
      <span class="strip__host">{{ display.label }}</span>
    </div>
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
  background: var(--tb-bg-elevated);
  border-bottom: 1px solid var(--tb-border);
  user-select: none;
  -webkit-app-region: drag;
  app-region: drag;
}

.strip__target {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding-left: 6px;
}

.strip__lock {
  width: 13px;
  height: 13px;
  flex: none;
  color: var(--tb-fg-subtle);
}

.strip__host {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--tb-fg-muted);
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
  color: var(--tb-fg-muted);
  cursor: pointer;
  font-size: 0.8rem;
}

.strip__btn:hover {
  background: var(--tb-hover);
  color: var(--tb-fg);
}

.strip__btn.is-active {
  color: var(--tb-accent);
  border-color: var(--tb-border);
}
</style>
