<script setup lang="ts">
import { computed } from "vue";
import { useShell } from "../composables/useShell";
import { describeTarget } from "../utils/target";

const { loadingTarget } = useShell();

const label = computed(() => describeTarget(loadingTarget.value).label);
</script>

<template>
  <div class="veil">
    <div class="veil__spinner" />
    <p class="veil__label">Loading {{ label }}</p>
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
  background: var(--tb-bg);
}

.veil__spinner {
  width: 26px;
  height: 26px;
  border: 2px solid var(--tb-border);
  border-top-color: var(--tb-progress);
  border-radius: 50%;
  animation: veil-spin 0.8s linear infinite;
}

.veil__label {
  margin: 0;
  max-width: 80vw;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--tb-fg-muted);
  font-size: 12px;
}

@keyframes veil-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
