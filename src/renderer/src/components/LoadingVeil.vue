<script setup lang="ts">
import { computed } from "vue";
import { useShell } from "../composables/useShell";

const { state } = useShell();

const host = computed(() => {
  try {
    return state.value?.target ? new URL(state.value.target).host : "";
  } catch {
    return "";
  }
});
</script>

<template>
  <div class="veil">
    <div class="veil__spinner" />
    <p class="veil__label">Loading {{ host }}</p>
  </div>
</template>

<style scoped>
.veil {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
  align-items: center;
  justify-content: center;
  background: var(--lb-bg);
}

.veil__spinner {
  width: 26px;
  height: 26px;
  border: 2px solid var(--lb-border);
  border-top-color: var(--lb-progress);
  border-radius: 50%;
  animation: veil-spin 0.8s linear infinite;
}

.veil__label {
  margin: 0;
  color: var(--lb-fg-muted);
  font-size: 12px;
}

@keyframes veil-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
